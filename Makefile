all:
	# Compile the C++ code to JS Glue + WASM
	emcc -g -O3 --bind \
		-s MODULARIZE=1 \
		-s EXPORT_ES6=1 \
		-s ALLOW_MEMORY_GROWTH=1 \
		-s WASM_BIGINT=1 \
		src/engine/guest.cpp \
		-o src/engine/guest.js
	
	# Move wasm to public so Vite can serve it
	mkdir -p public/wasm
	mv src/engine/guest.wasm public/wasm/guest.wasm