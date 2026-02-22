import { css } from "lit";

export const styles = css`
  :host {
    font-family: sans-serif;
  }
  .card {
    padding: 1.5rem;
    border: 1px solid #ddd;
    border-radius: 12px;
    max-width: 960px;
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
    margin-bottom: 1rem;
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

  .actions-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 1.5rem;
  }
  .action-card {
    border: 1px solid #e6e6e6;
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .action-card h4 {
    margin: 0;
  }
  input,
  textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #ccc;
    border-radius: 6px;
    padding: 8px;
    font-family: monospace;
    font-size: 0.9rem;
  }
  textarea {
    min-height: 64px;
    resize: vertical;
  }

  .file-list {
    border-top: 1px solid #eee;
    padding-top: 1rem;
  }
  .file-preview {
    border-top: 1px solid #eee;
    padding-top: 1rem;
    margin-top: 1rem;
  }
  .preview-meta {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
    font-size: 0.9rem;
    color: white;
    font-family: monospace;
  }
  .preview-content {
    margin: 0;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 10px;
    min-height: 120px;
    max-height: 280px;
    overflow: auto;
    background: black;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: monospace;
    font-size: 0.9rem;
  }
  .item-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  h4 {
    margin: 0 0 8px 0;
    font-size: 0.95rem;
  }
  .empty {
    color: #777;
    margin: 0;
  }
  ul {
    padding-left: 20px;
    margin: 0;
  }
  li {
    margin-bottom: 4px;
    font-family: monospace;
  }
  @media (max-width: 640px) {
    .actions-grid {
      grid-template-columns: 1fr;
    }
    .item-columns {
      grid-template-columns: 1fr;
    }
  }
`;
