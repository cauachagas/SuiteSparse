ROOT := $(abspath ..)
CC := /usr/lib/emscripten/emcc

UMFPACK_INSTALL := $(ROOT)/wasm-install
OPENBLAS_BASE ?= $(ROOT)/../OpenBLAS
OPENBLAS_ROOT := $(OPENBLAS_BASE)/wasm_build
OPENBLAS_SOURCE_ROOT := $(OPENBLAS_BASE)

POST_JS := umfpack-module-post.js

INCLUDE_FLAGS := -I$(UMFPACK_INSTALL)/include/suitesparse -I$(OPENBLAS_ROOT)/include -I$(OPENBLAS_SOURCE_ROOT)
LIBRARIES := \
	$(UMFPACK_INSTALL)/lib/libumfpack.a \
	$(UMFPACK_INSTALL)/lib/libamd.a \
	$(UMFPACK_INSTALL)/lib/libsuitesparseconfig.a \
	$(OPENBLAS_ROOT)/lib/libopenblas.a

WASM_CFLAGS := -O2 -ffast-math $(INCLUDE_FLAGS)
WASM_FLAGS := -s WASM=1 \
	-s MODULARIZE=1 \
	-s EXPORT_ES6=1 \
	-s ENVIRONMENT='web,worker' \
	-s EXPORTED_FUNCTIONS='["_test_umfpack_zi_demo","_wasm_umfpack_zi_symbolic","_wasm_umfpack_zi_numeric","_wasm_umfpack_zi_solve","_wasm_umfpack_zi_reset","_wasm_umfpack_zi_free_symbolic","_wasm_umfpack_zi_free_numeric","_wasm_umfpack_get_info","_umfpack_zi_symbolic","_umfpack_zi_numeric","_umfpack_zi_solve","_malloc","_free"]' \
	-s EXPORTED_RUNTIME_METHODS='["HEAP8","HEAPU8","HEAP32","HEAPF64"]' \
	-s ALLOW_MEMORY_GROWTH=1 \
	-s INITIAL_MEMORY=67108864

.PHONY: all clean wasm

all: wasm

wasm: test.wasm index.html index-page.js umfpack-loader.js
	@echo ""
	@echo "UMFPACK WebAssembly build complete"
	@echo "  - test.mjs"
	@echo "  - test.wasm"
	@echo "  - umfpack-loader.js"
	@echo "  - index.html"

test.wasm: test.c $(UMFPACK_INSTALL)/lib/libumfpack.a $(UMFPACK_INSTALL)/lib/libamd.a $(UMFPACK_INSTALL)/lib/libsuitesparseconfig.a $(OPENBLAS_ROOT)/lib/libopenblas.a
	$(CC) $(WASM_CFLAGS) $(WASM_FLAGS) --post-js $(POST_JS) -o test.mjs test.c $(LIBRARIES)
	@echo "Generated: test.mjs and test.wasm"

clean:
	rm -f test.js test.mjs test.wasm
	@echo "Clean complete"