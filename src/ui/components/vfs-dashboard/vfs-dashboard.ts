import { LitElement, html } from "lit";
import { styles } from "./vfs-dashboard.css.ts";
import { customElement, state } from "lit/decorators.js";
import {
  WorkerMessage,
  type WorkerMessageType,
  type WorkerResponse,
  type WorkerResponseType,
} from "../../../engine/workerTypes.ts";
import type { FileSystemItem } from "../../../engine/fileSystemService/FileSystemService.ts";

@customElement("vfs-dashboard")
export class VfsDashboard extends LitElement {
  static styles = styles;

  @state() private status = "Offline";
  @state() private items: FileSystemItem[] = [];
  @state() private isProcessing = false;
  @state() private createFilePath = "notes.txt";
  @state() private createFileContent = "";
  @state() private deleteFilePath = "";
  @state() private createFolderParent = "root";
  @state() private createFolderName = "";
  @state() private deleteFolderPath = "";

  private worker!: Worker;

  constructor() {
    super();
    this.worker = new Worker(
      new URL("../../../engine/worker.ts", import.meta.url),
      { type: "module" }
    );

    this.worker.onmessage = (e) => {
      const { type, payload } = e.data as WorkerResponse<WorkerMessageType>;

      if (type === WorkerMessage.READY) {
        this.status = "Engine Online";
        this._refreshFileList();
      }

      if (type === WorkerMessage.SUCCESS) {
        const { path } = payload as WorkerResponseType<
          typeof WorkerMessage.SUCCESS
        >;
        this.isProcessing = false;
        console.log(`Operation succeeded: ${path}`);
        this._refreshFileList();
      }

      if (type === WorkerMessage.ITEMS) {
        const { items } = payload as WorkerResponseType<
          typeof WorkerMessage.ITEMS
        >;
        this.items = items;
      }

      if (type === WorkerMessage.ERROR) {
        const { message, requestType } = payload as WorkerResponseType<
          typeof WorkerMessage.ERROR
        >;
        this.isProcessing = false;
        this.status = "Error";
        console.error(`[Worker ${requestType}] ${message}`);
      }

      if (type === WorkerMessage.SHUTDOWN) {
        this.status = "Offline";
        this.items = [];
        this.isProcessing = false;
      }
    };
  }

  private get folders() {
    return this.items.filter((item) => item.type === "directory");
  }

  private get files() {
    return this.items.filter((item) => item.type === "file");
  }

  render() {
    return html`
      <div class="card">
        <h2>WASM VFS Monitor</h2>
        <div class="status-bar">
          Status:
          <span class="status ${this.status.toLowerCase().replace(" ", "-")}"
            >${this.status}</span
          >
        </div>

        <div class="actions">
          <button @click=${this._boot} ?disabled=${this.status !== "Offline"}>
            Initialize Engine
          </button>
        </div>

        <div class="actions-grid">
          <section class="action-card">
            <h4>Create File</h4>
            <input
              .value=${this.createFilePath}
              @input=${(e: Event) =>
                (this.createFilePath = (e.target as HTMLInputElement).value)}
              placeholder="file path e.g. logs/app.txt"
            />
            <textarea
              .value=${this.createFileContent}
              @input=${(e: Event) =>
                (this.createFileContent = (e.target as HTMLTextAreaElement).value)}
              placeholder="file content"
            ></textarea>
            <button
              @click=${this._createFile}
              ?disabled=${this.status === "Offline" || this.isProcessing}
            >
              Create File
            </button>
          </section>

          <section class="action-card">
            <h4>Delete File</h4>
            <input
              .value=${this.deleteFilePath}
              @input=${(e: Event) =>
                (this.deleteFilePath = (e.target as HTMLInputElement).value)}
              placeholder="file path to delete"
            />
            <button
              @click=${this._deleteFile}
              ?disabled=${this.status === "Offline" || this.isProcessing}
            >
              Delete File
            </button>
          </section>

          <section class="action-card">
            <h4>Create Folder</h4>
            <input
              .value=${this.createFolderParent}
              @input=${(e: Event) =>
                (this.createFolderParent = (e.target as HTMLInputElement).value)}
              placeholder="parent path (root)"
            />
            <input
              .value=${this.createFolderName}
              @input=${(e: Event) =>
                (this.createFolderName = (e.target as HTMLInputElement).value)}
              placeholder="folder name"
            />
            <button
              @click=${this._createFolder}
              ?disabled=${this.status === "Offline" || this.isProcessing}
            >
              Create Folder
            </button>
          </section>

          <section class="action-card">
            <h4>Delete Folder</h4>
            <input
              .value=${this.deleteFolderPath}
              @input=${(e: Event) =>
                (this.deleteFolderPath = (e.target as HTMLInputElement).value)}
              placeholder="folder path to delete"
            />
            <button
              @click=${this._deleteFolder}
              ?disabled=${this.status === "Offline" || this.isProcessing}
            >
              Delete Folder
            </button>
          </section>
        </div>

        <div class="file-list">
          <h3>Items in OPFS</h3>
          <div class="item-columns">
            <section>
              <h4>Folders (${this.folders.length})</h4>
              ${this.folders.length === 0
                ? html`<p class="empty">No folders.</p>`
                : html`
                    <ul>
                      ${this.folders.map(
                        (folder) => html`<li>[DIR] ${folder.name}</li>`
                      )}
                    </ul>
                  `}
            </section>
            <section>
              <h4>Files (${this.files.length})</h4>
              ${this.files.length === 0
                ? html`<p class="empty">No files.</p>`
                : html`
                    <ul>
                      ${this.files.map(
                        (file) =>
                          html`<li>
                            [FILE] ${file.name}
                            <small>(${file.mediaHash.substring(0, 8)}...)</small>
                          </li>`
                      )}
                    </ul>
                  `}
            </section>
          </div>
        </div>
      </div>
    `;
  }

  private _boot() {
    this.status = "Initializing...";
    this.worker.postMessage({ type: WorkerMessage.BOOT });
  }

  private _createFile() {
    const path = this.createFilePath.trim();
    if (!path) return;

    this.isProcessing = true;
    this.worker.postMessage({
      type: WorkerMessage.WRITE_FILE,
      payload: {
        path,
        content: this.createFileContent,
      },
    });
  }

  private _deleteFile() {
    const path = this.deleteFilePath.trim();
    if (!path) return;

    this.isProcessing = true;
    this.worker.postMessage({
      type: WorkerMessage.DELETE_FILE,
      payload: { path },
    });
  }

  private _createFolder() {
    const folderName = this.createFolderName.trim();
    if (!folderName) return;

    this.isProcessing = true;
    this.worker.postMessage({
      type: WorkerMessage.CREATE_FOLDER,
      payload: {
        parentPath: this.createFolderParent.trim() || "root",
        folderName,
      },
    });
  }

  private _deleteFolder() {
    const path = this.deleteFolderPath.trim();
    if (!path) return;

    this.isProcessing = true;
    this.worker.postMessage({
      type: WorkerMessage.DELETE_FOLDER,
      payload: { path },
    });
  }

  private _refreshFileList() {
    this.worker.postMessage({
      type: WorkerMessage.GET_ITEMS,
      payload: { folderId: "root" },
    });
  }
}
