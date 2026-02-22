all:
	# Compile the C++ code to JS Glue + WASM
	emcc -g -O3 --bind \
		-std=c++17 \
		-fexceptions \
		-s MODULARIZE=1 \
		-s EXPORT_ES6=1 \
		-s ALLOW_MEMORY_GROWTH=1 \
		-s WASM_BIGINT=1 \
		src/engine/VFSManager.cpp \
		-o src/engine/VFSManager.js
	
	# Move wasm to public so Vite can serve it
	mkdir -p public/wasm
	mv src/engine/VFSManager.wasm public/wasm/VFSManager.wasm
