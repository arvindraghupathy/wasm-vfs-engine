import { create as createFileSystem } from "./fileSystemService/FileSystemFactory.ts";
// @ts-ignore
import ModuleInit from "./guest.js";

let service: any;
let wasmModule: any;

self.onmessage = async (e) => {
  if (e.data.type === "BOOT") {
    // 1. Initialize your Adobe-grade service
    service = await createFileSystem();

    // 2. Initialize WASM
    wasmModule = await ModuleInit({
      locateFile: (p: string) => (p.endsWith(".wasm") ? "/wasm/guest.wasm" : p),
      onRuntimeInitialized: () => {
        // Expose the adapter to Embind
        (wasmModule as any).fsService = service;
      },
    });

    self.postMessage({ type: "READY" });
  }

  if (e.data.type === "WRITE_FILE") {
    const { path, content } = e.data.payload;

    // PRE-FLIGHT: Open the sync handle before WASM tries to use it
    // (Since handle opening is async, we do it here in JS)
    await service.adapter.getSyncHandle(path);

    // Execute via WASM
    wasmModule.VFSManager.writeFile(path, content);
  }
};
