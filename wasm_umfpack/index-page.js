import { loadUmfpack } from './umfpack-loader.js';

const presets = [
    {
        label: '2x2 Demo',
        problem: {
            nRow: 2,
            nCol: 2,
            ap: [0, 1, 3],
            ai: [0, 0, 1],
            ax: [2, 1, 3],
            az: [1, 0, -2],
            bx: [1, 3],
            bz: [2, -1]
        }
    },
    {
        label: '3x3 Upper Triangular',
        problem: {
            nRow: 3,
            nCol: 3,
            ap: [0, 1, 3, 6],
            ai: [0, 0, 1, 0, 1, 2],
            ax: [1, 2, 3, 1, -1, 2],
            az: [0, 1, -1, 2, 0, 1],
            bx: [2, 1, 4],
            bz: [1, -2, 3]
        }
    }
];

let umfpack;

function logConsole(message, type = 'info') {
    const consoleEl = document.getElementById('console');
    const line = document.createElement('p');
    line.className = type;
    line.textContent = '> ' + message;
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
}

function setStatus(message, type = 'loading') {
    const box = document.getElementById('status');
    box.className = 'status-box ' + type;
    box.textContent = message;
    logConsole(message, type === 'error' ? 'error' : 'info');
}

function formatComplexVector(realValues, imagValues) {
    return '[' + realValues.map((value, index) => {
        const imag = imagValues[index];
        const sign = imag >= 0 ? '+' : '-';
        return `${value.toFixed(12)} ${sign} ${Math.abs(imag).toFixed(12)}i`;
    }).join(', ') + ']';
}

function maxAbsDiff(actual, expected) {
    let maxValue = 0;
    for (let index = 0; index < actual.length; index += 1) {
        maxValue = Math.max(maxValue, Math.abs(actual[index] - expected[index]));
    }
    return maxValue;
}

function parseNumberList(text, label, integerOnly = false) {
    const values = text
        .split(/[\s,;]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => Number(item));

    if (values.some((value) => Number.isNaN(value))) {
        throw new Error(`${label} contains a non-numeric value.`);
    }

    if (integerOnly && values.some((value) => !Number.isInteger(value))) {
        throw new Error(`${label} must contain only integers.`);
    }

    return values;
}

function formatRealVector(values) {
    return '[' + values.map((value) => value.toFixed(12)).join(', ') + ']';
}

function readProblemFromForm() {
    const nRow = Number(document.getElementById('nRow').value);
    const nCol = Number(document.getElementById('nCol').value);

    if (!Number.isInteger(nRow) || nRow <= 0) {
        throw new Error('nRow must be a positive integer.');
    }

    if (!Number.isInteger(nCol) || nCol <= 0) {
        throw new Error('nCol must be a positive integer.');
    }

    const ap = parseNumberList(document.getElementById('ap').value, 'Ap', true);
    const ai = parseNumberList(document.getElementById('ai').value, 'Ai', true);
    const ax = parseNumberList(document.getElementById('ax').value, 'Ax');
    const az = parseNumberList(document.getElementById('az').value, 'Az');
    const bx = parseNumberList(document.getElementById('bx').value, 'Bx');
    const bz = parseNumberList(document.getElementById('bz').value, 'Bz');

    return { nRow, nCol, ap, ai, ax, az, bx, bz };
}

function validateProblem(problem) {
    if (problem.nRow !== problem.nCol) {
        throw new Error('Only square matrices are supported by this page.');
    }

    if (problem.ap.length !== problem.nCol + 1) {
        throw new Error('Ap must contain exactly nCol + 1 integers.');
    }

    if (problem.ap[0] !== 0) {
        throw new Error('Ap must start at 0.');
    }

    for (let index = 1; index < problem.ap.length; index += 1) {
        if (problem.ap[index] < problem.ap[index - 1]) {
            throw new Error('Ap must be nondecreasing.');
        }
    }

    const nnz = problem.ap[problem.ap.length - 1];
    if (nnz < 0) {
        throw new Error('Ap[nCol] must be nonnegative.');
    }

    if (problem.ai.length !== nnz || problem.ax.length !== nnz || problem.az.length !== nnz) {
        throw new Error('Ai, Ax, and Az must all have length Ap[nCol].');
    }

    if (problem.bx.length !== problem.nRow || problem.bz.length !== problem.nRow) {
        throw new Error('Bx and Bz must each have length nRow.');
    }

    for (let index = 0; index < problem.ai.length; index += 1) {
        if (problem.ai[index] < 0 || problem.ai[index] >= problem.nRow) {
            throw new Error(`Ai[${index}] is out of row bounds.`);
        }
    }
}

function writeProblemToForm(problem) {
    document.getElementById('nRow').value = String(problem.nRow);
    document.getElementById('nCol').value = String(problem.nCol);
    document.getElementById('ap').value = problem.ap.join(', ');
    document.getElementById('ai').value = problem.ai.join(', ');
    document.getElementById('ax').value = problem.ax.join(', ');
    document.getElementById('az').value = problem.az.join(', ');
    document.getElementById('bx').value = problem.bx.join(', ');
    document.getElementById('bz').value = problem.bz.join(', ');
}

function loadPreset(index) {
    const preset = presets[index];
    if (!preset) {
        return;
    }

    writeProblemToForm(preset.problem);
    logConsole(`Loaded preset: ${preset.label}`, 'info');
}

function computeResidual(problem, solution) {
    const yr = new Array(problem.nRow).fill(0);
    const yi = new Array(problem.nRow).fill(0);

    for (let col = 0; col < problem.nCol; col += 1) {
        for (let p = problem.ap[col]; p < problem.ap[col + 1]; p += 1) {
            const row = problem.ai[p];
            yr[row] += (problem.ax[p] * solution.x[col]) - (problem.az[p] * solution.xz[col]);
            yi[row] += (problem.ax[p] * solution.xz[col]) + (problem.az[p] * solution.x[col]);
        }
    }

    let maxNorm = 0;
    for (let row = 0; row < problem.nRow; row += 1) {
        const diff = Math.abs(yr[row] - problem.bx[row]) + Math.abs(yi[row] - problem.bz[row]);
        maxNorm = Math.max(maxNorm, diff);
    }
    return maxNorm;
}

function ensureReady() {
    if (!umfpack) {
        throw new Error('UMFPACK WebAssembly module is not initialized yet.');
    }
    return umfpack;
}

function runBrowserSolve() {
    try {
        const api = ensureReady();
        const problem = readProblemFromForm();
        validateProblem(problem);

        const result = api.solveComplexSystem(problem);
        const residual = computeResidual(problem, result);
        const isDefaultProblem = JSON.stringify(problem) === JSON.stringify(presets[0].problem);
        const testResidual = isDefaultProblem ? api.callTest('umfpack_zi_demo') : null;
        const passed = residual < 1e-10 && (testResidual === null || testResidual < 1e-10);

        const output = [
            'Matrix A in CSC form:',
            `Ap = ${JSON.stringify(problem.ap)}`,
            `Ai = ${JSON.stringify(problem.ai)}`,
            `Ax = ${JSON.stringify(problem.ax)}`,
            `Az = ${JSON.stringify(problem.az)}`,
            '',
            'Right-hand side b:',
            formatComplexVector(problem.bx, problem.bz),
            '',
            'Computed solution x:',
            formatComplexVector(result.x, result.xz),
            '',
            `Residual max-norm: ${residual.toExponential(6)}`,
            `UMFPACK solve status: ${result.statuses.solve}`,
            `UMFPACK rcond estimate: ${result.info.rcond.toExponential(6)}`,
            `UMFPACK solve flops: ${result.info.solveFlops.toExponential(6)}`,
            `Solution Re(x): ${formatRealVector(result.x)}`,
            `Solution Im(x): ${formatRealVector(result.xz)}`,
            testResidual === null ? 'C-side demo residual: not applicable for custom input.' : `C-side demo residual: ${testResidual.toExponential(6)}`,
            '',
            passed ? 'Validation passed.' : 'Validation failed.'
        ].join('\n');

        const resultBox = document.getElementById('result');
        resultBox.textContent = output;
        resultBox.className = 'result ' + (passed ? 'success' : 'error');

        setStatus(
            passed
                ? 'Complex sparse LU solve completed successfully.'
                : 'Complex sparse LU solve completed, but validation failed.',
            passed ? 'success' : 'error'
        );
    } catch (error) {
        const resultBox = document.getElementById('result');
        resultBox.className = 'result error';
        resultBox.textContent = 'Error: ' + error.message;
        setStatus('Failed to run UMFPACK solve: ' + error.message, 'error');
    }
}

async function initializePage() {
    setStatus('Loading UMFPACK WebAssembly module...', 'loading');
    try {
        umfpack = await loadUmfpack({
            print: (text) => logConsole(String(text), 'info'),
            printErr: (text) => logConsole(String(text), 'error'),
            onAbort: (message) => setStatus('WebAssembly aborted: ' + message, 'error')
        });
        setStatus('UMFPACK WebAssembly module loaded.', 'success');
        document.getElementById('runBtn').disabled = false;
    } catch (error) {
        setStatus('Failed to initialize UMFPACK WebAssembly module: ' + error.message, 'error');
    }
}

window.runBrowserSolve = runBrowserSolve;
window.loadPreset = loadPreset;

initializePage();