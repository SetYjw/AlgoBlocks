import type * as Blockly from 'blockly';

type State = Blockly.serialization.blocks.State;

export const block = (type: string, fields: State['fields'] = {}, children: Record<string, State> = {}, id?: string): State => ({
  type: `algo_${type}`, id, fields, inputs: Object.fromEntries(Object.entries(children).map(([key, block]) => [key, { block }])),
});
export function chain(first: State, ...rest: State[]): State {
  return rest.length ? { ...first, next: { block: chain(rest[0], ...rest.slice(1)) } } : first;
}
export const workspaceJson = (body: State, ...roots: State[]) => ({
  blocks: { languageVersion: 0, blocks: [block('main', { FAST_IO: false }, { BODY: body }, 'main'), ...roots] },
});
export const number = (NUM: string) => block('number', { NUM });
export const read = (VAR: string) => block('var_get', { VAR });
export const output = (VALUE: State) => block('cout', { NEWLINE: true }, { VALUE });
export const binary = (type: string, OP: string, A: State, B: State) => block(type, { OP }, { A, B });
export const declare = (NAME: string, TYPE: string, INIT?: State) =>
  block('decl_var', { NAME, TYPE }, INIT ? { INIT } : {});

export const newBlocksFixture = {
  id: 'new-blocks',
  workspaceJson: workspaceJson(chain(
    block('comment', { TEXT: 'single line' }, {}, 'comment'),
    declare('a', 'int', number('1')), declare('b', 'int', number('6')),
    block('swap_vars', { A: 'a', B: 'b' }, {}, 'swap'),
    block('decl_container', { CONTAINER: 'vector', NAME: 'v', ELEM_TYPE: 'int' }),
    block('container_op_stmt', { VAR: 'v', OP: 'resize' }, { ARG: number('3') }),
    block('fill', { VAR: 'v' }, { VALUE: read('a') }, 'fill'),
    block('do_while', {}, {
      BODY: chain(
        block('var_incdec', { VAR: 'b', OP: '++' }),
        block('if', {}, {
          COND: binary('compare', '==', read('b'), number('2')),
          DO: block('break_continue', { OP: 'continue' }),
        }),
        output(read('b')),
      ),
      COND: { ...binary('compare', '<', read('b'), number('2')), id: 'loop-cond' },
    }, 'loop'),
    block('do_while', {}, {
      BODY: chain(block('var_incdec', { VAR: 'b', OP: '++' }), output(read('b'))),
      COND: binary('compare', '<', read('b'), number('4')),
    }),
    ...['sum', 'min', 'max'].map((OP) => output(block('container_stat', { VAR: 'v', OP }, {}, `stat-${OP}`))),
    ...['a', '\\n', "'", '\\'].map((TEXT, i) => output(block('char', { TEXT }, {}, `char-${i}`))),
    ...['INT_MAX', 'LLONG_MAX', 'MOD_1E9_7', 'INF_1E9', 'INF_1E18'].map((CONST) =>
      output(block('const_preset', { CONST }, {}, CONST))),
  )),
  testCases: [{
    input: '', expectedOutput: "3\n4\n18\n6\n6\na\n\n\n'\n\\\n2147483647\n9223372036854775807\n1000000007\n1000000000\n1000000000000000000\n",
  }],
};
