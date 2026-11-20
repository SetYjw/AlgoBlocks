import type * as Blockly from 'blockly';

export interface AlgoTemplate {
  id: string;
  name: string;
  description: string;
  workspaceJson: Record<string, unknown>;
  testCases: Array<{ id: string; name: string; input: string; expectedOutput: string }>;
}

type State = Blockly.serialization.blocks.State;

const block = (type: string, fields: Record<string, string | boolean> = {}, children: Record<string, State> = {}): State => ({
  type: `algo_${type}`,
  ...(Object.keys(fields).length ? { fields } : {}),
  ...(Object.keys(children).length ? { inputs: Object.fromEntries(Object.entries(children).map(([name, child]) => [name, { block: child }])) } : {}),
});

function chain(...blocks: [State, ...State[]]): State {
  return blocks.reduceRight<State | undefined>((next, current) =>
    next ? { ...current, next: { block: next } } : current, undefined)!;
}

const program = (body: State, ...functions: State[]) => ({
  blocks: { languageVersion: 0, blocks: [
    { ...block('main', { FAST_IO: true }, { BODY: body }), x: 32, y: 24 },
    ...functions.map((fn, i) => ({ ...fn, x: 600, y: 24 + i * 300 })),
  ] },
});
const get = (VAR: string) => block('var_get', { VAR });
const number = (NUM: string) => block('number', { NUM });
const declare = (NAME: string, TYPE = 'int', init?: State) => block('decl_var', { NAME, TYPE }, init ? { INIT: init } : {});
const cin = (TARGETS: string) => block('cin', { TARGETS });
const cout = (VALUE: State) => block('cout', { NEWLINE: true }, { VALUE });
const container = (CONTAINER: string, NAME: string, ELEM_TYPE = 'int', ELEM_TYPE2 = 'int') =>
  block('decl_container', { CONTAINER, NAME, ELEM_TYPE, ELEM_TYPE2 });
const op = (VAR: string, OP: string, arg?: State) => block('container_op_stmt', { VAR, OP }, arg ? { ARG: arg } : {});
const query = (VAR: string, OP: string) => block('container_op_expr', { VAR, OP });
const readItems = (destination: string, method: string) =>
  block('for_range', { TYPE: 'int', VAR: 'i', CMP: '<' }, {
    START: number('0'),
    END: get('n'),
    BODY: chain(declare('x'), cin('x'), op(destination, method, get('x'))),
  });
const binary = (type: string, OP: string, A: State, B: State) => block(type, { OP }, { A, B });
const arith = (op: string, a: State, b: State) => binary('arith', op, a, b);
const compare = (op: string, a: State, b: State) => binary('compare', op, a, b);
const set = (VAR: string, VALUE: State, OP = '=') => block('var_set', { VAR, OP }, { VALUE });
const at = (VAR: string, INDEX: State) => block('array_get', { VAR }, { INDEX });
const lookup = (VAR: string, KEY: State) => block('map_get', { VAR }, { KEY });
const repeat = (count: string, BODY: State) => block('for_range', { VAR: 'i' }, { START: number('0'), END: get(count), BODY });

export const ALGO_TEMPLATES: AlgoTemplate[] = [
  {
    id: 'multi-ab',
    name: '多组测试 A+B',
    description: '读取测试组数，用 while (T--) 逐组输出两个 long long 整数的和。',
    workspaceJson: program(chain(
      declare('T'), cin('T'),
      block('while_t', { VAR: 'T' }, {
        BODY: chain(
          declare('a', 'long long'), declare('b', 'long long'), cin('a, b'),
          cout(block('arith', { OP: '+' }, { A: get('a'), B: get('b') })),
        ),
      }),
    )),
    testCases: [
      { id: 'ab-sample', name: '多组与大整数', input: '3\n1 2\n-4 4\n10000000000 5\n', expectedOutput: '3\n0\n10000000005\n' },
      { id: 'ab-empty', name: '零组测试', input: '0\n', expectedOutput: '' },
    ],
  },
  {
    id: 'vector-sort',
    name: 'Vector 排序输出',
    description: '将 n 个整数读入 vector 降序排序，每行输出一个元素。',
    workspaceJson: program(chain(
      declare('n'), cin('n'), container('vector', 'v'), readItems('v', 'push_back'),
      block('algorithm_sort', { VAR: 'v', MODE: 'vector_desc' }),
      block('for_each', { VAR: 'x', CONTAINER: 'v', REF: false }, { BODY: cout(get('x')) }),
    )),
    testCases: [
      { id: 'sort-sample', name: '重复值与负数', input: '5\n3 -1 5 3 0\n', expectedOutput: '5\n3\n3\n0\n-1\n' },
      { id: 'sort-empty', name: '空容器', input: '0\n', expectedOutput: '' },
    ],
  },
  {
    id: 'pq-heap',
    name: '小根堆优先队列模拟',
    description: '将 n 个整数压入小根堆，反复输出并弹出堆顶。',
    workspaceJson: program(chain(
      declare('n'), cin('n'), container('priority_queue_min', 'pq'), readItems('pq', 'push'),
      block('while', {}, {
        COND: block('not', {}, { VALUE: query('pq', 'empty') }),
        BODY: chain(cout(query('pq', 'top')), op('pq', 'pop')),
      }),
    )),
    testCases: [
      { id: 'heap-sample', name: '按升序出堆', input: '6\n7 2 -5 3 2 0\n', expectedOutput: '-5\n0\n2\n2\n3\n7\n' },
      { id: 'heap-empty', name: '空堆', input: '0\n', expectedOutput: '' },
    ],
  },
  {
    id: 'binary-search',
    name: '二分查找（有序数组定位）',
    description: '在升序数组中查找目标值，输出从 0 开始的下标，未找到则输出 -1。',
    workspaceJson: program(chain(
      declare('n'), declare('target'), cin('n, target'), container('vector', 'a'), readItems('a', 'push_back'),
      declare('l', 'int', number('0')), declare('r', 'int', arith('-', get('n'), number('1'))),
      declare('answer', 'int', number('-1')),
      block('while', {}, {
        COND: compare('<=', get('l'), get('r')),
        BODY: chain(
          declare('mid', 'int', arith('+', get('l'), arith('/', arith('-', get('r'), get('l')), number('2')))),
          block('if_elseif_else', {}, {
            COND: compare('==', at('a', get('mid')), get('target')),
            DO: chain(set('answer', get('mid')), block('break_continue', { OP: 'break' })),
            ELSE_IF_COND: compare('<', at('a', get('mid')), get('target')),
            ELSE_IF_DO: set('l', arith('+', get('mid'), number('1'))),
            ELSE_DO: set('r', arith('-', get('mid'), number('1'))),
          }),
        ),
      }),
      cout(get('answer')),
    )),
    testCases: [
      { id: 'binary-found', name: '找到目标', input: '6 7\n-3 0 2 4 7 10\n', expectedOutput: '4\n' },
      { id: 'binary-missing', name: '找不到目标', input: '5 3\n-2 0 1 4 9\n', expectedOutput: '-1\n' },
    ],
  },
  {
    id: 'fast-pow',
    name: '快速幂取模（函数 + 位运算）',
    description: '用自定义函数和位运算计算 a 的 b 次方模 mod；要求 b ≥ 0 且 mod > 0，乘积不超出 long long。',
    workspaceJson: program(chain(
      declare('a', 'long long'), declare('b', 'long long'), declare('mod', 'long long'), cin('a, b, mod'),
      cout(block('func_call_expr', { NAME: 'qpow', ARGS: 'a, b, mod' })),
    ), block('func_def', { NAME: 'qpow', RET_TYPE: 'long long', PARAMS: 'long long a, long long b, long long mod' }, {
      BODY: chain(
        declare('res', 'long long', arith('%', number('1'), get('mod'))),
        set('a', arith('%', arith('+', arith('%', get('a'), get('mod')), get('mod')), get('mod'))),
        block('while', {}, {
          COND: compare('>', get('b'), number('0')),
          BODY: chain(
            block('if', {}, { COND: binary('bitwise', '&', get('b'), number('1')),
              DO: set('res', arith('%', arith('*', get('res'), get('a')), get('mod'))) }),
            set('a', arith('%', arith('*', get('a'), get('a')), get('mod'))),
            set('b', number('1'), '>>='),
          ),
        }),
        block('return', {}, { VALUE: get('res') }),
      ),
    })),
    testCases: [
      { id: 'pow-mod', name: '取模', input: '2 10 1000\n', expectedOutput: '24\n' },
      { id: 'pow-odd', name: '奇数指数', input: '3 13 1000000007\n', expectedOutput: '1594323\n' },
    ],
  },
  {
    id: 'prefix-sum',
    name: '前缀和区间查询',
    description: '构建 long long 前缀和，再回答从 1 开始的闭区间求和查询。',
    workspaceJson: program(chain(
      declare('n'), declare('q'), cin('n, q'), container('vector', 'pre', 'long long'),
      op('pre', 'push_back', number('0')), declare('total', 'long long', number('0')),
      repeat('n', chain(
        declare('x', 'long long'), cin('x'), set('total', get('x'), '+='),
        op('pre', 'push_back', get('total')),
      )),
      repeat('q', chain(
        declare('l'), declare('r'), cin('l, r'), cout(arith('-', at('pre', get('r')), at('pre', arith('-', get('l'), number('1'))))),
      )),
    )),
    testCases: [
      { id: 'prefix-ranges', name: '完整区间与子区间', input: '5 3\n1 2 3 4 5\n1 5\n2 4\n3 3\n', expectedOutput: '15\n9\n3\n' },
      { id: 'prefix-large', name: '大整数与负值', input: '3 2\n3000000000 -7 -5\n1 2\n2 3\n', expectedOutput: '2999999993\n-12\n' },
    ],
  },
  {
    id: 'word-freq',
    name: '哈希表词频统计（Map）',
    description: '用 map<string, int> 统计单词出现次数，查询未出现的单词时输出 0。',
    workspaceJson: program(chain(
      declare('n'), cin('n'), container('map', 'cnt', 'string', 'int'), declare('w', 'string'),
      repeat('n', chain(
        cin('w'),
        block('map_set', { VAR: 'cnt' }, {
          KEY: get('w'), VALUE: arith('+', lookup('cnt', get('w')), number('1')),
        }),
      )),
      declare('q'), cin('q'), repeat('q', chain(cin('w'), cout(lookup('cnt', get('w'))))),
    )),
    testCases: [
      { id: 'words-mixed', name: '重复与缺失单词', input: '5\nred blue red green red\n4\nred blue missing green\n', expectedOutput: '3\n1\n0\n1\n' },
      { id: 'words-empty', name: '空词表', input: '0\n2\nfirst again\n', expectedOutput: '0\n0\n' },
    ],
  },
];
