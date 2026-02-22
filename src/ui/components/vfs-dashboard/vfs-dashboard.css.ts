import { css } from "lit";

export const styles = css`
  :host {
    font-family: sans-serif;
  }
  .card {
    padding: 1.5rem;
    border: 1px solid #ddd;
    border-radius: 12px;
    max-width: 400px;
    background: rgba(255, 255, 255, 0.1);
  }
  .status-bar {
    margin-bottom: 1rem;
  }
  .status {
    font-weight: bold;
  }
  .engine-online {
    color: #2e7d32;
  }
  .offline {
    color: #d32f2f;
  }

  .actions {
    display: flex;
    gap: 10px;
    margin-bottom: 1.5rem;
  }

  button {
    cursor: pointer;
    padding: 10px 16px;
    border-radius: 6px;
    border: 1px solid #007aff;
    background: #007aff;
    color: white;
    font-weight: 500;
  }
  button:disabled {
    background: #ccc;
    border-color: #bbb;
    cursor: not-allowed;
  }

  .file-list {
    border-top: 1px solid #eee;
    padding-top: 1rem;
  }
  ul {
    padding-left: 20px;
  }
  li {
    margin-bottom: 4px;
    font-family: monospace;
  }
`;
