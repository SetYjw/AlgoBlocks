import { describe, expect, it } from 'vitest';
import { checkCompilers, runCpp, type CppRunRequest } from '../runners/cppRunner.js';

const add = `
#include <iostream>
int main() {
  int a, b;
  std::cin >> a >> b;
  std::cout << a + b << "\\n";
}
`;

const run = (code: string, testCases: CppRunRequest['testCases'], timeLimitMs?: number) =>
  runCpp({ language: 'cpp', code, testCases, timeLimitMs });

describe('C++ runner', { timeout: 30000 }, () => {
  it('detects g++', async () => {
    const { gpp } = await checkCompilers();
    expect(gpp.available).toBe(true);
    expect(gpp.version).toMatch(/g\+\+/i);
  });

  it('accepts a correct A+B result after normalizing line endings and trailing spaces', async () => {
    const result = await run(add, [{ id: 'add', input: '3 5\n', expectedOutput: '8  \r\n\r\n' }]);
    expect(result.compileOk).toBe(true);
    expect(result.compileError).toBe('');
    expect(result.results).toEqual([
      { id: 'add', status: 'AC', stdout: expect.stringMatching(/^8\r?\n$/), stderr: '', exitCode: 0, timeMs: expect.any(Number) },
    ]);
  });

  it('marks a wrong answer', async () => {
    const result = await run(add, [{ id: 'wrong', input: '3 5\n', expectedOutput: '7' }]);
    expect(result.results[0]?.status).toBe('WA');
  });

  it('returns diagnostics on a syntax error without running cases', async () => {
    const result = await run('int main( {', [{ id: 'syntax', input: '' }]);
    expect(result.compileOk).toBe(false);
    expect(result.compileError).toMatch(/error/i);
    expect(result.results).toEqual([]);
  });

  it('times out an infinite loop', async () => {
    const result = await run('int main() { while (true) {} }', [{ id: 'loop', input: '' }], 400);
    expect(result.compileOk).toBe(true);
    expect(result.results[0]?.status).toBe('TLE');
    expect(result.results[0]?.timeMs).toBeGreaterThanOrEqual(350);
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
