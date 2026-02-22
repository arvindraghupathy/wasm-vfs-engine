#include <cstddef>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>
#include <emscripten/bind.h>
#include <emscripten/val.h>

using namespace emscripten;

enum DirtyKind {
  UPSERT_FILE = 1,
  DELETE_FILE = 2,
  CREATE_FOLDER = 3,
  DELETE_FOLDER = 4,
};

class VFSManager {
public:
  static void resetState() {
    files.clear();
    folders.clear();
    dirtyEntries.clear();
    memoryUsedBytes = 0;
    folders.insert("root");
  }

  static void setMemoryLimitBytes(std::size_t limitBytes) {
    if (limitBytes == 0) {
      throw std::runtime_error("WASM storage memory limit must be > 0 bytes");
    }
    memoryLimitBytes = limitBytes;
    if (memoryUsedBytes > memoryLimitBytes) {
      throw std::runtime_error("WASM storage memory already exceeds new limit");
    }
  }

  static std::size_t getMemoryLimitBytes() {
    return memoryLimitBytes;
  }

  static std::size_t getMemoryUsageBytes() {
    return memoryUsedBytes;
  }

  static void writeFile(const std::string& path, val content) {
    ensureInitialized();
    if (path.empty() || path == "root") {
      return;
    }

    addFolderChain(parentPath(path));

    const val bytes = toUint8Array(content);
    const int length = bytes["length"].as<int>();
    const std::size_t newSize = static_cast<std::size_t>(length);
    const std::size_t oldSize = getFileSize(path);
    ensureCapacity(path, oldSize, newSize);

    std::vector<uint8_t> buffer(length, 0);
    if (length > 0) {
      val view = val(typed_memory_view(length, buffer.data()));
      view.call<void>("set", bytes);
    }

    files[path] = std::move(buffer);
    memoryUsedBytes = (memoryUsedBytes - oldSize) + newSize;
    dirtyEntries[path] = UPSERT_FILE;
  }

  static val readFile(const std::string& path) {
    ensureInitialized();
    const val Uint8Array = val::global("Uint8Array");
    const auto found = files.find(path);
    if (found == files.end()) {
      return Uint8Array.new_(0);
    }

    const std::vector<uint8_t>& source = found->second;
    const int length = static_cast<int>(source.size());
    val out = Uint8Array.new_(length);
    if (length > 0) {
      val sourceView = val(typed_memory_view(length, source.data()));
      out.call<void>("set", sourceView);
    }
    return out;
  }

  static void deleteFile(const std::string& path) {
    ensureInitialized();
    if (path.empty() || path == "root") {
      return;
    }

    const std::size_t oldSize = getFileSize(path);
    files.erase(path);
    memoryUsedBytes -= oldSize;
    dirtyEntries[path] = DELETE_FILE;
  }

  static void createFolder(const std::string& parentPath,
                           const std::string& folderName) {
    ensureInitialized();
    if (folderName.empty()) {
      return;
    }

    std::string normalizedParent =
        parentPath.empty() ? "root" : parentPath;
    const std::string fullPath =
        normalizedParent == "root" ? folderName
                                   : normalizedParent + "/" + folderName;
    addFolderChain(fullPath);
    dirtyEntries[fullPath] = CREATE_FOLDER;
  }

  static void deleteFolder(const std::string& path) {
    ensureInitialized();
    if (path.empty() || path == "root") {
      return;
    }

    for (auto it = files.begin(); it != files.end();) {
      if (it->first == path || startsWithPath(it->first, path)) {
        memoryUsedBytes -= it->second.size();
        it = files.erase(it);
      } else {
        ++it;
      }
    }

    for (auto it = folders.begin(); it != folders.end();) {
      if (*it == path || startsWithPath(*it, path)) {
        it = folders.erase(it);
      } else {
        ++it;
      }
    }
    folders.insert("root");

    for (auto it = dirtyEntries.begin(); it != dirtyEntries.end();) {
      if (it->first == path || startsWithPath(it->first, path)) {
        it = dirtyEntries.erase(it);
      } else {
        ++it;
      }
    }
    dirtyEntries[path] = DELETE_FOLDER;
  }

  static void hydrateFile(const std::string& path, val content) {
    ensureInitialized();
    if (path.empty() || path == "root") {
      return;
    }

    addFolderChain(parentPath(path));
    const val bytes = toUint8Array(content);
    const int length = bytes["length"].as<int>();
    const std::size_t newSize = static_cast<std::size_t>(length);
    const std::size_t oldSize = getFileSize(path);
    ensureCapacity(path, oldSize, newSize);

    std::vector<uint8_t> buffer(length, 0);
    if (length > 0) {
      val view = val(typed_memory_view(length, buffer.data()));
      view.call<void>("set", bytes);
    }
    files[path] = std::move(buffer);
    memoryUsedBytes = (memoryUsedBytes - oldSize) + newSize;
  }

  static void hydrateFolder(const std::string& path) {
    ensureInitialized();
    if (path.empty() || path == "root") {
      return;
    }
    addFolderChain(path);
  }

  static val getDirtyEntries() {
    ensureInitialized();
    val out = val::array();
    int index = 0;
    for (const auto& entry : dirtyEntries) {
      val item = val::object();
      item.set("path", entry.first);
      item.set("kind", entry.second);
      out.set(index++, item);
    }
    return out;
  }

  static void clearDirtyPath(const std::string& path) {
    dirtyEntries.erase(path);
  }

private:
  static constexpr std::size_t kDefaultMemoryLimitBytes = 64u * 1024u * 1024u;
  static inline std::unordered_map<std::string, std::vector<uint8_t>> files{};
  static inline std::unordered_set<std::string> folders{};
  static inline std::unordered_map<std::string, int> dirtyEntries{};
  static inline std::size_t memoryUsedBytes = 0;
  static inline std::size_t memoryLimitBytes = kDefaultMemoryLimitBytes;

  static std::size_t getFileSize(const std::string& path) {
    const auto found = files.find(path);
    if (found == files.end()) {
      return 0;
    }
    return found->second.size();
  }

  static void ensureCapacity(const std::string& path,
                             std::size_t oldSize,
                             std::size_t newSize) {
    if (newSize <= oldSize) {
      return;
    }

    const std::size_t delta = newSize - oldSize;
    if (memoryUsedBytes <= memoryLimitBytes &&
        delta <= (memoryLimitBytes - memoryUsedBytes)) {
      return;
    }

    throw std::runtime_error(
        "WASM storage memory limit exceeded while writing '" + path +
        "' (used=" + std::to_string(memoryUsedBytes) +
        ", requestedDelta=" + std::to_string(delta) +
        ", limit=" + std::to_string(memoryLimitBytes) + ")");
  }

  static void ensureInitialized() {
    if (folders.find("root") == folders.end()) {
      folders.insert("root");
    }
  }

  static std::string parentPath(const std::string& path) {
    const size_t pos = path.find_last_of('/');
    if (pos == std::string::npos) {
      return "root";
    }
    return path.substr(0, pos);
  }

  static bool startsWithPath(const std::string& value,
                             const std::string& prefix) {
    if (value.size() <= prefix.size()) {
      return false;
    }
    if (value.compare(0, prefix.size(), prefix) != 0) {
      return false;
    }
    return value[prefix.size()] == '/';
  }

  static void addFolderChain(const std::string& folderPath) {
    if (folderPath.empty() || folderPath == "root") {
      folders.insert("root");
      return;
    }

    size_t start = 0;
    std::string current;
    while (start < folderPath.size()) {
      const size_t slash = folderPath.find('/', start);
      const std::string segment = folderPath.substr(
          start, slash == std::string::npos ? std::string::npos : slash - start);
      if (!segment.empty()) {
        current = current.empty() ? segment : current + "/" + segment;
        folders.insert(current);
      }
      if (slash == std::string::npos) {
        break;
      }
      start = slash + 1;
    }
  }

  static val toUint8Array(val content) {
    const val Uint8Array = val::global("Uint8Array");
    const val ArrayBuffer = val::global("ArrayBuffer");

    val data = content;
    const std::string contentType = content.typeOf().as<std::string>();
    if (contentType == "string") {
      val TextEncoder = val::global("TextEncoder");
      val encoder = TextEncoder.new_();
      data = encoder.call<val>("encode", content);
      return data;
    }

    const bool isUint8Array = content.instanceof(Uint8Array);
    const bool isArrayBuffer = content.instanceof(ArrayBuffer);
    if (isArrayBuffer || !isUint8Array) {
      data = Uint8Array.new_(content);
    }
    return data;
  }
};

EMSCRIPTEN_BINDINGS(vfs_bridge) {
  class_<VFSManager>("VFSManager")
    .class_function("resetState", &VFSManager::resetState)
    .class_function("setMemoryLimitBytes", &VFSManager::setMemoryLimitBytes)
    .class_function("getMemoryLimitBytes", &VFSManager::getMemoryLimitBytes)
    .class_function("getMemoryUsageBytes", &VFSManager::getMemoryUsageBytes)
    .class_function("writeFile", &VFSManager::writeFile)
    .class_function("readFile", &VFSManager::readFile)
    .class_function("deleteFile", &VFSManager::deleteFile)
    .class_function("createFolder", &VFSManager::createFolder)
    .class_function("deleteFolder", &VFSManager::deleteFolder)
    .class_function("hydrateFile", &VFSManager::hydrateFile)
    .class_function("hydrateFolder", &VFSManager::hydrateFolder)
    .class_function("getDirtyEntries", &VFSManager::getDirtyEntries)
    .class_function("clearDirtyPath", &VFSManager::clearDirtyPath);
}
