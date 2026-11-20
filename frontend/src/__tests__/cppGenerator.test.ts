import * as Blockly from 'blockly';
import { describe, expect, it, vi } from 'vitest';
import { BLOCK_CATALOG, registerAllBlocks } from '../blocks';
import { attachSymbolSync, registerDynamicFlyouts } from '../core/dynamicFlyout';
import { scanWorkspaceSymbols } from '../core/symbolTable';
import { ALGO_TEMPLATES } from '../core/templates';
import { algoDarkTheme, TOOLBOX_CONFIG } from '../core/theme';
import { getLanguageTarget, listLanguageTargets } from '../generators';

registerAllBlocks();
const cpp = getLanguageTarget('cpp');

type State = Blockly.serialization.blocks.State;
const state = (type: string, rest: Omit<State, 'type'> = {}): State => ({ type: `algo_${type}`, ...rest });
const connection = (block: State) => ({ block });
const withWorkspace = (json: Record<string, unknown>, visit: (ws: Blockly.Workspace) => void) => {
  const ws = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(json, ws);
    visit(ws);
  } finally {
    ws.dispose();
  }
};

const examples: Record<string, { symbols: string[]; code: string[]; headers: string[] }> = {
  'multi-ab': {
    symbols: ['T', 'a', 'b'],
    code: ['while (T--)', 'long long a;', 'long long b;', 'cin >> a >> b;', "cout << a + b << '\\n';"],
    headers: ['iostream'],
  },
  'vector-sort': {
    symbols: ['n', 'v', 'i', 'x'],
    code: ['vector<int> v;', 'v.push_back(x);', 'sort(v.begin(), v.end(), greater<>());', 'for (auto x : v)'],
    headers: ['algorithm', 'functional', 'iostream', 'vector'],
  },
  'pq-heap': {
    symbols: ['n', 'pq', 'i', 'x'],
    code: ['priority_queue<int, vector<int>, greater<int>> pq;', 'pq.push(x);', 'while (!pq.empty())', 'pq.top()', 'pq.pop();'],
    headers: ['functional', 'iostream', 'queue', 'vector'],
  },
  'binary-search': {
    symbols: ['n', 'target', 'a', 'l', 'r', 'mid', 'answer'],
    code: ['vector<int> a;', 'while (l <= r)', 'int mid = l + (r - l) / 2;', 'cout << answer'],
    headers: ['iostream', 'vector'],
  },
  'fast-pow': {
    symbols: ['qpow', 'res', 'a', 'b', 'mod'],
    code: ['long long qpow(long long a, long long b, long long mod)', 'if (b & 1)', 'b >>= 1;', 'qpow(a, b, mod)'],
    headers: ['iostream'],
  },
  'prefix-sum': {
    symbols: ['n', 'q', 'pre', 'total', 'l', 'r'],
    code: ['vector<long long> pre;', 'pre.push_back(0);', 'cout << pre[r] - pre[l - 1]'],
    headers: ['iostream', 'vector'],
  },
  'word-freq': {
    symbols: ['n', 'cnt', 'w', 'q'],
    code: ['map<string, int> cnt;', 'cnt[w] = cnt[w] + 1;', 'cout << cnt[w]'],
    headers: ['iostream', 'map', 'string'],
  },
};

describe('Blockly contracts', () => {
  it('registers every catalog block and exposes both dynamic categories', () => {
    registerAllBlocks();
    const ws = new Blockly.Workspace();
    try {
      expect(new Set(BLOCK_CATALOG.map(({ type }) => type)).size).toBe(BLOCK_CATALOG.length);
      for (const { type } of BLOCK_CATALOG) expect(ws.newBlock(type).type).toBe(type);
      expect(TOOLBOX_CONFIG.contents).toEqual(expect.arrayContaining([
        expect.objectContaining({ custom: 'ALGO_VARIABLES' }), expect.objectContaining({ custom: 'ALGO_METHODS' }),
      ]));
      expect(algoDarkTheme.getComponentStyle('workspaceBackgroundColour')).toBe('#0d1117');
      expect(listLanguageTargets()).toContain(cpp);
    } finally {
      ws.dispose();
    }
  });

  it('prefills flyout blocks from declared types, including function return kinds', () => {
    const callbacks = new Map<string, (ws: Blockly.Workspace) => Blockly.utils.toolbox.FlyoutDefinition>();
    const fakeWorkspace = {
      registerToolboxCategoryCallback: (name: string, callback: (ws: Blockly.Workspace) => Blockly.utils.toolbox.FlyoutDefinition) =>
        callbacks.set(name, callback),
    };
    registerDynamicFlyouts(fakeWorkspace as unknown as Blockly.WorkspaceSvg);
    const variables = callbacks.get('ALGO_VARIABLES')!;
    const methods = callbacks.get('ALGO_METHODS')!;
    withWorkspace({}, (ws) => expect(variables(ws)).toEqual([expect.objectContaining({ kind: 'label' })]));
    const roots = [
      state('decl_container', { fields: { NAME: 'heap', CONTAINER: 'priority_queue_min' } }),
      state('decl_container', { fields: { NAME: 'scores', CONTAINER: 'map' } }),
      state('decl_array2d', { fields: { NAME: 'grid' } }),
      state('func_def', { fields: { NAME: 'visit', RET_TYPE: 'void' } }),
    ];
    withWorkspace({ blocks: { languageVersion: 0, blocks: roots } }, (ws) => {
      expect(variables(ws)).toEqual(expect.arrayContaining([
        { kind: 'block', type: 'algo_var_get', fields: { VAR: 'heap' } },
        { kind: 'block', type: 'algo_var_set', fields: { VAR: 'grid' } },
        { kind: 'block', type: 'algo_func_call_stmt', fields: { NAME: 'visit' } },
      ]));
      expect(variables(ws)).not.toContainEqual({ kind: 'block', type: 'algo_func_call_expr', fields: { NAME: 'visit' } });
      expect(methods(ws)).toEqual(expect.arrayContaining([
        { kind: 'block', type: 'algo_container_op_expr', fields: { VAR: 'heap', OP: 'top' } },
        { kind: 'block', type: 'algo_array2d_get', fields: { VAR: 'grid' } },
        { kind: 'block', type: 'algo_map_set', fields: { VAR: 'scores' } },
        { kind: 'block', type: 'algo_algorithm_op', fields: { OP: 'lower_bound' } },
      ]));
    });
  });

  it('refreshes only a visible dynamic category when the symbols change and unsubscribes', () => {
    const refreshSelection = vi.fn();
    const removeChangeListener = vi.fn();
    let listener: (event: Pick<Blockly.Events.Abstract, 'type'>) => void = () => {};
    let visible = true;
    let contents: Blockly.utils.toolbox.FlyoutItemInfoArray | string = 'ALGO_VARIABLES';
    const category: Blockly.ToolboxCategory = Object.assign(Object.create(Blockly.ToolboxCategory.prototype), {
      getContents: () => contents,
    });
    const toolbox: Blockly.Toolbox = Object.assign(Object.create(Blockly.Toolbox.prototype), {
      getSelectedItem: () => category, refreshSelection,
    });
    withWorkspace({}, (ws) => {
      const fakeWorkspace = {
        getAllBlocks: ws.getAllBlocks.bind(ws),
        addChangeListener: (fn: typeof listener) => { listener = fn; },
        removeChangeListener,
        getToolbox: () => toolbox,
        getFlyout: () => ({ isVisible: () => visible }),
      };
      const cleanup = attachSymbolSync(fakeWorkspace as unknown as Blockly.WorkspaceSvg);
      const block = ws.newBlock('algo_decl_var');
      listener({ type: Blockly.Events.BLOCK_CREATE });
      listener({ type: Blockly.Events.BLOCK_MOVE });
      expect(refreshSelection).toHaveBeenCalledTimes(1);

      visible = false;
      block.setFieldValue('renamed', 'NAME');
      listener({ type: Blockly.Events.BLOCK_CHANGE });
      visible = true;
      contents = [];
      block.setFieldValue('renamed_again', 'NAME');
      listener({ type: Blockly.Events.BLOCK_CHANGE });
      expect(refreshSelection).toHaveBeenCalledTimes(1);

      cleanup();
      expect(removeChangeListener).toHaveBeenCalledWith(listener);
    });
  });
});

describe('C++ templates', () => {
  it.each(ALGO_TEMPLATES)('loads and generates $id with exact line spans and headers', (template) => {
    withWorkspace(template.workspaceJson, (ws) => {
      const expected = examples[template.id];
      const { byName } = scanWorkspaceSymbols(ws);
      expect([...byName.keys()]).toEqual(expect.arrayContaining(expected.symbols));
      const standard = cpp.generate(ws, { useBitsHeader: false });
      const bits = cpp.generate(ws);
      expect(bits.code).toMatch(/^#include <bits\/stdc\+\+\.h>/);
      expect(bits.headers).toEqual(['bits/stdc++.h']);
      expect(standard.headers).toEqual(expected.headers);
      expect(standard.code.match(/(?<=#include <)[^>]+/g)).toEqual(expected.headers);
      for (const { code, diagnostics, lineMap } of [bits, standard]) {
        expect(diagnostics).toEqual([]);
        expect(code).toContain('ios::sync_with_stdio(false);\n    cin.tie(nullptr);');
        for (const snippet of expected.code) expect(code).toContain(snippet);

        const lines = code.trimEnd().split('\n');
        expect(Object.keys(lineMap)).toHaveLength(ws.getAllBlocks(false).length);
        for (const block of ws.getAllBlocks(false)) {
          const [start, end] = lineMap[block.id];
          expect(start).toBeGreaterThan(1);
          expect(end).toBeGreaterThanOrEqual(start);
          expect(end).toBeLessThanOrEqual(lines.length);
          const parent = block.getSurroundParent();
          if (parent) {
            expect(start).toBeGreaterThanOrEqual(lineMap[parent.id][0]);
            expect(end).toBeLessThanOrEqual(lineMap[parent.id][1]);
          }
          if (block.outputConnection) expect(start).toBe(end);
          if (block.type === 'algo_main') {
            expect(lines[start - 1]).toBe('int main() {');
            expect(lines[end - 1]).toBe('}');
          }
          if (template.id === 'multi-ab' && block.type === 'algo_arith') {
            expect(lines[start - 1].trim()).toBe("cout << a + b << '\\n';");
          }
        }
      }
    });
  });
});

it('keeps globals and functions ahead of main and maps serialized else-if branches', () => {
  const json = { blocks: { languageVersion: 0, blocks: [
    state('main', { id: 'main', fields: { FAST_IO: false }, inputs: {
      BODY: connection(state('if_elseif_else', { id: 'if', inputs: {
        COND: connection(state('bool', { id: 'first-cond', fields: { BOOL: 'false' } })),
        ELSE_IF_COND: connection(state('bool', { id: 'second-cond', fields: { BOOL: 'true' } })),
        ELSE_IF_DO: connection(state('func_call_stmt', { id: 'call', fields: { NAME: 'solve', ARGS: 'limit' } })),
        ELSE_DO: connection(state('raw_code', { id: 'else-body', fields: { CODE: 'int x = 0;\n++x;' } })),
      } })),
    } }),
    state('global_section', { id: 'global', inputs: {
      BODY: connection(state('decl_const', { id: 'limit', fields: { NAME: 'limit' }, inputs: {
        VALUE: connection(state('number', { fields: { NUM: '4' } })),
      } })),
    } }),
    state('func_def', { id: 'solve', fields: { RET_TYPE: 'void', NAME: 'solve', PARAMS: 'int n' } }),
  ] } };
  withWorkspace(json, (ws) => {
    const { byName } = scanWorkspaceSymbols(ws);
    expect(byName.get('limit')).toMatchObject({ kind: 'scalar', baseType: 'int', isGlobal: true });
    expect(byName.get('solve')).toMatchObject({ kind: 'function', returnType: 'void', params: 'int n', isGlobal: true });

    const { code, lineMap } = cpp.generate(ws, { useBitsHeader: false });
    const lines = code.split('\n');
    expect(code).not.toContain('#include');
    expect(code).not.toContain('sync_with_stdio');
    expect(lineMap.global).toEqual(lineMap.limit);
    expect(lineMap.limit[1]).toBeLessThan(lineMap.solve[0]);
    expect(lineMap.solve[1]).toBeLessThan(lineMap.main[0]);
    expect(lines[lineMap['first-cond'][0] - 1].trim()).toBe('if (false) {');
    expect(lines[lineMap['second-cond'][0] - 1].trim()).toBe('} else if (true) {');
    expect(lines[lineMap.call[0] - 1].trim()).toBe('solve(limit);');
    expect(lineMap['else-body'][1] - lineMap['else-body'][0]).toBe(1);
    expect(lines[lineMap.if[1] - 1]).toBe('    }');
  });
});
