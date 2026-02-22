import { create as createFileSystem } from "./fileSystemService/FileSystemFactory.ts";
import type { FileSystemService } from "./fileSystemService/FileSystemService.ts";
// @ts-ignore
import ModuleInit from "./VFSManager.js";
import {
  WorkerMessage,
  type WorkerMessageType,
  type WorkerRequest,
  type WorkerRequestType,
} from "./workerTypes.ts";

const DirtyKind = {
  UPSERT_FILE: 1,
  DELETE_FILE: 2,
  CREATE_FOLDER: 3,
  DELETE_FOLDER: 4,
} as const;

type DirtyEntry = {
  path: string;
  kind: number;
};

class WorkerMessageHandler {
  private readonly wasmStorageMemoryLimitBytes = 64 * 1024 * 1024; // 64 MiB
  private service?: FileSystemService;
  private wasmModule?: any;
  private handlers?: Partial<
    Record<WorkerMessageType, (payload: unknown) => Promise<void>>
  >;
  private flushTimer?: number;
  private isFlushing = false;
  private flushPending = false;
  private readonly flushDebounceMs = 150;
  private readonly flushRetryMs = 500;

  start() {
    this.registerHandlers();
    this.startListening();
  }

  startListening() {
    self.onmessage = async (e) => {
      const { type, payload } = e.data as WorkerRequest<WorkerMessageType>;
      const handler = this.handlers?.[type];
      if (handler) {
        try {
          await handler(payload);
        } catch (error) {
          if (error instanceof Error) {
            self.postMessage({
              type: WorkerMessage.ERROR,
              payload: { message: error.message, requestType: type },
            });
          }
        }
      }
    };
  }
  registerHandlers() {
    this.handlers = {
      [WorkerMessage.BOOT]: async () => this.handleBoot(),
      [WorkerMessage.WRITE_FILE]: async (payload) =>
        this.handleWriteFile(
          payload as WorkerRequestType<typeof WorkerMessage.WRITE_FILE>
        ),
      [WorkerMessage.READ_FILE]: async (payload) =>
        this.handleReadFile(
          payload as WorkerRequestType<typeof WorkerMessage.READ_FILE>
        ),
      [WorkerMessage.CREATE_FOLDER]: async (payload) =>
        this.handleCreateFolder(
          payload as WorkerRequestType<typeof WorkerMessage.CREATE_FOLDER>
        ),
      [WorkerMessage.DELETE_FILE]: async (payload) =>
        this.handleDeleteFile(
          payload as WorkerRequestType<typeof WorkerMessage.DELETE_FILE>
        ),
      [WorkerMessage.DELETE_FOLDER]: async (payload) =>
        this.handleDeleteFolder(
          payload as WorkerRequestType<typeof WorkerMessage.DELETE_FOLDER>
        ),
      [WorkerMessage.GET_ITEMS]: async (payload) =>
        this.handleGetItems(
          payload as WorkerRequestType<typeof WorkerMessage.GET_ITEMS>
        ),
      [WorkerMessage.SHUTDOWN]: async () => this.handleShutdown(),
    };
  }

  async handleBoot() {
    this.service = await createFileSystem();
    this.wasmModule = await ModuleInit({
      locateFile: (p: string) =>
        p.endsWith(".wasm") ? "/wasm/VFSManager.wasm" : p,
    });
    this.wasmModule.VFSManager.setMemoryLimitBytes(
      this.wasmStorageMemoryLimitBytes
    );
    this.wasmModule.VFSManager.resetState();
    await this.hydrateFromPersistence();

    (self as any).vfsService = this.service;
    self.postMessage({ type: WorkerMessage.READY });
  }

  async handleWriteFile(
    payload: WorkerRequestType<typeof WorkerMessage.WRITE_FILE>
  ) {
    if (!this.service || !this.wasmModule) {
      throw new Error("Engine not initialized");
    }

    const { path, content } = payload ?? {};
    if (!path) {
      throw new Error("Missing file path");
    }

    this.wasmModule.VFSManager.writeFile(path, content);
    this.scheduleFlush();
    self.postMessage({ type: WorkerMessage.SUCCESS, payload: { path } });
  }

  async handleReadFile(
    payload: WorkerRequestType<typeof WorkerMessage.READ_FILE>
  ) {
    if (!this.service || !this.wasmModule) {
      throw new Error("Engine not initialized");
    }

    const path = payload?.path?.trim();
    if (!path) {
      throw new Error("Missing file path");
    }

    const raw = this.wasmModule.VFSManager.readFile(path);
    const bytes = this.toUint8Array(raw);

    const decoder = new TextDecoder("utf-8");
    const content = decoder.decode(bytes);

    self.postMessage({
      type: WorkerMessage.FILE_CONTENT,
      payload: { path, content, size: bytes.byteLength },
    });
  }

  async handleGetItems(
    payload: WorkerRequestType<typeof WorkerMessage.GET_ITEMS>
  ) {
    if (!this.service) {
      throw new Error("Engine not initialized");
    }
    const folderId = payload?.folderId ?? "root";
    const items = await this.service.getItems(folderId);
    self.postMessage({
      type: WorkerMessage.ITEMS,
      payload: { folderId, items },
    });
  }

  async handleCreateFolder(
    payload: WorkerRequestType<typeof WorkerMessage.CREATE_FOLDER>
  ) {
    if (!this.service || !this.wasmModule) {
      throw new Error("Engine not initialized");
    }

    const parentPath = payload?.parentPath ?? "root";
    const folderName = payload?.folderName?.trim();
    if (!folderName) {
      throw new Error("Missing folder name");
    }

    this.wasmModule.VFSManager.createFolder(parentPath, folderName);
    this.scheduleFlush();
    const createdPath =
      parentPath === "root" ? folderName : `${parentPath}/${folderName}`;
    self.postMessage({
      type: WorkerMessage.SUCCESS,
      payload: { path: createdPath },
    });
  }

  async handleDeleteFile(
    payload: WorkerRequestType<typeof WorkerMessage.DELETE_FILE>
  ) {
    if (!this.service || !this.wasmModule) {
      throw new Error("Engine not initialized");
    }

    const path = payload?.path?.trim();
    if (!path) {
      throw new Error("Missing file path");
    }

    this.wasmModule.VFSManager.deleteFile(path);
    this.scheduleFlush();
    self.postMessage({ type: WorkerMessage.SUCCESS, payload: { path } });
  }

  async handleDeleteFolder(
    payload: WorkerRequestType<typeof WorkerMessage.DELETE_FOLDER>
  ) {
    if (!this.service || !this.wasmModule) {
      throw new Error("Engine not initialized");
    }

    const path = payload?.path?.trim();
    if (!path) {
      throw new Error("Missing folder path");
    }

    this.wasmModule.VFSManager.deleteFolder(path);
    this.scheduleFlush();
    self.postMessage({ type: WorkerMessage.SUCCESS, payload: { path } });
  }

  async handleShutdown() {
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    await this.flushDirtyPaths(false);
    await this.service?.shutdown();
    this.service = undefined;
    this.wasmModule = undefined;
    self.postMessage({ type: WorkerMessage.SHUTDOWN });
  }

  private async hydrateFromPersistence() {
    if (!this.service || !this.wasmModule) {
      return;
    }
    await this.hydrateFolder("root");
  }

  private async hydrateFolder(folderId: string): Promise<void> {
    if (!this.service || !this.wasmModule) {
      return;
    }

    const items = await this.service.getItems(folderId);
    for (const item of items) {
      if (item.type === "directory") {
        this.wasmModule.VFSManager.hydrateFolder(item.id);
        await this.hydrateFolder(item.id);
      } else {
        const bytes = await this.service.readFile(item.id);
        this.wasmModule.VFSManager.hydrateFile(item.id, bytes);
      }
    }
  }

  private scheduleFlush(delayMs = this.flushDebounceMs) {
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
    }

    this.flushTimer = self.setTimeout(() => {
      void this.flushDirtyPaths();
    }, delayMs);
  }

  private async flushDirtyPaths(retryOnFailure = true): Promise<void> {
    if (!this.service || !this.wasmModule) {
      return;
    }

    if (this.isFlushing) {
      this.flushPending = true;
      return;
    }

    this.isFlushing = true;
    let hasFailure = false;
    try {
      const entries = this.getDirtyEntries().sort((a, b) =>
        this.compareDirtyEntries(a, b)
      );
      for (const entry of entries) {
        try {
          await this.persistDirtyEntry(entry);
          this.wasmModule.VFSManager.clearDirtyPath(entry.path);
        } catch (error) {
          hasFailure = true;
          console.error(
            "[Worker] Failed to persist dirty entry:",
            entry,
            error
          );
          break;
        }
      }
    } finally {
      this.isFlushing = false;
    }

    if (this.flushPending) {
      this.flushPending = false;
      this.scheduleFlush();
      return;
    }

    if (hasFailure && retryOnFailure) {
      this.scheduleFlush(this.flushRetryMs);
    }
  }

  private compareDirtyEntries(a: DirtyEntry, b: DirtyEntry): number {
    const kindOrder: Record<number, number> = {
      [DirtyKind.CREATE_FOLDER]: 0,
      [DirtyKind.UPSERT_FILE]: 1,
      [DirtyKind.DELETE_FILE]: 2,
      [DirtyKind.DELETE_FOLDER]: 3,
    };

    const kindDiff = (kindOrder[a.kind] ?? 99) - (kindOrder[b.kind] ?? 99);
    if (kindDiff !== 0) {
      return kindDiff;
    }

    const depthA = a.path.split("/").length;
    const depthB = b.path.split("/").length;
    if (a.kind === DirtyKind.CREATE_FOLDER) {
      return depthA - depthB;
    }
    if (a.kind === DirtyKind.DELETE_FOLDER) {
      return depthB - depthA;
    }
    return depthA - depthB;
  }

  private getDirtyEntries(): DirtyEntry[] {
    const raw = this.wasmModule?.VFSManager.getDirtyEntries();
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .map((entry: any) => ({
        path: String(entry?.path ?? ""),
        kind: Number(entry?.kind ?? 0),
      }))
      .filter((entry: DirtyEntry) => entry.path.length > 0);
  }

  private async persistDirtyEntry(entry: DirtyEntry): Promise<void> {
    if (!this.service || !this.wasmModule) {
      return;
    }

    switch (entry.kind) {
      case DirtyKind.UPSERT_FILE: {
        const raw = this.wasmModule.VFSManager.readFile(entry.path);
        const bytes = this.toUint8Array(raw);
        await this.service.writeFile(entry.path, bytes);
        return;
      }
      case DirtyKind.DELETE_FILE: {
        await this.service.deleteFile(entry.path);
        return;
      }
      case DirtyKind.CREATE_FOLDER: {
        await this.service.createFolder(entry.path);
        return;
      }
      case DirtyKind.DELETE_FOLDER: {
        await this.service.deleteFolder(entry.path);
        return;
      }
      default:
        throw new Error(`Unsupported dirty entry kind: ${entry.kind}`);
    }
  }

  private toUint8Array(raw: unknown): Uint8Array {
    if (raw instanceof Uint8Array) {
      return raw;
    }
    if (raw instanceof ArrayBuffer) {
      return new Uint8Array(raw);
    }
    if (ArrayBuffer.isView(raw)) {
      return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    }
    return new Uint8Array();
  }
}

new WorkerMessageHandler().start();
