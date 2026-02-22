import type {
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

  async function readFile(id: FileSystemFileId): Promise<Uint8Array> {
    const file = await adapter.readFile(id);
    const bytes = await file.arrayBuffer();
    return new Uint8Array(bytes);
  }

  async function writeFile(
    id: FileSystemFileId,
    content: Uint8Array
  ): Promise<void> {
    const segments = id.split("/");
    const fileName = segments.pop()!;

    const blob = new Blob([Uint8Array.from(content)]);
    await adapter.writeFile(id, blob, {
      name: fileName,
      mediaType: "application/octet-stream",
    });
    systemCache.clear();
  }

  async function createFolder(path: FileSystemFolderId): Promise<void> {
    if (!path || path === "root") {
      return;
    }

    const segments = path.split("/");
    const folderName = segments.pop()!;
    const parentId = segments.join("/") || "root";

    await adapter
      .createDirectory(parentId, {
        type: "directory",
        name: folderName,
      })
      .catch(async () => {
        await adapter.createDirectoryPath(path);
      });
    systemCache.clear();
  }

  async function deleteFile(id: FileSystemFileId): Promise<void> {
    await adapter.deleteFileAsync(id).catch((error) => {
      console.error(`[OPFS] Failed to delete file '${id}':`, error);
    });
    systemCache.clear();
  }

  async function deleteFolder(id: FileSystemFolderId): Promise<void> {
    await adapter.deleteFolderAsync(id).catch((error) => {
      console.error(`[OPFS] Failed to delete folder '${id}':`, error);
    });
    systemCache.clear();
  }

  async function shutdown(): Promise<void> {
    await adapter.shutdown();
  }

  return {
    getItems,
    readFile,
    writeFile,
    createFolder,
    deleteFile,
    deleteFolder,
    shutdown,
  };
}
