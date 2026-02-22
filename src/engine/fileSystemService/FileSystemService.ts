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
  readFile(id: FileSystemFileId): Promise<Uint8Array>;
  writeFile(id: FileSystemFileId, content: Uint8Array): Promise<void>;
  createFolder(path: FileSystemFolderId): Promise<void>;
  deleteFile(id: FileSystemFileId): Promise<void>;
  deleteFolder(id: FileSystemFolderId): Promise<void>;
  shutdown(): Promise<void>;
}
