#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <string>

using namespace emscripten;

class VFSManager {
public:
    static void writeFile(std::string path, std::string content) {
        val Module = val::global("Module");
        // Access the adapter through the service we attached in worker.ts
        val adapter = Module["fsService"]["adapter"];

        // Create a view of the string data
        val Uint8Array = val::global("Uint8Array");
        val data = Uint8Array.new_(val(content));

        // Call the high-performance sync path
        adapter.call<int>("writeSync", path, data);
    }
};

EMSCRIPTEN_BINDINGS(vfs_module) {
    class_<VFSManager>("VFSManager")
        .class_function("writeFile", &VFSManager::writeFile);
}