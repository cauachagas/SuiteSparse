import createUmfpackModule from './test.mjs';

let umfpackPromise;

function resolveLocateFile(path) {
    return new URL(path, import.meta.url).href;
}

function validateLengths(nRow, nCol, ap, ai, ax, az, bx, bz) {
    if (nRow !== nCol) {
        throw new Error('This minimal wrapper currently expects a square matrix.');
    }

    if (ap.length !== nCol + 1) {
        throw new Error('Ap must have length nCol + 1.');
    }

    const nnz = ap[ap.length - 1];
    if (ai.length !== nnz || ax.length !== nnz || az.length !== nnz) {
        throw new Error('Ai, Ax, and Az must all have length Ap[nCol].');
    }

    if (bx.length !== nRow || bz.length !== nRow) {
        throw new Error('Bx and Bz must both have length nRow.');
    }
}

function createApi(module) {
    function allocInt32(values) {
        const ptr = module._malloc(values.length * Int32Array.BYTES_PER_ELEMENT);
        if (!ptr) {
            throw new Error('Failed to allocate Int32 buffer in the WebAssembly heap.');
        }

        module.HEAP32.set(values, ptr >> 2);
        return {
            ptr,
            length: values.length,
            free() {
                module._free(ptr);
            }
        };
    }

    function allocFloat64(values) {
        const ptr = module._malloc(values.length * Float64Array.BYTES_PER_ELEMENT);
        if (!ptr) {
            throw new Error('Failed to allocate Float64 buffer in the WebAssembly heap.');
        }

        module.HEAPF64.set(values, ptr >> 3);
        return {
            ptr,
            length: values.length,
            free() {
                module._free(ptr);
            }
        };
    }

    function allocZeroFloat64(length) {
        return allocFloat64(new Float64Array(length));
    }

    function readFloat64Array(ptr, length) {
        return Array.from(module.HEAPF64.subarray(ptr >> 3, (ptr >> 3) + length));
    }

    function getInfo(index) {
        return module._wasm_umfpack_get_info(index);
    }

    function callTest(testName) {
        const fn = module[`_test_${testName}`];
        if (typeof fn !== 'function') {
            throw new Error(`Function _test_${testName} not found.`);
        }
        return fn();
    }

    function solveComplexSystem({ nRow, nCol, ap, ai, ax, az, bx, bz, sys = 0 }) {
        validateLengths(nRow, nCol, ap, ai, ax, az, bx, bz);

        module._wasm_umfpack_zi_reset();

        const apAlloc = allocInt32(Int32Array.from(ap));
        const aiAlloc = allocInt32(Int32Array.from(ai));
        const axAlloc = allocFloat64(Float64Array.from(ax));
        const azAlloc = allocFloat64(Float64Array.from(az));
        const bxAlloc = allocFloat64(Float64Array.from(bx));
        const bzAlloc = allocFloat64(Float64Array.from(bz));
        const xAlloc = allocZeroFloat64(nCol);
        const xzAlloc = allocZeroFloat64(nCol);

        try {
            const symbolicStatus = module._wasm_umfpack_zi_symbolic(
                nRow,
                nCol,
                apAlloc.ptr,
                aiAlloc.ptr,
                axAlloc.ptr,
                azAlloc.ptr
            );
            if (symbolicStatus < 0) {
                throw new Error(`umfpack_zi_symbolic failed with status ${symbolicStatus}.`);
            }

            const numericStatus = module._wasm_umfpack_zi_numeric(
                apAlloc.ptr,
                aiAlloc.ptr,
                axAlloc.ptr,
                azAlloc.ptr
            );
            if (numericStatus < 0) {
                throw new Error(`umfpack_zi_numeric failed with status ${numericStatus}.`);
            }

            const solveStatus = module._wasm_umfpack_zi_solve(
                sys,
                apAlloc.ptr,
                aiAlloc.ptr,
                axAlloc.ptr,
                azAlloc.ptr,
                xAlloc.ptr,
                xzAlloc.ptr,
                bxAlloc.ptr,
                bzAlloc.ptr
            );
            if (solveStatus < 0) {
                throw new Error(`umfpack_zi_solve failed with status ${solveStatus}.`);
            }

            return {
                x: readFloat64Array(xAlloc.ptr, nCol),
                xz: readFloat64Array(xzAlloc.ptr, nCol),
                statuses: {
                    symbolic: symbolicStatus,
                    numeric: numericStatus,
                    solve: solveStatus
                },
                info: {
                    status: getInfo(0),
                    rcond: getInfo(67),
                    solveFlops: getInfo(84)
                }
            };
        } finally {
            module._wasm_umfpack_zi_reset();
            xzAlloc.free();
            xAlloc.free();
            bzAlloc.free();
            bxAlloc.free();
            azAlloc.free();
            axAlloc.free();
            aiAlloc.free();
            apAlloc.free();
        }
    }

    return {
        module,
        callTest,
        getInfo,
        solveComplexSystem,
        reset() {
            module._wasm_umfpack_zi_reset();
        }
    };
}

export async function loadUmfpack(options = {}) {
    if (!umfpackPromise) {
        umfpackPromise = createUmfpackModule({
            locateFile: resolveLocateFile,
            print: options.print,
            printErr: options.printErr,
            onAbort: options.onAbort
        }).then((module) => createApi(module));
    }

    return umfpackPromise;
}