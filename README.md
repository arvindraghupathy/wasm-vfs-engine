# WASM VFS Engine (WIP)

Prototype for a browser VFS pipeline using:

- Lit UI
- Web Worker
- Emscripten/WASM bridge (`guest.cpp`)
- TypeScript file system service
- OPFS (Origin Private File System)


## Current Architecture

1. UI posts typed messages to the worker (`src/engine/workerTypes.ts`).
2. Worker dispatches handlers (`src/engine/worker.ts`).
3. Worker calls WASM exports in `VFSManager` (`src/engine/guest.cpp`).
4. WASM calls into `vfsService` attached on worker global scope.
5. `FileSystemFactory` + `OPFSAdapter` perform OPFS operations.

## What Works Right Now

- Boot/initialize worker + wasm module
- Create/write file (`WRITE_FILE`)
- Create folder (`CREATE_FOLDER`)
- Delete file (`DELETE_FILE`)
- Delete folder (`DELETE_FOLDER`)
- List root items (`GET_ITEMS`) and render files/folders in UI

## Known Limitations

- WIP integration: some operations are fire-and-forget async internally
- Item list refresh can be eventually consistent (not always immediate)
- UI currently lists only `root` (no folder navigation yet)
- `readFile` exists in WASM bridge but is not wired to worker/UI messages yet
- `move` is not implemented in OPFS adapter
- Directory rename is not implemented in OPFS adapter

## Prerequisites

- Node.js + npm
- Emscripten (`emcc`) available in `PATH`

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Build wasm artifacts:

```bash
make
```

This compiles `src/engine/guest.cpp` to:

- `src/engine/guest.js`
- `public/wasm/guest.wasm`

3. Start dev server:

```bash
npm run dev
```

4. Open the Vite URL (usually `http://localhost:5173`).

## Rebuild Notes

- Re-run `make` every time `src/engine/guest.cpp` changes.
- TypeScript/UI changes only need the Vite dev server.
