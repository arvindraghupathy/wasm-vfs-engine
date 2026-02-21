import type {
  FileSystemDirectory,
  FileSystemError,
  FileSystemFile,
  FileSystemFileId,
  FileSystemFolderId,
  FileSystemItem,
  FileSystemItemId,
  FileSystemService,
} from "./fileSystemService";
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

  // Cache for observable instances keyed by folder ID
  const systemCache = new Map<FileSystemFolderId, FileSystemItem[]>();

  /** Normalize null to root folder id so adapter and cache use a single canonical value. */
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

  /**
   * Create a new file
   */
  async function createFile(
    parentId: FileSystemFolderId | null,
    file: Omit<FileSystemFile, "id">,
    media: Blob
  ): Promise<FileSystemFileId | FileSystemError> {
    const folderId = toFolderId(parentId);
    try {
      const fileId = await adapter.createFile(folderId, file, media);

      systemCache.delete(folderId);

      return fileId;
    } catch (error) {
      return {
        type: "error",
        code: "invalid name",
      };
    }
  }

  /**
   * Create a new folder
   */
  async function createFolder(
    parentId: FileSystemFolderId | null,
    folder: Omit<FileSystemDirectory, "id">
  ): Promise<FileSystemFolderId | FileSystemError> {
    const folderId = toFolderId(parentId);
    try {
      const newFolderId = await adapter.createDirectory(folderId, folder);

      systemCache.delete(folderId);

      return newFolderId;
    } catch (error) {
      return {
        type: "error",
        code: "invalid name",
      };
    }
  }

  /**
   * Rename an item
   */
  async function renameItem(
    id: FileSystemItemId,
    name: string
  ): Promise<void | FileSystemError> {
    try {
      await adapter.renameItem(id, name);

      // Invalidate cache for parent directory
      const segments = id.split("/");
      segments.pop();
      const parentId = segments.join("/") || "root";
      systemCache.delete(parentId);
    } catch (error) {
      return {
        type: "error",
        code: "invalid name",
      };
    }
  }

  /**
   * Move an item to a different directory
   */
  async function moveItem(
    id: FileSystemItemId,
    parentId: FileSystemFolderId
  ): Promise<void | FileSystemError> {
    try {
      await adapter.moveItem(id, parentId);

      // Invalidate cache for both old and new parent directories
      const segments = id.split("/");
      segments.pop();
      const oldParentId = segments.join("/") || "root";
      systemCache.delete(oldParentId);
      systemCache.delete(parentId);
    } catch (error) {
      return {
        type: "error",
        code: "invalid name",
      };
    }
  }

  /**
   * Delete an item
   */
  async function deleteItem(id: FileSystemItemId): Promise<void> {
    await adapter.deleteItem(id);

    // Invalidate cache for parent directory
    const segments = id.split("/");
    segments.pop();
    const parentId = segments.join("/") || "root";
    systemCache.delete(parentId);
  }

  return {
    getItems,
    createFile,
    createFolder,
    renameItem,
    moveItem,
    deleteItem,
  };
}
