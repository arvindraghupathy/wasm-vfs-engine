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
  getSyncHandle(fileId: FileSystemFileId): Promise<FileSystemSyncAccessHandle>;
  createFolderSync(parentId: FileSystemFolderId | null, name: string): void;
  deleteFolderSync(id: FileSystemFolderId): void;
  readFileSync(id: FileSystemFileId): Uint8Array;
  writeFileSync(id: FileSystemFileId, content: Uint8Array): void;
  deleteFileSync(id: FileSystemFileId): void;
  shutdown(): Promise<void>;
}
