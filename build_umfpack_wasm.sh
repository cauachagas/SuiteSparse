#!/bin/bash

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

EMCC=${EMCC:-$(command -v emcc || true)}
EMAR=${EMAR:-$(command -v emar || true)}
EMRANLIB=${EMRANLIB:-$(command -v emranlib || true)}

# Single source of truth for the Emscripten CMake toolchain file.
# Accept either EMSCRIPTEN_CMAKE_TOOLCHAIN or EMSCRIPTEN_TOOLCHAIN_FILE for compatibility,
# and fall back to EMSDK or emcc-relative discovery.
TOOLCHAIN_FILE=${EMSCRIPTEN_CMAKE_TOOLCHAIN:-${EMSCRIPTEN_TOOLCHAIN_FILE:-}}

if [ -z "$TOOLCHAIN_FILE" ] && [ -n "${EMSDK:-}" ]; then
  CANDIDATE="${EMSDK}/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake"
  if [ -f "$CANDIDATE" ]; then
    TOOLCHAIN_FILE="$CANDIDATE"
  fi
fi

if [ -z "$TOOLCHAIN_FILE" ] && [ -n "$EMCC" ]; then
  EMCC_DIR=$(cd "$(dirname "$EMCC")" && pwd)
  TOOLCHAIN_CANDIDATE=$(cd "$EMCC_DIR/../upstream/emscripten" 2>/dev/null && pwd || true)
  if [ -n "$TOOLCHAIN_CANDIDATE" ] && [ -f "$TOOLCHAIN_CANDIDATE/cmake/Modules/Platform/Emscripten.cmake" ]; then
    TOOLCHAIN_FILE="$TOOLCHAIN_CANDIDATE/cmake/Modules/Platform/Emscripten.cmake"
  fi
fi

CMAKE_BIN=${CMAKE_BIN:-cmake}

OPENBLAS_ROOT=${OPENBLAS_ROOT:-${ROOT_DIR}/../OpenBLAS}
OPENBLAS_INCLUDE_DIR=${OPENBLAS_INCLUDE_DIR:-${OPENBLAS_ROOT}/wasm_build/include}
OPENBLAS_LIB_DIR=${OPENBLAS_LIB_DIR:-${OPENBLAS_ROOT}/wasm_build/lib}
OPENBLAS_LIBRARY=${OPENBLAS_LIBRARY:-${OPENBLAS_LIB_DIR}/libopenblas.a}
BLAS_VENDOR=${BLAS_VENDOR:-OpenBLAS}

BUILD_DIR=${BUILD_DIR:-${ROOT_DIR}/build-wasm-umfpack}
INSTALL_DIR=${INSTALL_DIR:-${ROOT_DIR}/wasm-install}
BUILD_TYPE=${BUILD_TYPE:-Release}
JOBS=${JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)}
BUILD_BROWSER_MODULE=${BUILD_BROWSER_MODULE:-1}

require_path() {
  local path="$1"
  local label="$2"
  if [ ! -e "$path" ]; then
    echo "Missing ${label}: ${path}" >&2
    exit 1
  fi
}

require_path "$EMCC" "Emscripten C compiler"
require_path "$EMAR" "Emscripten archiver"
require_path "$EMRANLIB" "Emscripten ranlib"
require_path "$TOOLCHAIN_FILE" "Emscripten CMake toolchain"
require_path "$OPENBLAS_LIBRARY" "OpenBLAS static library"
require_path "$OPENBLAS_INCLUDE_DIR/cblas.h" "OpenBLAS CBLAS header"
require_path "$OPENBLAS_INCLUDE_DIR/common.h" "OpenBLAS common header"
require_path "$OPENBLAS_INCLUDE_DIR/config.h" "OpenBLAS config header"

if ! command -v "$CMAKE_BIN" >/dev/null 2>&1; then
  echo "CMake binary not found: ${CMAKE_BIN}" >&2
  echo "Set CMAKE_BIN=/absolute/path/to/cmake if cmake is not on PATH." >&2
  exit 1
fi

mkdir -p "$BUILD_DIR" "$INSTALL_DIR"

echo "Configuring SuiteSparse for a minimal WebAssembly UMFPACK build..."
"$CMAKE_BIN" -S "$ROOT_DIR" -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE="$BUILD_TYPE" \
  -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN_FILE" \
  -DCMAKE_C_COMPILER="$EMCC" \
  -DCMAKE_AR="$EMAR" \
  -DCMAKE_RANLIB="$EMRANLIB" \
  -DCMAKE_INSTALL_PREFIX="$INSTALL_DIR" \
  -DBUILD_SHARED_LIBS=OFF \
  -DBUILD_STATIC_LIBS=ON \
  -DSUITESPARSE_ENABLE_PROJECTS="suitesparse_config;amd;umfpack" \
  -DSUITESPARSE_USE_FORTRAN=OFF \
  -DSUITESPARSE_USE_OPENMP=OFF \
  -DSUITESPARSE_CONFIG_USE_OPENMP=OFF \
  -DSUITESPARSE_USE_CUDA=OFF \
  -DSUITESPARSE_DEMOS=OFF \
  -DSUITESPARSE_USE_STRICT=ON \
  -DUMFPACK_USE_CHOLMOD=OFF \
  -DSUITESPARSE_REQUIRE_BLAS=ON \
  -DSUITESPARSE_USE_64BIT_BLAS=OFF \
  -DBLA_STATIC=ON \
  -DBLA_VENDOR="$BLAS_VENDOR" \
  -DBLA_SIZEOF_INTEGER=4 \
  -DBLAS_LIBRARIES="$OPENBLAS_LIBRARY" \
  -DBLAS_INCLUDE_DIRS="$OPENBLAS_INCLUDE_DIR" \
  "$@"

echo "Building SuiteSparse_config, AMD, and UMFPACK..."
"$CMAKE_BIN" --build "$BUILD_DIR" --config "$BUILD_TYPE" -j"$JOBS"

echo "Installing headers and static libraries into ${INSTALL_DIR}..."
"$CMAKE_BIN" --install "$BUILD_DIR"

if [ "$BUILD_BROWSER_MODULE" = "1" ]; then
  echo "Building browser bundle in ${ROOT_DIR}/wasm_umfpack..."
  make -C "$ROOT_DIR/wasm_umfpack" OPENBLAS_BASE="$OPENBLAS_ROOT" wasm
fi

echo
echo "Minimal UMFPACK WebAssembly build complete."
echo "Artifacts:"
echo "  ${INSTALL_DIR}/lib/libsuitesparseconfig.a"
echo "  ${INSTALL_DIR}/lib/libamd.a"
echo "  ${INSTALL_DIR}/lib/libumfpack.a"
echo "  ${INSTALL_DIR}/include/suitesparse/SuiteSparse_config.h"
echo "  ${INSTALL_DIR}/include/suitesparse/amd.h"
echo "  ${INSTALL_DIR}/include/suitesparse/umfpack.h"
if [ "$BUILD_BROWSER_MODULE" = "1" ]; then
  echo "  ${ROOT_DIR}/wasm_umfpack/test.mjs"
  echo "  ${ROOT_DIR}/wasm_umfpack/test.wasm"
  echo "  ${ROOT_DIR}/wasm_umfpack/index.html"
fi