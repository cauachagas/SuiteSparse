#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "umfpack.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORTED EMSCRIPTEN_KEEPALIVE
#else
#define EXPORTED
#endif

static void *symbolic_handle = NULL;
static void *numeric_handle = NULL;
static double last_info[UMFPACK_INFO];

static void init_control(double control[UMFPACK_CONTROL]) {
    umfpack_zi_defaults(control);
    control[UMFPACK_PRL] = 0;
}

static void clear_info(void) {
    memset(last_info, 0, sizeof(last_info));
}

static double split_complex_abs(double real_value, double imag_value) {
    return fabs(real_value) + fabs(imag_value);
}

static double compute_residual_maxnorm(
    int32_t n,
    const int32_t *ap,
    const int32_t *ai,
    const double *ax,
    const double *az,
    const double *x,
    const double *xz,
    const double *b,
    const double *bz
) {
    double max_norm = 0.0;
    double y_real[8] = {0.0};
    double y_imag[8] = {0.0};

    if (n > 8) {
        return -1.0;
    }

    for (int32_t col = 0; col < n; col += 1) {
        for (int32_t p = ap[col]; p < ap[col + 1]; p += 1) {
            const int32_t row = ai[p];
            y_real[row] += (ax[p] * x[col]) - (az[p] * xz[col]);
            y_imag[row] += (ax[p] * xz[col]) + (az[p] * x[col]);
        }
    }

    for (int32_t row = 0; row < n; row += 1) {
        const double diff_real = y_real[row] - b[row];
        const double diff_imag = y_imag[row] - bz[row];
        const double norm = split_complex_abs(diff_real, diff_imag);
        if (norm > max_norm) {
            max_norm = norm;
        }
    }

    return max_norm;
}

EXPORTED
void wasm_umfpack_zi_free_symbolic(void) {
    if (symbolic_handle != NULL) {
        umfpack_zi_free_symbolic(&symbolic_handle);
        symbolic_handle = NULL;
    }
}

EXPORTED
void wasm_umfpack_zi_free_numeric(void) {
    if (numeric_handle != NULL) {
        umfpack_zi_free_numeric(&numeric_handle);
        numeric_handle = NULL;
    }
}

EXPORTED
void wasm_umfpack_zi_reset(void) {
    wasm_umfpack_zi_free_numeric();
    wasm_umfpack_zi_free_symbolic();
    clear_info();
}

EXPORTED
int wasm_umfpack_zi_symbolic(
    int32_t n_row,
    int32_t n_col,
    const int32_t *ap,
    const int32_t *ai,
    const double *ax,
    const double *az
) {
    double control[UMFPACK_CONTROL];
    const int invalid = UMFPACK_ERROR_argument_missing;

    wasm_umfpack_zi_reset();
    init_control(control);
    clear_info();

    if (!ap || !ai || !ax || !az) {
        last_info[UMFPACK_STATUS] = invalid;
        return invalid;
    }

    return umfpack_zi_symbolic(
        n_row,
        n_col,
        ap,
        ai,
        ax,
        az,
        &symbolic_handle,
        control,
        last_info
    );
}

EXPORTED
int wasm_umfpack_zi_numeric(
    const int32_t *ap,
    const int32_t *ai,
    const double *ax,
    const double *az
) {
    double control[UMFPACK_CONTROL];
    const int invalid = UMFPACK_ERROR_invalid_Symbolic_object;

    init_control(control);
    clear_info();

    if (symbolic_handle == NULL) {
        last_info[UMFPACK_STATUS] = invalid;
        return invalid;
    }

    wasm_umfpack_zi_free_numeric();

    return umfpack_zi_numeric(
        ap,
        ai,
        ax,
        az,
        symbolic_handle,
        &numeric_handle,
        control,
        last_info
    );
}

EXPORTED
int wasm_umfpack_zi_solve(
    int sys,
    const int32_t *ap,
    const int32_t *ai,
    const double *ax,
    const double *az,
    double *x,
    double *xz,
    const double *b,
    const double *bz
) {
    double control[UMFPACK_CONTROL];
    const int invalid = UMFPACK_ERROR_invalid_Numeric_object;

    init_control(control);
    clear_info();

    if (numeric_handle == NULL) {
        last_info[UMFPACK_STATUS] = invalid;
        return invalid;
    }

    return umfpack_zi_solve(
        sys,
        ap,
        ai,
        ax,
        az,
        x,
        xz,
        b,
        bz,
        numeric_handle,
        control,
        last_info
    );
}

EXPORTED
double wasm_umfpack_get_info(int index) {
    if (index < 0 || index >= UMFPACK_INFO) {
        return 0.0;
    }
    return last_info[index];
}

EXPORTED
double test_umfpack_zi_demo(void) {
    static const int32_t n = 2;
    static const int32_t ap[3] = {0, 1, 3};
    static const int32_t ai[3] = {0, 0, 1};
    static const double ax[3] = {2.0, 1.0, 3.0};
    static const double az[3] = {1.0, 0.0, -2.0};
    static const double b[2] = {1.0, 3.0};
    static const double bz[2] = {2.0, -1.0};
    double x[2] = {0.0, 0.0};
    double xz[2] = {0.0, 0.0};
    int status;

    wasm_umfpack_zi_reset();

    status = wasm_umfpack_zi_symbolic(n, n, ap, ai, ax, az);
    if (status < 0) {
        return 1e9;
    }

    status = wasm_umfpack_zi_numeric(ap, ai, ax, az);
    if (status < 0) {
        return 1e9;
    }

    status = wasm_umfpack_zi_solve(UMFPACK_A, ap, ai, ax, az, x, xz, b, bz);
    if (status < 0) {
        return 1e9;
    }

    printf("UMFPACK zi demo solution: x0=(%.12f, %.12f) x1=(%.12f, %.12f)\n", x[0], xz[0], x[1], xz[1]);

    return compute_residual_maxnorm(n, ap, ai, ax, az, x, xz, b, bz);
}