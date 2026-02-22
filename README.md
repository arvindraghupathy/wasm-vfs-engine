# WASM VFS Engine (WIP)

Browser VFS prototype with a WASM memory-first model and OPFS persistence.

## Stack

- Lit UI (demo surface)
- Web Worker runtime
- Emscripten/WASM module (`src/engine/VFSManager.cpp`)
- TypeScript persistence service (`FileSystemFactory` + `OPFSAdapter`)
- OPFS (Origin Private File System)

## Runtime Model

1. UI sends typed requests to worker (`src/engine/workerTypes.ts`).
2. Worker mutates in-memory WASM state via `VFSManager` (`src/engine/worker.ts`).
3. Worker schedules async flush of dirty entries to OPFS.
4. Worker returns typed responses/events to UI.

Hot-path reads and writes are in-memory WASM operations. OPFS is persistence.

## Memory Manager (WASM)

`VFSManager` includes a storage memory manager:

- Tracks in-memory bytes used by stored files.
- Enforces max allowed storage bytes.
- Throws when write/hydrate exceeds configured limit.
- Exposes:
  - `setMemoryLimitBytes(limit)`
  - `getMemoryLimitBytes()`
  - `getMemoryUsageBytes()`

Default worker configuration sets limit to `64 MiB` in `src/engine/worker.ts`.

## Message Operations

Requests:

- `BOOT`
- `WRITE_FILE`
- `READ_FILE`
- `CREATE_FOLDER`
- `DELETE_FILE`
- `DELETE_FOLDER`
- `GET_ITEMS`
- `SHUTDOWN`

Responses:

- `READY`
- `SUCCESS`
- `ITEMS`
- `FILE_CONTENT`
- `ERROR`
- `SHUTDOWN`

## Current Status

Implemented:

- Boot + hydrate from OPFS into WASM memory
- Create/write/read/delete file
- Create/delete folder
- Dirty tracking and debounced flush to OPFS
- Root item listing for UI demo

Known gaps:

- `move` is not implemented in OPFS adapter
- Directory rename is not implemented in OPFS adapter
- UI is demo-only and not the core host-binding surface

## Prerequisites

- Node.js + npm
- Emscripten toolchain (`emcc`) available in `PATH`

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Build WASM artifacts:

```bash
make
```

This compiles `src/engine/VFSManager.cpp` to:

- `src/engine/VFSManager.js`
- `public/wasm/VFSManager.wasm`

3. Start dev server:

```bash
npm run dev
```

4. Open the Vite URL (usually `http://localhost:5173`).

## Notes

- Re-run `make` after any change to `src/engine/VFSManager.cpp`.
- TypeScript/UI changes only require Vite rebuild/reload.
