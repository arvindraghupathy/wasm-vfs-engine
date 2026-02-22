import { create as createFileSystem } from "./fileSystemService/FileSystemFactory.ts";
import type { FileSystemService } from "./fileSystemService/FileSystemService.ts";
// @ts-ignore
import ModuleInit from "./guest.js";
import {
  WorkerMessage,
  type WorkerMessageType,
  type WorkerRequest,
  type WorkerRequestType,
} from "./workerTypes.ts";

class WorkerMessageHandler {
  private service?: FileSystemService;
  private wasmModule?: any;
  private handlers?: Partial<
    Record<WorkerMessageType, (payload: unknown) => Promise<void>>
  >;

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
      locateFile: (p: string) => (p.endsWith(".wasm") ? "/wasm/guest.wasm" : p),
    });

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

    await this.service.getSyncHandle(path);
    this.wasmModule.VFSManager.writeFile(path, content);
    self.postMessage({ type: WorkerMessage.SUCCESS, payload: { path } });
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
    const createdPath =
      parentPath === "root" ? folderName : `${parentPath}/${folderName}`;
    self.postMessage({ type: WorkerMessage.SUCCESS, payload: { path: createdPath } });
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
    self.postMessage({ type: WorkerMessage.SUCCESS, payload: { path } });
  }

  async handleShutdown() {
    await this.service?.shutdown();
    this.service = undefined;
    this.wasmModule = undefined;
    self.postMessage({ type: WorkerMessage.SHUTDOWN });
  }
}

new WorkerMessageHandler().start();
