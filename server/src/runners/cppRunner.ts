import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

export type TestCase = { id: string; input: string; expectedOutput?: string };
export type Status = 'AC' | 'WA' | 'TLE' | 'RE' | 'OK';

export type CppRunRequest = {
  language: 'cpp';
  std?: 'c++17' | 'c++20';
  code: string;
  timeLimitMs?: number;
  testCases: TestCase[];
};

type TestResult = {
  id: string;
  status: Status;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timeMs: number;
};

export type RunResult = {
  compileOk: boolean;
  compileError: string;
  compileTimeMs: number;
  results: TestResult[];
};

const MAX_OUTPUT_BYTES = 256 * 1024;
const IS_WINDOWS = process.platform === 'win32';

function captureOutput() {
  const chunks: Buffer[] = [];
  let length = 0;
  return {
    append(chunk: Buffer) {
      const bytes = Math.min(chunk.length, MAX_OUTPUT_BYTES - length);
      if (bytes > 0) {
        chunks.push(Buffer.from(chunk.subarray(0, bytes)));
        length += bytes;
      }
    },
    text() {
      return Buffer.concat(chunks, length).toString('utf8');
    },
  };
}

function killTimedOutProcess(child: ChildProcess): Promise<void> {
  if (!IS_WINDOWS || child.pid === undefined) {
    child.kill('SIGKILL');
    return Promise.resolve();
  }
  // Kill the tree while the root PID still exists; fall back to killing the child.
  return new Promise((resolve) => {
    execFile('taskkill', ['/F', '/T', '/PID', String(child.pid)],
      { windowsHide: true, timeout: 2000 }, (error) => {
        if (error) child.kill('SIGKILL');
        resolve();
      });
  });
}

export function runProcess(file: string, args: string[], timeLimitMs: number, cwd?: string, input = '', env?: NodeJS.ProcessEnv) {
  return new Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timeMs: number;
    timedOut: boolean;
  }>((resolve) => {
    const started = performance.now();
    const child = spawn(file, args, { cwd, env, windowsHide: true });
    const stdout = captureOutput();
    const stderr = captureOutput();
    let timedOut = false;
    let termination: Promise<void> | undefined;
    let timedOutAt: number | undefined;

    child.stdout.on('data', stdout.append);
    child.stderr.on('data', stderr.append);
    child.on('error', (error) => stderr.append(Buffer.from(error.message)));
    // Programs can exit or close stdin before consuming all the input.
    child.stdin.on('error', () => {});

    const timer = setTimeout(() => {
      timedOut = true;
      timedOutAt = performance.now();
      termination = killTimedOutProcess(child).finally(() => {
        child.stdin.destroy();
        child.stdout.destroy();
        child.stderr.destroy();
      });
    }, timeLimitMs);

    child.once('close', async (exitCode) => {
      const timeMs = Math.round((timedOutAt ?? performance.now()) - started);
      clearTimeout(timer);
      await termination;
      resolve({ stdout: stdout.text(), stderr: stderr.text(), exitCode, timeMs, timedOut });
    });
    child.stdin.end(input);
  });
}

async function checkCompiler(command: string) {
  const result = await runProcess(command, ['--version'], 5000);
  const available = !result.timedOut && result.exitCode === 0;
  const version = available ? (result.stdout || result.stderr).split(/\r?\n/, 1)[0].trim() : '';
  return { available, version };
}

export async function checkCompilers() {
  const [gpp, python] = await Promise.all([checkCompiler('g++'), checkCompiler('python')]);
  return { gpp, python };
}

export function normalizeOutput(output: string) {
  return output.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
}

export async function runCpp({
  std = 'c++17', code, timeLimitMs = 2000, testCases,
}: CppRunRequest): Promise<RunResult> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'algoblocks-'));
  try {
    await writeFile(path.join(cwd, 'main.cpp'), code, 'utf8');
    const compiled = await runProcess('g++', [`-std=${std}`, '-O2', 'main.cpp', '-o', 'main.exe'], 15000, cwd);
    if (compiled.timedOut || compiled.exitCode !== 0) {
      return {
        compileOk: false,
        compileError: compiled.stderr || (compiled.timedOut ? 'Compilation timed out' : ''),
        compileTimeMs: compiled.timeMs,
        results: [],
      };
    }

    const results: TestResult[] = [];
    const limit = Math.min(10000, Math.max(100, timeLimitMs));
    for (const { id, input, expectedOutput } of testCases) {
      const { timedOut, stdout, stderr, exitCode, timeMs } =
        await runProcess(path.join(cwd, 'main.exe'), [], limit, cwd, input);
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
