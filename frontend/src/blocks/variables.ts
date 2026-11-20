import { containerTypes, define, scalarTypes, select, text, value } from './definition';

const block = define.bind(null, 'variables');
const type = () => select('TYPE', scalarTypes);
export const variableBlocks = [
  block('decl_var', '标量声明', '声明 %1 %2 初值（可选） %3', [type(), text('NAME', 'n'), value('INIT')], 'statement'),
  block('decl_const', '常量声明', '常量 %1 %2 = %3', [type(), text('NAME', 'N'), value('VALUE')], 'statement'),
  block('decl_array', '一维数组', '数组 %1 %2 长度 %3', [type(), text('NAME', 'a'), value('SIZE', 'Number')], 'statement'),
  block('decl_array2d', '二维数组', '二维数组 %1 %2 行 %3 列 %4',
    [type(), text('NAME', 'a'), value('ROWS', 'Number'), value('COLS', 'Number')], 'statement'),
  block('decl_container', 'STL 容器声明', '容器 %1 元素/键 %2 值/第二元素 %3 名称 %4',
    [select('CONTAINER', containerTypes), select('ELEM_TYPE', scalarTypes), select('ELEM_TYPE2', scalarTypes), text('NAME', 'v')], 'statement',
    containerTypes),
  block('var_get', '读取变量', '变量 %1', [text('VAR', 'x')], 'expression'),
  block('var_set', '赋值 / 复合赋值', '%1 %2 %3',
    [text('VAR', 'x'), select('OP', ['=', '+=', '-=', '*=', '/=', '%=', '>>=']), value('VALUE')], 'statement'),
  block('var_incdec', '自增 / 自减', '%1 %2', [text('VAR', 'i'), select('OP', ['++', '--'])], 'statement'),
];
