import type {
  FileSystemDirectory,
  FileSystemFolderId,
  FileSystemFileId,
  FileSystemItem,
  FileSystemService,
} from "./FileSystemService.ts";
import { OPFSAdapter } from "./OPFSAdapter";

/**
 * Creates an OPFS-based FileSystemService implementation
 *
 * Uses Origin Private File System (OPFS) for browser-based file storage.
 * File hashes are computed once during create/write operations and stored
 * in metadata files to avoid recomputation on every access.
 */
export async function create(): Promise<FileSystemService> {
  const adapter = new OPFSAdapter();
  await adapter.initialize();

  const systemCache = new Map<FileSystemFolderId, FileSystemItem[]>();

  const toFolderId = (id: FileSystemFolderId | null): FileSystemFolderId =>
    id ?? "root";

  /**
   * Get items in a directory as an Observable
   */
  async function getItems(
    id: FileSystemFolderId | null
  ): Promise<FileSystemItem[]> {
    const folderId = toFolderId(id);
    if (systemCache.has(folderId)) {
      return systemCache.get(folderId)!;
    }

    const items = await adapter.listItems(folderId);

    systemCache.set(folderId, items);
    return items;
  }

  function writeFileSync(id: FileSystemFileId, content: Uint8Array): void {
    const segments = id.split("/");
    const fileName = segments.pop()!;
    const parentId = segments.join("/") || "root";

    adapter.writeSync(id, content);

    const blob = new Blob([Uint8Array.from(content)]);
    adapter.updateMetadataAsync(parentId, fileName, blob);

    systemCache.delete(parentId);
  }

  async function getSyncHandle(
    fileId: FileSystemFileId
  ): Promise<FileSystemSyncAccessHandle> {
    return adapter.getSyncHandle(fileId);
  }

  function createFolderSync(
    parentId: FileSystemFolderId | null,
    name: string
  ): void {
    const folderId = toFolderId(parentId);
    const folder: Omit<FileSystemDirectory, "id"> = {
      type: "directory",
      name,
    };

    void adapter.createDirectory(folderId, folder).then(
      () => {
        systemCache.delete(folderId);
      },
      (error) => {
        console.error(
          `[OPFS] Failed to create folder '${name}' in '${folderId}':`,
          error
        );
      }
    );
  }

  function readFileSync(id: FileSystemFileId): Uint8Array {
    return adapter.readSync(id);
  }

  function deleteFileSync(id: FileSystemFileId): void {
    const segments = id.split("/");
    segments.pop();
    const parentId = segments.join("/") || "root";

    // Fire-and-forget to keep WASM call path synchronous.
    void adapter.deleteFileAsync(id).catch((error) => {
      console.error(`[OPFS] Failed to delete file '${id}':`, error);
    });
    systemCache.delete(parentId);
  }

  function deleteFolderSync(id: FileSystemFolderId): void {
    const segments = id.split("/");
    segments.pop();
    const parentId = segments.join("/") || "root";

    // Fire-and-forget to keep WASM call path synchronous.
    void adapter.deleteFolderAsync(id).catch((error) => {
      console.error(`[OPFS] Failed to delete folder '${id}':`, error);
    });
    systemCache.delete(parentId);
  }

  async function shutdown(): Promise<void> {
    await adapter.shutdown();
  }

  return {
    getItems,
    writeFileSync,
    createFolderSync,
    readFileSync,
    deleteFileSync,
    deleteFolderSync,
    getSyncHandle,
    shutdown,
  };
}
