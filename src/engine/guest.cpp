#include <emscripten/bind.h>
#include <emscripten/emscripten.h>
#include <emscripten/val.h>
#include <string>

using namespace emscripten;

class VFSManager {
public:
  static void writeFile(const std::string& path, val content) {
    val vfsService = val::global("vfsService");
    if (vfsService.isUndefined() || vfsService.isNull()) {
      emscripten_run_script(
          "console.error('C++: vfsService is undefined or null')");
      return;
    }

    val Uint8Array = val::global("Uint8Array");
    val data = content;
    const std::string contentType = content.typeOf().as<std::string>();

    // Accept both text and binary payloads from JS.
    if (contentType == "string") {
      val TextEncoder = val::global("TextEncoder");
      val encoder = TextEncoder.new_();
      data = encoder.call<val>("encode", content);
    } else {
      val ArrayBuffer = val::global("ArrayBuffer");
      const bool isUint8Array = content.instanceof(Uint8Array);
      const bool isArrayBuffer = content.instanceof(ArrayBuffer);

      if (isArrayBuffer || !isUint8Array) {
        data = Uint8Array.new_(content);
      }
    }

    vfsService.call<void>("writeFileSync", val(path), data);
  }
};

EMSCRIPTEN_BINDINGS(vfs_bridge) {
  class_<VFSManager>("VFSManager")
    .class_function("writeFile", &VFSManager::writeFile);
}
