import type { JudgeStatus, RunRequest, RunResponse, RunTestCaseResult } from './runnerApi';

const PYODIDE_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.27.5/full/';
const MAX_OUTPUT_BYTES = 256 * 1024;

function normalizeOutput(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n+$/g, '');
}

function judgeOutput(
  stdout: string,
  expectedOutput: string | undefined,
  exitCode: number | null
): JudgeStatus {
  if (exitCode !== null && exitCode !== 0) return 'RE';
  if (expectedOutput !== undefined && expectedOutput.trim() !== '') {
    return normalizeOutput(stdout) === normalizeOutput(expectedOutput) ? 'AC' : 'WA';
  }
  return 'OK';
}

function truncateText(text: string): string {
  return text.length > MAX_OUTPUT_BYTES ? text.slice(0, MAX_OUTPUT_BYTES) : text;
}

/**
 * Inline Web Worker source that loads Pyodide once and executes Python test cases
 * with isolated stdin/stdout/stderr. Terminating the worker enforces hard TLE
 * protection even on infinite loops.
 */
const PYODIDE_WORKER_SOURCE = `
let pyodidePromise = null;

async function ensurePyodide() {
  if (!pyodidePromise) {
    importScripts('${PYODIDE_INDEX_URL}pyodide.js');
    pyodidePromise = loadPyodide({ indexURL: '${PYODIDE_INDEX_URL}' });
  }
  return pyodidePromise;
}

self.onmessage = async (event) => {
  const { id, mode, code, stdin } = event.data;
  try {
    const pyodide = await ensurePyodide();
    if (mode === 'check') {
      const start = performance.now();
      pyodide.globals.set('__ab_code', code);
      try {
        pyodide.runPython("compile(__ab_code, 'main.py', 'exec')");
        self.postMessage({ id, ok: true, timeMs: Math.round(performance.now() - start) });
      } catch (err) {
        self.postMessage({
          id,
          ok: false,
          error: String(err && err.message ? err.message : err),
          timeMs: Math.round(performance.now() - start),
        });
      }
      return;
    }

    pyodide.globals.set('__ab_code', code);
    pyodide.globals.set('__ab_stdin', stdin ?? '');
    const start = performance.now();
    const res = pyodide.runPython(\`
import io, sys, traceback
_orig_in, _orig_out, _orig_err = sys.stdin, sys.stdout, sys.stderr
_out = io.StringIO()
_err = io.StringIO()
sys.stdin = io.StringIO(__ab_stdin)
sys.stdout = _out
sys.stderr = _err
_exit = 0
try:
    _ns = {'__name__': '__main__'}
    exec(compile(__ab_code, 'main.py', 'exec'), _ns)
except SystemExit as _e:
    _exit = int(_e.code) if isinstance(_e.code, int) else (0 if _e.code is None else 1)
except BaseException:
    _exit = 1
    traceback.print_exc(file=_err)
finally:
    sys.stdin, sys.stdout, sys.stderr = _orig_in, _orig_out, _orig_err
(_out.getvalue(), _err.getvalue(), _exit)
\`);
    const elapsed = Math.round(performance.now() - start);
    const [stdout, stderr, exitCode] = res.toJs();
    res.destroy();
    self.postMessage({ id, ok: true, stdout, stderr, exitCode, timeMs: elapsed });
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: String(err && err.message ? err.message : err),
      timeMs: 0,
    });
  }
};
`;

let pyWorker: Worker | null = null;
let pyWorkerUrl: string | null = null;
let pyMsgSeq = 1;

function getPyodideWorker(): Worker {
  if (!pyWorker) {
    if (!pyWorkerUrl) {
      const blob = new Blob([PYODIDE_WORKER_SOURCE], { type: 'application/javascript' });
      pyWorkerUrl = URL.createObjectURL(blob);
    }
    pyWorker = new Worker(pyWorkerUrl);
  }
  return pyWorker;
}

function resetPyodideWorker(): void {
  if (pyWorker) {
    pyWorker.terminate();
    pyWorker = null;
  }
}

function callPyodideWorker<T>(
  payload: Record<string, unknown>,
  timeoutMs: number
): Promise<T | { timedOut: true }> {
  return new Promise((resolve) => {
    const worker = getPyodideWorker();
    const id = pyMsgSeq++;
    let settled = false;

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resetPyodideWorker();
      resolve({ timedOut: true });
    }, timeoutMs);

    const onMessage = (e: MessageEvent) => {
      if (!e.data || e.data.id !== id) return;
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      resolve(e.data as T);
    };

    const onError = (err: ErrorEvent) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      resetPyodideWorker();
      resolve({
        ok: false,
        error: err.message || 'Pyodide Worker 加载失败（请检查网络连接）',
        timeMs: 0,
      } as T);
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ ...payload, id });
  });
}

/**
 * Runs Python 3 directly inside the browser using Pyodide WebAssembly (zero backend!).
 */
export async function runPythonInBrowser(request: RunRequest): Promise<RunResponse> {
  const timeLimitMs = Math.max(100, Math.min(10000, request.timeLimitMs ?? 2000));

  // First check loads Pyodide if not yet cached, so allow generous init timeout (30s)
  const check = await callPyodideWorker<{
    ok: boolean;
    error?: string;
    timeMs: number;
  }>({ mode: 'check', code: request.code }, 30000);

  if ('timedOut' in check) {
    return {
      compileOk: false,
      compileError: 'Pyodide 浏览器 Python 运行时初始化超时，请检查网络连接后重试。',
      compileTimeMs: 30000,
      results: [],
    };
  }

  if (!check.ok) {
    return {
      compileOk: false,
      compileError: check.error || 'Python 语法错误',
      compileTimeMs: check.timeMs,
      results: [],
    };
  }

  const results: RunTestCaseResult[] = [];
  for (const tc of request.testCases) {
    const exec = await callPyodideWorker<{
      ok: boolean;
      stdout?: string;
      stderr?: string;
      exitCode?: number;
      error?: string;
      timeMs: number;
    }>({ mode: 'run', code: request.code, stdin: tc.input }, timeLimitMs + 250);

    if ('timedOut' in exec) {
      results.push({
        id: tc.id,
        status: 'TLE',
        stdout: '',
        stderr: `执行超过时间限制 (${timeLimitMs}ms)`,
        exitCode: null,
        timeMs: timeLimitMs,
      });
      continue;
    }

    if (!exec.ok) {
      results.push({
        id: tc.id,
        status: 'RE',
        stdout: '',
        stderr: truncateText(exec.error || '运行异常'),
        exitCode: 1,
        timeMs: exec.timeMs,
      });
      continue;
    }

    const stdout = truncateText(exec.stdout ?? '');
    const stderr = truncateText(exec.stderr ?? '');
    const exitCode = exec.exitCode ?? 0;
    results.push({
      id: tc.id,
      status: judgeOutput(stdout, tc.expectedOutput, exitCode),
      stdout,
      stderr,
      exitCode,
      timeMs: exec.timeMs,
    });
  }

  return {
    compileOk: true,
    compileError: '',
    compileTimeMs: check.timeMs,
    results,
  };
}

/**
 * Fallback cloud C++ compiler using Wandbox public API when hosted statically
 * on GitHub Pages without a local server.
 */
export async function runCppViaCloudApi(request: RunRequest): Promise<RunResponse> {
  const stdFlag = request.std === 'c++17' ? 'c++17' : 'c++20';
  const results: RunTestCaseResult[] = [];
  let compileTimeMs = 0;

  for (let i = 0; i < request.testCases.length; i++) {
    const tc = request.testCases[i];
    const start = performance.now();
    const res = await fetch('https://wandbox.org/api/compile.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compiler: 'gcc-head',
        code: request.code,
        stdin: tc.input,
        'compiler-option-raw': `-std=${stdFlag}\n-O2`,
      }),
    });

    if (!res.ok) {
      throw new Error(`云端 C++ 编译服务返回 ${res.status}，请稍后重试或切换至本地后端 / Python 浏览器运行`);
    }

    const data = (await res.json()) as {
      status?: string;
      signal?: string;
      compiler_error?: string;
      compiler_message?: string;
      program_output?: string;
      program_error?: string;
    };

    const elapsed = Math.round(performance.now() - start);
    if (i === 0) compileTimeMs = elapsed;

    if (data.compiler_error && data.compiler_error.trim() !== '' && data.program_output === undefined) {
      return {
        compileOk: false,
        compileError: data.compiler_error,
        compileTimeMs: elapsed,
        results: [],
      };
    }

    const exitCode = data.status !== undefined ? Number(data.status) : 0;
    const isTle = data.signal === 'SIGKILL' || data.signal === 'SIGXCPU';
    const stdout = truncateText(data.program_output ?? '');
    const stderr = truncateText(data.program_error ?? '');

    results.push({
      id: tc.id,
      status: isTle ? 'TLE' : judgeOutput(stdout, tc.expectedOutput, Number.isNaN(exitCode) ? 1 : exitCode),
      stdout,
      stderr,
      exitCode: Number.isNaN(exitCode) ? null : exitCode,
      timeMs: elapsed,
    });
  }

  return {
    compileOk: true,
    compileError: '',
    compileTimeMs,
    results,
  };
}
