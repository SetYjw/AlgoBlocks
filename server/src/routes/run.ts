import { Router } from 'express';
import { checkCompilers, runCpp, type CppRunRequest } from '../runners/cppRunner.js';
import { runPython, type PythonRunRequest } from '../runners/pythonRunner.js';

export const runRouter = Router();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRunRequest(value: unknown): value is CppRunRequest | PythonRunRequest {
  return isRecord(value)
    && (value.language === 'cpp'
      ? (value.std === undefined || value.std === 'c++17' || value.std === 'c++20')
      : value.language === 'python' && value.std === undefined)
    && typeof value.code === 'string'
    && (value.timeLimitMs === undefined
      || (typeof value.timeLimitMs === 'number' && Number.isFinite(value.timeLimitMs)))
    && Array.isArray(value.testCases)
    && value.testCases.every((testCase: unknown) => isRecord(testCase)
      && typeof testCase.id === 'string'
      && typeof testCase.input === 'string'
      && (testCase.expectedOutput === undefined || typeof testCase.expectedOutput === 'string'));
}

runRouter.get('/health', async (_req, res) => {
  res.json({ ok: true, compilers: await checkCompilers() });
});

const loopbackHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;

runRouter.post('/run', async (req, res) => {
  // Prevent remote web pages and DNS rebinding from invoking the local runner.
  const origin = req.get('origin');
  if (!loopbackHost.test(req.get('host') ?? '')
      || (origin !== undefined && !loopbackHost.test(origin.replace(/^https?:\/\//i, '')))) {
    res.status(403).json({ error: 'The code runner is for local clients only' });
    return;
  }
  if (!isRunRequest(req.body)) {
    res.status(400).json({ error: 'Invalid run request' });
    return;
  }
  res.json(await (req.body.language === 'cpp' ? runCpp(req.body) : runPython(req.body)));
});
