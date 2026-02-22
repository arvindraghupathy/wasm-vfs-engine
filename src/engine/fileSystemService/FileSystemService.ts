export type FileSystemFileId = string;
export type FileSystemFolderId = string;
export type FileSystemItemId = FileSystemFileId | FileSystemFolderId;

export type FileSystemFile = {
  readonly type: "file";
  readonly id: FileSystemFileId;
  readonly name: string;
  readonly mediaType: string;
  readonly mediaHash: string;
};

export type FileSystemDirectory = {
  readonly type: "directory";
  readonly id: FileSystemFolderId;
  readonly name: string;
};

export type FileSystemItem = FileSystemFile | FileSystemDirectory;

export type FilePreviewOptions = {
  type: "preview";
  width: number;
  height: number;
};

export type FileProcessOptions = FilePreviewOptions;

export type FileSystemError = {
  readonly type: "error";
  readonly code: "invalid name";
};

export interface FileSystemService {
  getItems(id: FileSystemFolderId | null): Promise<FileSystemItem[]>;
  createFile(
    parentId: FileSystemFolderId | null,
    file: Omit<FileSystemFile, "id">,
    media: Blob
  ): Promise<FileSystemFileId | FileSystemError>;
  createFolder(
    parentId: FileSystemFolderId | null,
    folder: Omit<FileSystemDirectory, "id">
  ): Promise<FileSystemFolderId | FileSystemError>;
  renameItem(
    id: FileSystemItemId,
    name: string
  ): Promise<void | FileSystemError>;
  moveItem(
    id: FileSystemItemId,
    parentId: FileSystemFolderId
  ): Promise<void | FileSystemError>;
  deleteItem(id: FileSystemItemId): Promise<void>;
  getSyncHandle(fileId: FileSystemFileId): Promise<FileSystemSyncAccessHandle>;
  writeFileSync(id: FileSystemFileId, content: Uint8Array): void;
  shutdown(): Promise<void>;
}
