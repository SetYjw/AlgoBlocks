import { spawnSync } from 'node:child_process';
import * as Blockly from 'blockly';
import { expect, it } from 'vitest';
import { BLOCK_CATALOG, registerAllBlocks } from '../blocks';
import { registerDynamicFlyouts } from '../core/dynamicFlyout';
import { ALGO_TEMPLATES } from '../core/templates';
import { TOOLBOX_CONFIG } from '../core/theme';
import { getLanguageTarget, listLanguageTargets } from '../generators';
import { binary, block, chain, declare, newBlocksFixture, number, output, read, workspaceJson } from './generatorFixtures';

registerAllBlocks();
const python = getLanguageTarget('python');
const hasPython = spawnSync('python', ['--version'], { encoding: 'utf8' }).stdout?.startsWith('Python 3.');

function withWorkspace(json, visit) {
  const ws = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(json, ws);
    visit(ws);
  } finally {
    ws.dispose();
  }
}

function runPython(code, input) {
  const run = spawnSync('python', ['-c', code], {
    input, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, timeout: 3000,
  });
  expect(run.status, run.stderr ?? run.error?.message).toBe(0);
  return run.stdout.replace(/\r\n/g, '\n');
}

it('registers the two language targets and exposes every new toolbox block', () => {
  expect(listLanguageTargets().map(({ id }) => id)).toEqual(['cpp', 'python']);
  expect(python).toMatchObject({ label: 'Python 3', fileExtension: '.py' });
  const types = TOOLBOX_CONFIG.contents.flatMap(({ contents }) => (contents ?? []).map(({ type }) => type));
  withWorkspace({}, (ws) => {
    registerDynamicFlyouts({
      registerToolboxCategoryCallback(name, callback) {
        if (name === 'ALGO_METHODS') types.push(...callback(ws).map(({ type }) => type));
      },
    });
  });
  for (const suffix of ['comment', 'do_while', 'char', 'const_preset', 'swap_vars', 'fill', 'container_stat']) {
    const type = `algo_${suffix}`;
    expect(types).toContain(type);
    expect(BLOCK_CATALOG.some((entry) => entry.type === type)).toBe(true);
  }
});

const fixtures = [...ALGO_TEMPLATES, newBlocksFixture];
it.skipIf(!hasPython).each(fixtures)('runs every $id testcase with Python 3', (template) => {
  withWorkspace(template.workspaceJson, (ws) => {
    const { code, diagnostics } = python.generate(ws);
    expect(diagnostics).toEqual([]);
    for (const test of template.testCases) expect(runPython(code, test.input)).toBe(test.expectedOutput);
  });
});

it.each(fixtures)('maps $id block spans to actual Python source lines', (template) => {
  withWorkspace(template.workspaceJson, (ws) => {
    const { code, lineMap } = python.generate(ws);
    const lines = code.trimEnd().split('\n');
    const blocks = ws.getAllBlocks(false);
    expect(Object.keys(lineMap)).toHaveLength(blocks.length);
    for (const block of blocks) {
      const [first, last] = lineMap[block.id];
      expect(first).toBeGreaterThanOrEqual(1);
      expect(last).toBeLessThanOrEqual(lines.length);
      expect(last).toBeGreaterThanOrEqual(first);
      expect(lines[first - 1]).not.toBe('');
      const parent = block.getSurroundParent();
      if (parent) {
        expect(first).toBeGreaterThanOrEqual(lineMap[parent.id][0]);
        expect(last).toBeLessThanOrEqual(lineMap[parent.id][1]);
      }
      if (block.outputConnection) expect(last).toBe(first);
      if (block.type === 'algo_main') expect(lines[first - 1]).toBe('def main():');
      if (block.type === 'algo_cin') {
        expect(lines[first - 1]).toContain('_next()');
        expect(lines[last - 1]).toContain('_next()');
      }
    }
    if (template.id === 'binary-search') expect(code).toContain('mid = l + (r - l) // 2');
    if (template.id === 'fast-pow') expect(code).toContain('def qpow(a, b, mod):');
    if (template.id === 'word-freq') expect(code).toContain('w = _next()');
  });
});

it('maps the new C++ and Python blocks to the corresponding code', () => {
  withWorkspace(newBlocksFixture.workspaceJson, (ws) => {
    const cpp = getLanguageTarget('cpp').generate(ws, { useBitsHeader: false });
    const py = python.generate(ws);
    expect(cpp.headers).toEqual(expect.arrayContaining(['algorithm', 'climits', 'numeric', 'utility']));
    const snippets = {
      comment: ['// single line', '# single line'],
      swap: ['swap(a, b);', 'a, b = b, a'],
      fill: ['fill(v.begin(), v.end(), a);', 'v[:] = [a] * len(v)'],
      loop: ['do {', 'while True:'],
      'loop-cond': ['} while (b < 2);', 'if not (b < 2):'],
      'stat-sum': ['accumulate(v.begin(), v.end(), 0LL)', 'sum(v)'],
      'stat-min': ['*min_element(v.begin(), v.end())', 'min(v)'],
      'stat-max': ['*max_element(v.begin(), v.end())', 'max(v)'],
      'char-0': ["'a'", "'a'"],
    };
    for (const [id, targets] of Object.entries(snippets)) {
      [cpp, py].forEach(({ code, lineMap }, index) => {
        const [first, last] = lineMap[id];
        expect(code.split('\n').slice(first - 1, last).join('\n')).toContain(targets[index]);
      });
    }
  });
});

it.skipIf(!hasPython)('handles typed input, precision, mixed getline, and container variants', () => {
  const container = (NAME, CONTAINER, ELEM_TYPE = 'int') => block('decl_container', { NAME, CONTAINER, ELEM_TYPE });
  const op = (VAR, OP, ARG) => block('container_op_stmt', { VAR, OP }, ARG ? { ARG } : {});
  const query = (VAR, OP) => block('container_op_expr', { VAR, OP });
  const json = workspaceJson(chain(
    declare('n', 'int'), declare('d', 'double'), declare('line', 'string'), declare('c', 'char'),
    block('cin', { TARGETS: 'n, d, c' }), block('getline', { VAR: 'line' }),
    output(read('c')), output(read('line')),
    block('setprecision', {}, { DIGITS: number('2') }),
    output(binary('arith', '/', read('n'), read('d'))),
    container('pq', 'priority_queue_max'), op('pq', 'push', read('n')), op('pq', 'push', number('12')),
    output(query('pq', 'top')), op('pq', 'pop'), output(query('pq', 'top')),
    container('queue', 'queue'), op('queue', 'push', number('3')), op('queue', 'push', number('8')),
    op('queue', 'pop'), output(query('queue', 'front')),
    container('deque', 'deque'), op('deque', 'push_front', number('4')), op('deque', 'push_back', number('2')),
    block('algorithm_sort', { VAR: 'deque', MODE: 'vector_asc' }), output(query('deque', 'front')),
    container('stack', 'stack'), op('stack', 'push', number('7')), output(query('stack', 'top')),
    container('set', 'set'), op('set', 'insert', number('1')),
    output(block('container_op_expr', { VAR: 'set', OP: 'count' }, { ARG: number('1') })),
    op('set', 'erase', number('1')), output(query('set', 'empty')),
    container('dict', 'unordered_map', 'string'),
    output(block('map_get', { VAR: 'dict' }, { KEY: block('string', { TEXT: 'missing' }) })),
  ));
  withWorkspace(json, (ws) => {
    const { code, diagnostics } = python.generate(ws);
    expect(diagnostics).toEqual([]);
    expect(code).toContain('d = float(_next())');
    expect(runPython(code, '5 2.0 Zrest of line\n')).toBe('Z\nrest of line\n2.50\n12\n5\n8\n2\n7\n1\n1\n0\n');
  });
});

it.skipIf(!hasPython)('runs arrays, string and numeric expressions, range algorithms, and custom functions', () => {
  const text = (TEXT) => block('string', { TEXT });
  const set = (VAR, OP, VALUE) => block('var_set', { VAR, OP }, { VALUE });
  const arrayAt = (VAR, INDEX) => block('array_get', { VAR }, { INDEX });
  const bound = (OP) => block('algorithm_bound', { VAR: 'a', OP }, { ARG: number('2'), SIZE: number('3') });
  const pairItem = (OP) => block('container_op_expr', { VAR: 'p', OP });
  const json = workspaceJson(chain(
    block('func_call_stmt', { NAME: 'adjust', ARGS: '2.5' }),
    output(read('counter')),
    block('decl_const', { NAME: 'N', TYPE: 'int' }, { VALUE: number('3') }),
    block('decl_array', { NAME: 'a', TYPE: 'int' }, { SIZE: read('N') }),
    block('array_set', { VAR: 'a' }, { INDEX: number('0'), VALUE: number('2') }),
    block('array_set', { VAR: 'a' }, { INDEX: number('2'), VALUE: number('2') }),
    block('algorithm_sort', { VAR: 'a', MODE: 'array_asc' }, { SIZE: read('N') }),
    block('cout_pair', { SEP: ' ', NEWLINE: true }, { VAL1: bound('lower_bound'), VAL2: bound('upper_bound') }),
    block('algorithm_op', { VAR: 'a', OP: 'reverse' }),
    block('for_each', { VAR: 'element', CONTAINER: 'a', REF: true }, { BODY: set('element', '+=', number('1')) }),
    output(arrayAt('a', number('0'))),
    block('decl_array2d', { NAME: 'grid', TYPE: 'int' }, { ROWS: number('2'), COLS: number('2') }),
    block('array2d_set', { VAR: 'grid' }, { ROW: number('1'), COL: number('1'), VALUE: number('9') }),
    block('cout_pair', { SEP: '', NEWLINE: true }, {
      VAL1: block('array2d_get', { VAR: 'grid' }, { ROW: number('0'), COL: number('1') }),
      VAL2: block('array2d_get', { VAR: 'grid' }, { ROW: number('1'), COL: number('1') }),
    }),
    block('decl_container', { NAME: 'p', CONTAINER: 'pair', ELEM_TYPE: 'int', ELEM_TYPE2: 'string' }),
    set('p', '=', block('make_pair', {}, { FIRST: number('5'), SECOND: text('xyz') })),
    output(pairItem('first')), output(pairItem('second')),
    declare('s', 'string', text('abcd')),
    output(block('string_op', { VAR: 's', OP: 'substr' }, { ARG: number('1'), ARG2: number('2') })),
    output(block('string_op', { VAR: 's', OP: 'find' }, { ARG: text('d') })),
    output(block('string_op', { OP: 'stoi' }, { ARG: text(' -12suffix') })),
    output(block('string_op', { OP: 'to_string' }, { ARG: number('2.5') })),
    block('if_else', {}, {
      COND: binary('logic', '&&', block('bool', { BOOL: 'true' }), block('not', {}, { VALUE: number('1') })),
      DO: output(number('-1')),
      ELSE_DO: output(block('ternary', {}, {
        COND: block('bool', { BOOL: 'true' }),
        THEN: block('math_func', { FUNC: 'gcd' }, { A: number('12'), B: number('18') }),
        ELSE: number('-2'),
      })),
    }),
    output(block('cast', { TYPE: 'int' }, { VALUE: block('char', { TEXT: 'a' }) })),
    block('for_range', { VAR: 'i', CMP: '>=' }, {
      START: number('3'), END: number('1'), STEP: number('2'), BODY: output(read('i')),
    }),
    block('raw_code', { CODE: 'native = 42' }),
    output(block('raw_expr', { EXPR: 'native + 1' })),
  ), block('global_section', {}, { BODY: declare('counter', 'double', number('1.5')) }),
  block('func_def', { NAME: 'adjust', RET_TYPE: 'void', PARAMS: 'double delta' }, {
    BODY: chain(block('comment', { TEXT: 'Update a global' }), set('counter', '+=', read('delta')), block('return')),
  }));
  withWorkspace(json, (ws) => {
    const { code, diagnostics, lineMap } = python.generate(ws);
    expect(diagnostics).toEqual([]);
    expect(Object.keys(lineMap)).toHaveLength(ws.getAllBlocks(false).length);
    expect(runPython(code, '')).toBe('4\n1 3\n3\n09\n5\nxyz\nbc\n3\n-12\n2.500000\n6\n97\n3\n1\n43\n');
  });
});
