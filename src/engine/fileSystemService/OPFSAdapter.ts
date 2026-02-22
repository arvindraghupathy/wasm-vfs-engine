import type {
  FileSystemDirectory,
  FileSystemFile,
  FileSystemFileId,
  FileSystemFolderId,
  FileSystemItem,
  FileSystemItemId,
} from "./FileSystemService.ts";

import { blobToHash } from "./utils.ts";

/**
 * Metadata stored alongside files to preserve hash and other properties
 */
type FileMetadata = {
  readonly name: string;
  readonly mediaType: string;
  readonly mediaHash: string;
};

type DirectoryMetadata = {
  readonly name: string;
};

type ItemMetadata = FileMetadata | DirectoryMetadata;

/**
 * Low-level OPFS adapter for file system operations
 */
export class OPFSAdapter {
  private root: FileSystemDirectoryHandle | null = null;
  private syncHandles = new Map<string, FileSystemSyncAccessHandle>();

  /**
   * Initialize OPFS root directory
   */
  async initialize(): Promise<void> {
    this.root = await navigator.storage.getDirectory();
  }

  /**
   * Get the root directory handle
   */
  private getRoot(): FileSystemDirectoryHandle {
    if (!this.root) {
      throw new Error("OPFS adapter not initialized. Call initialize() first.");
    }
    return this.root;
  }

  /**
   * Get directory handle by path
   */
  private async getDirectoryHandle(
    folderId: FileSystemFolderId
  ): Promise<FileSystemDirectoryHandle> {
    const root = this.getRoot();
    if (!folderId || folderId === "root") {
      return root;
    }
    // Navigate through path segments
    const segments = folderId.split("/");
    let current = root;
    for (const segment of segments) {
      current = await current.getDirectoryHandle(segment);
    }
    return current;
  }

  /**
   * List all items in a directory
   */
  async listItems(
    folderId: FileSystemFolderId = "root"
  ): Promise<FileSystemItem[]> {
    const dir = await this.getDirectoryHandle(folderId);
    const items: FileSystemItem[] = [];

    // @ts-expect-error - entries() exists at runtime but not in TypeScript types yet
    for await (const [name, handle] of dir.entries()) {
      // Skip metadata files
      if (name.endsWith(".metadata.json")) {
        continue;
      }

      const itemId = folderId === "root" ? name : `${folderId}/${name}`;

      if (handle.kind === "directory") {
        const metadata = await this.readMetadata(dir, name);
        items.push({
          type: "directory",
          id: itemId,
          name: metadata?.name ?? name,
        });
      } else {
        const metadata = await this.readMetadata(dir, name);
        if (metadata && "mediaHash" in metadata) {
          items.push({
            type: "file",
            id: itemId,
            name: metadata.name,
            mediaType: metadata.mediaType,
            mediaHash: metadata.mediaHash,
          });
        }
      }
    }

    return items;
  }

  /**
   * Read metadata for an item
   */
  private async readMetadata(
    dir: FileSystemDirectoryHandle,
    itemName: string
  ): Promise<ItemMetadata | null> {
    try {
      const metadataFile = await dir.getFileHandle(`${itemName}.metadata.json`);
      const file = await metadataFile.getFile();
      const text = await file.text();
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  /**
   * Write metadata for an item
   */
  private async writeMetadata(
    dir: FileSystemDirectoryHandle,
    itemName: string,
    metadata: ItemMetadata
  ): Promise<void> {
    const metadataFile = await dir.getFileHandle(`${itemName}.metadata.json`, {
      create: true,
    });
    const writable = await metadataFile.createWritable();
    await writable.write(JSON.stringify(metadata));
    await writable.close();
  }

  /**
   * Read file content as Blob
   */
  async readFile(fileId: FileSystemFileId): Promise<Blob> {
    const segments = fileId.split("/");
    const fileName = segments.pop()!;
    const folderId = segments.join("/") || "root";

    const dir = await this.getDirectoryHandle(folderId);
    const fileHandle = await dir.getFileHandle(fileName);
    return fileHandle.getFile();
  }

  /**
   * Write file content and metadata
   */
  async writeFile(
    fileId: FileSystemFileId,
    blob: Blob,
    metadata: Omit<FileMetadata, "mediaHash">
  ): Promise<void> {
    const segments = fileId.split("/");
    const fileName = segments.pop()!;
    const folderId = segments.join("/") || "root";

    const dir = await this.getDirectoryHandle(folderId);

    // Write the file
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();

    // Compute and store hash
    const mediaHash = await blobToHash(blob);
    await this.writeMetadata(dir, fileName, {
      ...metadata,
      mediaHash,
    });
  }

  /**
   * Create a new file
   */
  async createFile(
    parentId: FileSystemFolderId,
    file: Omit<FileSystemFile, "id">,
    blob: Blob
  ): Promise<FileSystemFileId> {
    // Validate name
    if (!this.isValidName(file.name)) {
      throw new Error("Invalid file name");
    }

    const dir = await this.getDirectoryHandle(parentId);
    const fileName = this.sanitizeName(file.name);
    const fileId = parentId === "root" ? fileName : `${parentId}/${fileName}`;

    // Write file and metadata
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();

    // Compute and store hash
    const mediaHash = await blobToHash(blob);
    await this.writeMetadata(dir, fileName, {
      name: file.name,
      mediaType: file.mediaType,
      mediaHash,
    });

    return fileId;
  }

  /**
   * Create a new directory
   */
  async createDirectory(
    parentId: FileSystemFolderId,
    folder: Omit<FileSystemDirectory, "id">
  ): Promise<FileSystemFolderId> {
    // Validate name
    if (!this.isValidName(folder.name)) {
      throw new Error("Invalid folder name");
    }

    const parentDir = await this.getDirectoryHandle(parentId);
    const folderName = this.sanitizeName(folder.name);
    const folderId =
      parentId === "root" ? folderName : `${parentId}/${folderName}`;

    await parentDir.getDirectoryHandle(folderName, { create: true });
    await this.writeMetadata(parentDir, folderName, {
      name: folder.name,
    });

    return folderId;
  }

  /**
   * Delete an item (file or directory)
   */
  async deleteItem(itemId: FileSystemItemId): Promise<void> {
    this.closeSyncHandle(itemId);

    const segments = itemId.split("/");
    const itemName = segments.pop()!;
    const parentId = segments.join("/") || "root";

    const parentDir = await this.getDirectoryHandle(parentId);
    await parentDir.removeEntry(itemName, { recursive: true });

    // Try to remove metadata (may not exist)
    try {
      await parentDir.removeEntry(`${itemName}.metadata.json`);
    } catch {
      // Ignore if metadata doesn't exist
    }
  }

  /**
   * Rename an item
   */
  async renameItem(itemId: FileSystemItemId, newName: string): Promise<void> {
    if (!this.isValidName(newName)) {
      throw new Error("Invalid name");
    }

    const segments = itemId.split("/");
    const oldName = segments.pop()!;
    const parentId = segments.join("/") || "root";

    const parentDir = await this.getDirectoryHandle(parentId);

    // Read current metadata
    const metadata = await this.readMetadata(parentDir, oldName);
    if (!metadata) {
      throw new Error("Item not found");
    }

    // Get the handle
    const handle = await (async () => {
      try {
        return await parentDir.getFileHandle(oldName);
      } catch {
        return await parentDir.getDirectoryHandle(oldName);
      }
    })();

    const sanitizedName = this.sanitizeName(newName);

    // For files, we need to copy content; for directories, create new and move children
    if (handle.kind === "file") {
      const file = await (handle as FileSystemFileHandle).getFile();
      const newHandle = await parentDir.getFileHandle(sanitizedName, {
        create: true,
      });
      const writable = await newHandle.createWritable();
      await writable.write(file);
      await writable.close();

      // Update metadata with new name
      await this.writeMetadata(parentDir, sanitizedName, {
        ...metadata,
        name: newName,
      });

      // Remove old file and metadata
      await parentDir.removeEntry(oldName);
      try {
        await parentDir.removeEntry(`${oldName}.metadata.json`);
      } catch {
        // Ignore
      }
    } else {
      // For directories, OPFS doesn't support rename, so we'd need to implement move logic
      // This is complex - for now, throw an error suggesting recreation
      throw new Error("Directory rename not yet implemented");
    }
  }

  /**
   * Move an item to a different directory
   */
  async moveItem(
    _itemId: FileSystemItemId,
    _newParentId: FileSystemFolderId
  ): Promise<void> {
    // OPFS doesn't have native move operation
    // Would need to implement copy + delete
    throw new Error("Move operation not yet implemented");
  }

  async getSyncHandle(fileId: string): Promise<FileSystemSyncAccessHandle> {
    if (this.syncHandles.has(fileId)) return this.syncHandles.get(fileId)!;

    const segments = fileId.split("/");
    const fileName = segments.pop()!;
    const folderId = segments.join("/") || "root";

    const dir = await this.getDirectoryHandle(folderId);
    const fileHandle = await dir.getFileHandle(fileName, { create: true });

    const accessHandle = await fileHandle.createSyncAccessHandle();
    this.syncHandles.set(fileId, accessHandle);
    return accessHandle;
  }

  private closeSyncHandle(fileId: string): void {
    const handle = this.syncHandles.get(fileId);
    if (!handle) return;

    try {
      handle.close();
    } finally {
      this.syncHandles.delete(fileId);
    }
  }

  writeSync(fileId: string, data: Uint8Array): number {
    const handle = this.syncHandles.get(fileId);
    if (!handle) throw new Error("Handle not pre-opened for sync I/O");

    let offset = 0;
    while (offset < data.byteLength) {
      const written = handle.write(data.subarray(offset), { at: offset });
      if (written <= 0) {
        throw new Error(`Failed to write sync data for ${fileId}`);
      }
      offset += written;
    }

    handle.truncate(data.byteLength);
    handle.flush();
    return offset;
  }

  async deleteFileAsync(fileId: string): Promise<void> {
    await this.deleteItem(fileId);
  }

  async deleteFolderAsync(folderId: string): Promise<void> {
    await this.deleteItem(folderId);
  }

  async shutdown(): Promise<void> {
    for (const fileId of this.syncHandles.keys()) {
      this.closeSyncHandle(fileId);
    }
    this.root = null;
  }

  /**
   * Updates metadata for a file after a sync write.
   * This is triggered in the background to avoid blocking the WASM engine.
   */
  async updateMetadataAsync(
    folderId: string,
    fileName: string,
    blob: Blob
  ): Promise<void> {
    try {
      const dir = await this.getDirectoryHandle(folderId);

      // Compute the new hash from the updated content
      const mediaHash = await blobToHash(blob);

      // Construct the metadata object
      const metadata: FileMetadata = {
        name: fileName,
        mediaType: blob.type || "application/octet-stream",
        mediaHash: mediaHash,
      };

      // Use your existing private writeMetadata method
      await this.writeMetadata(dir, fileName, metadata);

      console.log(`[OPFS] Metadata/Hash updated for ${fileName}`);
    } catch (error) {
      console.error(`[OPFS] Failed to update metadata for ${fileName}:`, error);
    }
  }

  /**
   * Synchronous read for WASM engine.
   */
  readSync(fileId: string): Uint8Array {
    const handle = this.syncHandles.get(fileId);
    if (!handle) throw new Error(`No sync handle open for ${fileId}`);

    const size = handle.getSize();
    const buffer = new Uint8Array(size);
    handle.read(buffer, { at: 0 });
    return buffer;
  }

  /**
   * Note: Truly synchronous "creation" from scratch is impossible in OPFS
   * because getFileHandle is async.
   * * We handle this by having WASM request a "File Preparation"
   * which the Worker resolves before WASM enters its sync loop.
   */
  async prepareNewFileSync(
    parentId: string,
    fileName: string
  ): Promise<string> {
    const dir = await this.getDirectoryHandle(parentId);
    // Ensure file exists and get handle
    await dir.getFileHandle(fileName, { create: true });

    const fileId = parentId === "root" ? fileName : `${parentId}/${fileName}`;
    await this.getSyncHandle(fileId); // Pre-cache the sync access handle

    return fileId;
  }

  /**
   * Validate a name
   */
  private isValidName(name: string): boolean {
    if (!name || name.length === 0) return false;
    if (name === "." || name === "..") return false;
    if (name.includes("/") || name.includes("\\")) return false;
    return true;
  }

  /**
   * Sanitize name to create safe file system name
   */
  private sanitizeName(name: string): string {
    return name.replace(/[/\\?%*:|"<>]/g, "_");
  }
}
