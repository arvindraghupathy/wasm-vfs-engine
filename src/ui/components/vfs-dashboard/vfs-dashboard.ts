import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

@customElement("vfs-dashboard")
export class VfsDashboard extends LitElement {
  @state() private status = "Offline";
  private worker!: Worker;

  constructor() {
    super();
    this.worker = new Worker(new URL("../engine/worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (e) => {
      if (e.data.type === "STATUS_LOG") {
        this.status = e.data.code === 1 ? "Engine Online" : "Error";
      }
    };
  }

  render() {
    return html`
      <div class="card">
        <h2>WASM VFS Monitor</h2>
        <p>Status: <strong>${this.status}</strong></p>
        <button @click=${this._boot}>Initialize Engine</button>
      </div>
    `;
  }

  private _boot() {
    this.worker.postMessage({ type: "BOOT", url: "/wasm/guest.wasm" });
  }

  static styles = css`
    .card {
      padding: 1rem;
      border: 1px solid #ccc;
      border-radius: 8px;
      max-width: 300px;
    }
    button {
      cursor: pointer;
      padding: 8px 16px;
    }
  `;
}
