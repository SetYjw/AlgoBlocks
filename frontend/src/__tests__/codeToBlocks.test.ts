import { parser as cppParser } from '@lezer/cpp';
import { parser as pythonParser } from '@lezer/python';
import * as Blockly from 'blockly';
import { expect, it } from 'vitest';
import { registerAllBlocks } from '../blocks';
import { ALGO_TEMPLATES } from '../core/templates';
import { getLanguageTarget } from '../generators';
import { parseCodeToBlocks, parseCppToBlocks, parsePythonToBlocks, type ParseToBlocksResult } from '../parsers';

registerAllBlocks();

type Language = 'cpp' | 'python';
const cpp = getLanguageTarget('cpp');
const python = getLanguageTarget('python');
// The frontend intentionally has no dependency on Node's type declarations.
// These optional integration checks run only in Vitest's Node environment.
const loadBuiltin = (name: string): Promise<Record<string, Function>> => import(/* @vite-ignore */ name);
const { mkdtempSync, rmSync } = await loadBuiltin('node:fs');
const { tmpdir } = await loadBuiltin('node:os');
const { join } = await loadBuiltin('node:path');
const { spawnSync } = await loadBuiltin('node:child_process');
const hasCompiler = spawnSync('g++', ['--version']).status === 0;
const hasPython = spawnSync('python', ['--version'], { encoding: 'utf8' }).stdout?.startsWith('Python 3.');

function withWorkspace<T>(json: Record<string, unknown>, visit: (workspace: Blockly.Workspace) => T): T {
  const workspace = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(json, workspace);
    return visit(workspace);
  } finally {
    workspace.dispose();
  }
}

function verifySyntax(code: string, language: Language) {
  const errors: string[] = [];
  const parser = language === 'cpp' ? cppParser : pythonParser;
  parser.parse(code).iterate({ enter(node) {
    if (node.type.isError) errors.push(code.slice(Math.max(0, node.from - 15), node.to + 15));
  } });
  expect(errors, code).toEqual([]);
}

function inspect(result: ParseToBlocksResult, visit: (blocks: Blockly.Block[], workspace: Blockly.Workspace) => void) {
  withWorkspace(result.workspaceJson, (workspace) => {
    const blocks = workspace.getAllBlocks(false);
    expect(blocks).toHaveLength(result.stats.totalBlocks);
    expect(blocks.filter((b) => ['algo_raw_code', 'algo_raw_expr'].includes(b.type))).toHaveLength(result.stats.rawFallbackCount);
    expect(result.warnings).toHaveLength(result.stats.rawFallbackCount);
    visit(blocks, workspace);
  });
}

function roundTrip(template: typeof ALGO_TEMPLATES[number], language: Language) {
  const target = getLanguageTarget(language);
  const source = withWorkspace(template.workspaceJson, (workspace) => target.generate(workspace).code);
  const result = parseCodeToBlocks(source, language);
  expect(result.warnings, source).toEqual([]);
  expect(result.stats.rawFallbackCount).toBe(0);
  return withWorkspace(result.workspaceJson, (workspace) => {
    expect(workspace.getAllBlocks(false)).toHaveLength(result.stats.totalBlocks);
    const { code, diagnostics } = target.generate(workspace, { useBitsHeader: false });
    expect(diagnostics).toEqual([]);
    verifySyntax(code, language);
    return code;
  });
}

it.each(ALGO_TEMPLATES)('round-trips $id as C++ without fallback', (template) => {
  expect(roundTrip(template, 'cpp')).toContain('int main()');
});

it.each(ALGO_TEMPLATES)('round-trips $id as Python without fallback', (template) => {
  expect(roundTrip(template, 'python')).toContain('def main():');
});

it.skipIf(!hasCompiler).each(ALGO_TEMPLATES)('compiles and runs round-tripped C++ for $id', (template) => {
  const code = roundTrip(template, 'cpp');
  const directory = mkdtempSync(join(tmpdir(), 'algoblocks-roundtrip-'));
  try {
    const executable = join(directory, 'solution.exe');
    const build = spawnSync('g++', ['-std=c++17', '-pedantic-errors', '-x', 'c++', '-', '-o', executable],
      { input: code, encoding: 'utf8', timeout: 20_000 });
    expect(build.status, build.stderr || build.error?.message || code).toBe(0);
    for (const test of template.testCases) {
      const run = spawnSync(executable, [], { input: test.input, encoding: 'utf8', timeout: 3000 });
      expect(run.status, run.stderr || run.error?.message).toBe(0);
      expect(run.stdout.replace(/\r\n/g, '\n')).toBe(test.expectedOutput);
    }
  } finally {
    rmSync(directory, { recursive: true });
  }
}, 25_000);

it.skipIf(!hasPython).each(ALGO_TEMPLATES)('runs round-tripped Python for $id', (template) => {
  const code = roundTrip(template, 'python');
  for (const test of template.testCases) {
    const run = spawnSync('python', ['-c', code], { input: test.input, encoding: 'utf8', timeout: 3000 });
    expect(run.status, run.stderr || run.error?.message || code).toBe(0);
    expect(run.stdout.replace(/\r\n/g, '\n')).toBe(test.expectedOutput);
  }
});

it('maps handwritten C++ A+B including fast I/O, multiple declarations and ostream newline', () => {
  const source = `#include <iostream>
using namespace std;
int main() {
  std::ios::sync_with_stdio(false);
  std::cin.tie(nullptr);
  // A + B
  long long a, b;
  std::cin >> a >> b;
  std::cout << a + b << std::endl;
  return 0;
}`;
  inspect(parseCppToBlocks(source), (blocks, workspace) => {
    expect(blocks.map((b) => b.type)).toEqual([
      'algo_main', 'algo_comment', 'algo_decl_var', 'algo_decl_var', 'algo_cin', 'algo_cout',
      'algo_arith', 'algo_var_get', 'algo_var_get',
    ]);
    expect(blocks[0].getFieldValue('FAST_IO')).toBe('TRUE');
    expect(blocks.find((b) => b.type === 'algo_cin')?.getFieldValue('TARGETS')).toBe('a, b');
    expect(blocks.find((b) => b.type === 'algo_cout')?.getFieldValue('NEWLINE')).toBe('TRUE');
    verifySyntax(cpp.generate(workspace).code, 'cpp');
  });
});

it('maps handwritten C++ binary search, array/vector sort and container operations', () => {
  const source = String.raw`const int N = 10;
int dp[N][N];
int search(int target) {
  int a[10];
  for (long long i = 0; i <= 9; i++) a[i] = i;
  sort(a, a + N);
  int l = 0, r = N - 1;
  while (l <= r) {
    int mid = l + (r - l) / 2;
    if (a[mid] == target) return mid;
    else if (a[mid] < target) l = mid + 1;
    else r = mid - 1;
  }
  return -1;
}
int main() {
  vector<int> v;
  map<string, int> mp;
  v.push_back(search(3));
  sort(v.begin(), v.end(), greater<>());
  for (auto &x : v) mp["key"s] = x > 0 ? x : 0;
  do { dp[1][2] = mp["key"s]; } while (false);
  for (int i = 4; i >= 0; i -= 2) cout << static_cast<long long>(i);
  cout << (int)v.size() + dp[1][2] << '\n';
}`;
  const result = parseCodeToBlocks(source, 'cpp');
  expect(result.warnings).toEqual([]);
  inspect(result, (blocks, workspace) => {
    expect(blocks.map((b) => b.type)).toEqual(expect.arrayContaining([
      'algo_decl_const', 'algo_decl_array', 'algo_decl_array2d', 'algo_for_range', 'algo_while', 'algo_if_elseif_else',
      'algo_array_get', 'algo_array_set', 'algo_decl_container', 'algo_container_op_stmt', 'algo_algorithm_sort',
      'algo_for_each', 'algo_map_get', 'algo_map_set', 'algo_ternary', 'algo_do_while', 'algo_array2d_set', 'algo_cast',
    ]));
    const positions = workspace.getTopBlocks(true).map((b) => b.getRelativeToSurfaceXY());
    expect(positions.map(({ x }) => x)).toEqual([40, 40, 40]);
    expect(positions[0].y).toBeLessThan(positions[1].y);
    expect(positions[1].y).toBeLessThan(positions[2].y);
    const generated = cpp.generate(workspace).code;
    expect(generated).toContain('static_cast<int>(v.size()) + dp[1][2]');
    verifySyntax(generated, 'cpp');
  });
});

it('maps handwritten Python loops, elif, swap, print and methods', () => {
  const result = parsePythonToBlocks(`def select(v, target):
    # choose a value
    for i in range(8, 0, -2):
        if i < target:
            continue
        elif i == target:
            return i
        else:
            break
    return len(v)

v = []
v.append(10)
v.sort(reverse=True)
a, b = b, a
for x in v:
    print(select(v, x), end='')
while a != b and not False:
    a += 1
print(sum(v))
`);
  expect(result.warnings).toEqual([]);
  inspect(result, (blocks, workspace) => {
    expect(blocks.map((b) => b.type)).toEqual(expect.arrayContaining([
      'algo_func_def', 'algo_main', 'algo_comment', 'algo_for_range', 'algo_if_elseif_else', 'algo_break_continue',
      'algo_return', 'algo_container_op_expr', 'algo_container_stat', 'algo_container_op_stmt', 'algo_algorithm_sort',
      'algo_swap_vars', 'algo_for_each', 'algo_func_call_expr', 'algo_while', 'algo_logic', 'algo_not',
    ]));
    const output = python.generate(workspace).code;
    expect(output).toContain('range(8, 0, -2)');
    expect(output).toContain('v.sort(reverse=True)');
    expect(output).toContain('end=\'\'');
    verifySyntax(output, 'python');
  });
});

it('preserves unsupported C++ statements and expressions with source warnings', () => {
  const result = parseCppToBlocks(`#define N 2
int main() {
  auto f = [](int x) { return x + N; };
  int n = [] { return N; }();
  return 0;
}`);
  expect(result.stats.rawFallbackCount).toBe(3);
  expect(result.warnings.every((warning) => /^Line \d+:/.test(warning))).toBe(true);
  inspect(result, (blocks, workspace) => {
    expect(blocks.filter((b) => b.type === 'algo_raw_code').map((b) => b.getFieldValue('CODE')))
      .toEqual(['#define N 2', 'auto f = [](int x) { return x + N; };']);
    expect(blocks.find((b) => b.type === 'algo_raw_expr')?.getFieldValue('EXPR')).toBe('[] { return N; }()');
    verifySyntax(cpp.generate(workspace).code, 'cpp');
  });
});

it('maps C++ STL types, literal presets, and container queries', () => {
  const result = parseCppToBlocks(String.raw`int main() {
  const long long mod = 1000000007LL;
  vector<int> v;
  stack<int> st;
  queue<int> q;
  deque<int> d;
  priority_queue<int> high;
  priority_queue<int, vector<int>, greater<int>> low;
  set<int> s;
  map<string, int> m;
  unordered_map<int, int> u;
  pair<int, long long> p;
  string line;
  char c = '\t';
  bool flag = true;
  getline(cin, line);
  cout << line.substr(1, 2);
  cout << line.find("a");
  cout << to_string(stoi(line));
  s.insert(1);
  s.erase(1);
  v.push_back(1);
  v.resize(2);
  fill(v.begin(), v.end(), 3);
  reverse(v.begin(), v.end());
  swap(v, v);
  cout << min(abs(-2), int(v.size()));
  cout << p.first + p.second;
  cout << accumulate(v.begin(), v.end(), 0LL);
  cout << *max_element(v.begin(), v.end());
  cout << INT_MAX;
  cout << m.count(line);
}`);
  inspect(result, (blocks, workspace) => {
    expect(result.warnings).toEqual([]);
    expect(blocks.filter((b) => b.type === 'algo_decl_container').map((b) => b.getFieldValue('CONTAINER'))).toEqual([
      'vector', 'stack', 'queue', 'deque', 'priority_queue_max', 'priority_queue_min', 'set', 'map', 'unordered_map', 'pair',
    ]);
    expect(blocks.find((b) => b.type === 'algo_char')?.getFieldValue('TEXT')).toBe('\t');
    expect(blocks.map((b) => b.type)).toEqual(expect.arrayContaining([
      'algo_getline', 'algo_const_preset', 'algo_fill', 'algo_algorithm_op', 'algo_swap_vars',
      'algo_math_func', 'algo_container_stat', 'algo_string_op', 'algo_container_op_expr',
    ]));
    verifySyntax(cpp.generate(workspace, { useBitsHeader: false }).code, 'cpp');
  });
});

it('maps token boilerplate and heap calls but retains native imports needed by raw expressions', () => {
  const result = parsePythonToBlocks(`import sys
from heapq import heappop
import heapq
_tokens = iter(sys.stdin.read().split())
_next = lambda: next(_tokens)

def main():
    x = int(_next())
    pq = []
    heapq.heappush(pq, x)
    heapq.heappush(pq, 6)
    heapq.heappop(pq)
    print(pq[0])
    y = heappop(pq)
    print(y)

if __name__ == '__main__':
    main()
`);
  inspect(result, (blocks, workspace) => {
    expect(blocks.find((b) => b.type === 'algo_cin')?.getFieldValue('TARGETS')).toBe('x');
    expect(blocks.find((b) => b.type === 'algo_decl_container')?.getFieldValue('CONTAINER')).toBe('priority_queue_min');
    expect(blocks.filter((b) => b.type === 'algo_container_op_stmt')).toHaveLength(3);
    expect(blocks.find((b) => b.type === 'algo_raw_code')?.getFieldValue('CODE')).toBe('from heapq import heappop');
    const code = python.generate(workspace).code;
    verifySyntax(code, 'python');
    if (hasPython) {
      const run = spawnSync('python', ['-c', code], { input: '2\n', encoding: 'utf8', timeout: 3000 });
      expect(run.status, run.stderr || run.error?.message).toBe(0);
      expect(run.stdout.replace(/\r\n/g, '\n')).toBe('6\n6\n');
    }
  });
});

it('preserves Python line input, lambdas and multiline raw suites', () => {
  const result = parsePythonToBlocks(`name = input("Name: ")
f = lambda x: x
try:
    print(f(name))
except ValueError:
    print("error")
`);
  expect(result.stats.rawFallbackCount).toBe(3);
  inspect(result, (blocks, workspace) => {
    expect(blocks.filter((b) => b.type === 'algo_raw_expr').map((b) => b.getFieldValue('EXPR')))
      .toEqual(['input("Name: ")', 'lambda x: x']);
    expect(blocks.find((b) => b.type === 'algo_raw_code')?.getFieldValue('CODE')).toBe('try:\n    print(f(name))\nexcept ValueError:\n    print("error")');
    verifySyntax(python.generate(workspace).code, 'python');
  });
});

it('keeps Python true division and floor division distinct when regenerating', () => {
  const source = 'a = 7\nprint(a / 2)\nprint(a // 2)\nprint(7.0 // 2)\n';
  const result = parsePythonToBlocks(source);
  inspect(result, (blocks, workspace) => {
    expect(blocks.filter((b) => b.type === 'algo_arith')).toHaveLength(2);
    expect(result.stats.rawFallbackCount).toBe(1);
    const code = python.generate(workspace).code;
    expect(code).toContain('float(a) / 2');
    expect(code).toContain('a // 2');
    expect(code).toContain('7.0 // 2');
    verifySyntax(code, 'python');
  });
});

it.each(['cpp', 'python'] as const)('loads empty and incomplete %s sources without throwing', (language) => {
  inspect(parseCodeToBlocks('', language), () => {});
  const result = parseCodeToBlocks(language === 'cpp' ? 'int main() { int x = ;' : 'def main():\n    x =', language);
  expect(result.stats.rawFallbackCount).toBeGreaterThan(0);
  inspect(result, () => {});
});
