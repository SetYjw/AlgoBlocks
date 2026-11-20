import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeOutput, runProcess, type RunResult, type Status, type TestCase } from './cppRunner.js';

export type PythonRunRequest = {
  language: 'python';
  code: string;
  timeLimitMs?: number;
  testCases: TestCase[];
};

export async function runPython({
  code, timeLimitMs = 2000, testCases,
}: PythonRunRequest): Promise<RunResult> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'algoblocks-py-'));
  try {
    const env = { ...process.env, PYTHONIOENCODING: 'utf-8' };
    await writeFile(path.join(cwd, 'main.py'), code, 'utf8');
    const compiled = await runProcess('python', ['-m', 'py_compile', 'main.py'], 5000, cwd, '', env);
    if (compiled.timedOut || compiled.exitCode !== 0) {
      return {
        compileOk: false,
        compileError: compiled.stderr || (compiled.timedOut ? 'Compilation timed out' : ''),
        compileTimeMs: compiled.timeMs,
        results: [],
      };
    }

    const results: RunResult['results'] = [];
    const limit = Math.min(10000, Math.max(100, timeLimitMs));
    for (const { id, input, expectedOutput } of testCases) {
      const { timedOut, stdout, stderr, exitCode, timeMs } =
        await runProcess('python', ['-u', 'main.py'], limit, cwd, input, env);
      let status: Status;
      if (timedOut) status = 'TLE';
      else if (exitCode !== 0) status = 'RE';
      else if (expectedOutput === undefined || expectedOutput.trim() === '') status = 'OK';
      else status = normalizeOutput(stdout) === normalizeOutput(expectedOutput) ? 'AC' : 'WA';
      results.push({ id, status, stdout, stderr, exitCode, timeMs });
    }
    return { compileOk: true, compileError: '', compileTimeMs: compiled.timeMs, results };
  } finally {
    await rm(cwd, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
