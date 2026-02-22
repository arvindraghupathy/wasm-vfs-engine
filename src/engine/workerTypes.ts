import type { FileSystemItem } from "./fileSystemService/FileSystemService";

export const WorkerMessage = {
  BOOT: "BOOT",
  WRITE_FILE: "WRITE_FILE",
  CREATE_FOLDER: "CREATE_FOLDER",
  DELETE_FILE: "DELETE_FILE",
  DELETE_FOLDER: "DELETE_FOLDER",
  GET_ITEMS: "GET_ITEMS",
  ITEMS: "ITEMS",
  ERROR: "ERROR",
  READY: "READY",
  SUCCESS: "SUCCESS",
  SHUTDOWN: "SHUTDOWN",
} as const;

export type WorkerMessageType =
  (typeof WorkerMessage)[keyof typeof WorkerMessage];

export type WorkerResponseTypeMap = {
  [WorkerMessage.ITEMS]: { items: FileSystemItem[]; folderId: string };
  [WorkerMessage.ERROR]: { message: string; requestType: WorkerMessageType };
  [WorkerMessage.READY]: undefined;
  [WorkerMessage.SHUTDOWN]: undefined;
  [WorkerMessage.SUCCESS]: { path: string };
};

export type WorkerRequestTypeMap = {
  [WorkerMessage.BOOT]: undefined;
  [WorkerMessage.WRITE_FILE]: { path: string; content: string };
  [WorkerMessage.CREATE_FOLDER]: { parentPath?: string; folderName: string };
  [WorkerMessage.DELETE_FILE]: { path: string };
  [WorkerMessage.DELETE_FOLDER]: { path: string };
  [WorkerMessage.GET_ITEMS]: { folderId: string };
  [WorkerMessage.SHUTDOWN]: undefined;
};

export type WorkerResponseType<T extends WorkerMessageType> =
  WorkerResponseTypeMap[Extract<T, keyof WorkerResponseTypeMap>];
export type WorkerRequestType<T extends WorkerMessageType> =
  WorkerRequestTypeMap[Extract<T, keyof WorkerRequestTypeMap>];

export type WorkerResponse<T extends WorkerMessageType> = {
  type: T;
} & (WorkerResponseType<T> extends undefined
  ? {}
  : { payload: WorkerResponseType<T> });

export type WorkerRequest<T extends WorkerMessageType> = {
  type: T;
} & (WorkerRequestType<T> extends undefined
  ? {}
  : { payload: WorkerRequestType<T> });
