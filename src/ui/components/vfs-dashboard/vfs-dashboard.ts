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
  @state() private files: FileSystemItem[] = [];
  @state() private isProcessing = false;

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
        console.log(`File created via WASM: ${path}`);
        this._refreshFileList();
      }

      if (type === WorkerMessage.ITEMS) {
        const { items } = payload as WorkerResponseType<
          typeof WorkerMessage.ITEMS
        >;
        this.files = items;
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
        this.files = [];
        this.isProcessing = false;
      }
    };
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

          <button
            @click=${this._testWrite}
            ?disabled=${this.status === "Offline" || this.isProcessing}
          >
            ${this.isProcessing ? "Writing..." : "Run WASM Write Test"}
          </button>
        </div>

        <div class="file-list">
          <h3>Files in OPFS</h3>
          ${this.files.length === 0
            ? html`<p>No files found.</p>`
            : html`
                <ul>
                  ${this.files.map(
                    (f) =>
                      html`<li>
                        ${f.name}
                        ${f.type === "file"
                          ? html`<small
                              >(${f.mediaHash.substring(0, 8)}...)</small
                            >`
                          : html`<small>(folder)</small>`}
                      </li>`
                  )}
                </ul>
              `}
        </div>
      </div>
    `;
  }

  private _boot() {
    this.status = "Initializing...";
    this.worker.postMessage({ type: WorkerMessage.BOOT });
  }

  private _testWrite() {
    this.isProcessing = true;
    const fileName = `wasm_log_${Date.now()}.txt`;

    this.worker.postMessage({
      type: WorkerMessage.WRITE_FILE,
      payload: {
        path: fileName,
        content: `Generated at ${new Date().toISOString()} via WASM engine.`,
      },
    });
  }

  private _refreshFileList() {
    this.worker.postMessage({
      type: WorkerMessage.GET_ITEMS,
      payload: { folderId: "root" },
    });
  }
}
