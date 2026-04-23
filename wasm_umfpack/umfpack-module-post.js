Object.defineProperties(Module, {
    wasmMemory: {
        configurable: true,
        get() {
            return wasmMemory;
        }
    },
    HEAP8: {
        configurable: true,
        get() {
            return HEAP8;
        }
    },
    HEAPU8: {
        configurable: true,
        get() {
            return HEAPU8;
        }
    },
    HEAP32: {
        configurable: true,
        get() {
            return HEAP32;
        }
    },
    HEAPF64: {
        configurable: true,
        get() {
            return HEAPF64;
        }
    }
});