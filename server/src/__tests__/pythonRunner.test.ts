import { describe, expect, it } from 'vitest';
import { runPython, type PythonRunRequest } from '../runners/pythonRunner.js';

const add = `
a, b = map(int, input().split())
print(a + b)
`;

const run = (code: string, testCases: PythonRunRequest['testCases'], timeLimitMs?: number) =>
  runPython({ language: 'python', code, testCases, timeLimitMs });

describe('Python runner', { timeout: 30000 }, () => {
  it('accepts a correct A+B result after normalizing line endings and trailing spaces', async () => {
    const result = await run(add, [{ id: 'add', input: '3 5\n', expectedOutput: '8  \r\n\r\n' }]);
    expect(result.compileOk).toBe(true);
    expect(result.compileError).toBe('');
    expect(result.compileTimeMs).toEqual(expect.any(Number));
    expect(result.results).toEqual([
      { id: 'add', status: 'AC', stdout: expect.stringMatching(/^8\r?\n$/), stderr: '', exitCode: 0, timeMs: expect.any(Number) },
    ]);
  });

  it('marks a wrong answer', async () => {
    const result = await run(add, [{ id: 'wrong', input: '3 5\n', expectedOutput: '7' }]);
    expect(result.results[0]?.status).toBe('WA');
  });

  it('returns diagnostics on a syntax error without running cases', async () => {
    const result = await run('if True print("bad")', [{ id: 'syntax', input: '' }]);
    expect(result.compileOk).toBe(false);
    expect(result.compileError).toMatch(/SyntaxError/);
    expect(result.results).toEqual([]);
  });

  it('times out an infinite loop', async () => {
    const result = await run('while True: pass', [{ id: 'loop', input: '' }], 400);
    expect(result.compileOk).toBe(true);
    expect(result.results[0]?.status).toBe('TLE');
    expect(result.results[0]?.timeMs).toBeGreaterThanOrEqual(350);
  });

  it('reports a runtime error', async () => {
    const result = await run('1 / 0', [{ id: 'runtime', input: '' }]);
    expect(result.compileOk).toBe(true);
    expect(result.results[0]?.status).toBe('RE');
    expect(result.results[0]?.stderr).toMatch(/ZeroDivisionError/);
  });

  it('runs multiple cases in order', async () => {
    const result = await run(add, [
      { id: 'first', input: '1 2\n', expectedOutput: '3' },
      { id: 'second', input: '5 7\n' },
      { id: 'third', input: '-5 2\n', expectedOutput: '0' },
    ]);
    expect(result.compileOk).toBe(true);
    expect(result.results.map(({ id, status, stdout }) => [id, status, stdout.trim()])).toEqual([
      ['first', 'AC', '3'],
      ['second', 'OK', '12'],
      ['third', 'WA', '-3'],
    ]);
  });
});
