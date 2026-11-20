import { runCppViaCloudApi, runPythonInBrowser } from './browserRunners';

export interface CompilerStatus {
  available: boolean;
  version: string | null;
}

export interface HealthResponse {
  ok: boolean;
  compilers: {
    gpp: CompilerStatus;
    python: CompilerStatus;
  };
}

export interface RunTestCaseInput {
  id: string;
  input: string;
  expectedOutput?: string;
}

export type TargetLanguage = 'cpp' | 'python';

export interface RunRequest {
  language: TargetLanguage;
  std?: 'c++17' | 'c++20';
  code: string;
  timeLimitMs?: number;
  testCases: RunTestCaseInput[];
}

export type JudgeStatus = 'AC' | 'WA' | 'TLE' | 'RE' | 'OK';

export interface RunTestCaseResult {
  id: string;
  status: JudgeStatus;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timeMs: number;
}

export interface RunResponse {
  compileOk: boolean;
  compileError: string;
  compileTimeMs: number;
  results: RunTestCaseResult[];
}

export async function fetchHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}

/**
 * Executes code via the local backend when available; otherwise automatically
 * falls back to zero-backend static mode (Pyodide WASM in browser for Python 3,
 * Wandbox cloud GCC API for C++17/20) so GitHub Pages deployments work out of the box.
 */
export async function runCode(
  payload: RunRequest,
  preferLocalBackend: boolean
): Promise<RunResponse> {
  if (preferLocalBackend) {
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        return (await res.json()) as RunResponse;
      }
      const text = await res.text().catch(() => '');
      throw new Error(`本地运行服务请求失败 (${res.status})${text ? `: ${text}` : ''}`);
    } catch (err) {
      // If network error to /api/run, fall through to browser/cloud runner
      if (!(err instanceof TypeError)) {
        throw err;
      }
    }
  }

  if (payload.language === 'python') {
    return runPythonInBrowser(payload);
  }
  return runCppViaCloudApi(payload);
}
