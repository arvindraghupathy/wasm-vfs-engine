#include <emscripten/bind.h>
#include <emscripten/emscripten.h>
#include <emscripten/val.h>
#include <string>

using namespace emscripten;

class VFSManager {
public:
  static val getServiceOrNull() {
    val vfsService = val::global("vfsService");
    if (vfsService.isUndefined() || vfsService.isNull()) {
      emscripten_run_script(
          "console.error('C++: vfsService is undefined or null')");
      return val::null();
    }
    return vfsService;
  }

  static void writeFile(const std::string& path, val content) {
    val vfsService = getServiceOrNull();
    if (vfsService.isNull()) {
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

  static val readFile(const std::string& path) {
    val vfsService = getServiceOrNull();
    if (vfsService.isNull()) {
      val Uint8Array = val::global("Uint8Array");
      return Uint8Array.new_(0);
    }

    return vfsService.call<val>("readFileSync", val(path));
  }

  static void deleteFile(const std::string& path) {
    val vfsService = getServiceOrNull();
    if (vfsService.isNull()) {
      return;
    }

    vfsService.call<void>("deleteFileSync", val(path));
  }

  static void createFolder(const std::string& parentPath,
                           const std::string& folderName) {
    val vfsService = getServiceOrNull();
    if (vfsService.isNull()) {
      return;
    }

    std::string normalizedParent = parentPath.empty() ? "root" : parentPath;
    vfsService.call<void>("createFolderSync", val(normalizedParent),
                          val(folderName));
  }

  static void deleteFolder(const std::string& path) {
    val vfsService = getServiceOrNull();
    if (vfsService.isNull()) {
      return;
    }

    vfsService.call<void>("deleteFolderSync", val(path));
  }
};

EMSCRIPTEN_BINDINGS(vfs_bridge) {
  class_<VFSManager>("VFSManager")
    .class_function("writeFile", &VFSManager::writeFile)
    .class_function("readFile", &VFSManager::readFile)
    .class_function("deleteFile", &VFSManager::deleteFile)
    .class_function("createFolder", &VFSManager::createFolder)
    .class_function("deleteFolder", &VFSManager::deleteFolder);
}
