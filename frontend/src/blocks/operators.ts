import { define, select, text, value } from './definition';

const block = define.bind(null, 'operators');
export const operatorBlocks = [
  block('number', '数字', '%1', [text('NUM', '0')], 'Number'),
  block('string', '字符串', '字符串 %1', [text('TEXT', '')], 'String'),
  block('char', '字符', '字符 %1', [text('TEXT', 'a')], 'String'),
  block('const_preset', '常用算法常量', '常量 %1',
    [select('CONST', ['INT_MAX', 'LLONG_MAX', 'MOD_1E9_7', 'INF_1E9', 'INF_1E18'])], 'Number'),
  block('bool', '布尔值', '%1', [select('BOOL', ['true', 'false'], ['真', '假'])], 'Boolean'),
  block('arith', '算术运算', '%1 %2 %3',
    [value('A', 'Number'), select('OP', ['+', '-', '*', '/', '%']), value('B', 'Number')], 'Number'),
  block('compare', '比较', '%1 %2 %3',
    [value('A'), select('OP', ['==', '!=', '<', '<=', '>', '>=']), value('B')], 'Boolean'),
  block('logic', '逻辑运算', '%1 %2 %3', [value('A'), select('OP', ['&&', '||']), value('B')], 'Boolean'),
  block('not', '逻辑非', '非 ! %1', [value('VALUE')], 'Boolean'),
  block('bitwise', '位运算', '%1 %2 %3',
    [value('A', 'Number'), select('OP', ['&', '|', '^', '<<', '>>']), value('B', 'Number')], 'Number'),
  block('ternary', '三目运算', '若 %1 则取 %2 否则取 %3', [value('COND'), value('THEN'), value('ELSE')], 'expression'),
  block('math_func', '数学函数', '数学 %1 参数 %2 %3',
    [select('FUNC', ['abs', 'min', 'max', 'sqrt', 'pow', 'gcd', 'lcm']), value('A', 'Number'), value('B', 'Number')], 'Number'),
  block('cast', '类型强转', '转换为 %1 %2', [select('TYPE', ['long long', 'int', 'double', 'char']), value('VALUE')], 'Number'),
];
