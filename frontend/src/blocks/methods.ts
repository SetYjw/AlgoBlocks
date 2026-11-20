import { define, select, text, value } from './definition';

const block = define.bind(null, 'methods');
export const containerStatementOps = ['push_back', 'pop_back', 'push', 'pop', 'insert', 'erase', 'clear', 'resize', 'push_front', 'pop_front'];
export const containerExpressionOps = ['size', 'empty', 'top', 'front', 'back', 'count', 'first', 'second'];
export const stringOps = ['size', 'substr', 'find', 'stoi', 'to_string'];
export const sortOps = ['vector_asc', 'vector_desc', 'array_asc', 'array_desc'];
export const algorithmOps = ['reverse', 'swap', 'lower_bound', 'upper_bound'];

export const methodBlocks = [
  block('swap_vars', '交换变量', '交换 %1 与 %2', [text('A', 'a'), text('B', 'b')], 'statement'),
  block('fill', '填充容器', '将 %1 填充为 %2', [text('VAR', 'v'), value('VALUE')], 'statement'),
  block('container_stat', '容器统计', '容器 %1 的 %2',
    [text('VAR', 'v'), select('OP', ['sum', 'min', 'max'])], 'Number', ['sum', 'min', 'max']),
  block('array_get', '读取下标', '%1 [ %2 ]', [text('VAR', 'a'), value('INDEX', 'Number')], 'expression'),
  block('array_set', '设置下标', '%1 [ %2 ] = %3', [text('VAR', 'a'), value('INDEX', 'Number'), value('VALUE')], 'statement'),
  block('array2d_get', '读取二维下标', '%1 [ %2 ] [ %3 ]', [text('VAR', 'a'), value('ROW', 'Number'), value('COL', 'Number')], 'expression'),
  block('array2d_set', '设置二维下标', '%1 [ %2 ] [ %3 ] = %4',
    [text('VAR', 'a'), value('ROW', 'Number'), value('COL', 'Number'), value('VALUE')], 'statement'),
  block('container_op_stmt', '修改容器', '容器 %1 . %2 参数（按需） %3',
    [text('VAR', 'v'), select('OP', containerStatementOps), value('ARG')], 'statement', containerStatementOps),
  block('container_op_expr', '查询容器', '容器 %1 . %2 参数（按需） %3',
    [text('VAR', 'v'), select('OP', containerExpressionOps), value('ARG')], 'expression', containerExpressionOps),
  block('map_get', '读取映射值', '%1 [键 %2]', [text('VAR', 'm'), value('KEY')], 'expression'),
  block('map_set', '设置映射值', '%1 [键 %2] = %3', [text('VAR', 'm'), value('KEY'), value('VALUE')], 'statement'),
  block('string_op', '字符串操作', '字符串/变量 %1 操作 %2 参数 %3 长度（可选） %4',
    [text('VAR', 's'), select('OP', stringOps), value('ARG'), value('ARG2', 'Number')], 'expression', stringOps),
  block('make_pair', '构造 pair', '构造 pair ( %1 , %2 )', [value('FIRST'), value('SECOND')], 'expression'),
  block('algorithm_sort', '排序 sort', '排序 %1 %2 数组长度 %3',
    [text('VAR', 'v'), select('MODE', sortOps, ['容器升序', '容器降序', '数组升序', '数组降序']), value('SIZE', 'Number')], 'statement'),
  block('algorithm_op', '区间算法', '区间算法 %1 对象 %2 目标值/交换对象 %3 数组长度（可选） %4',
    [select('OP', algorithmOps), text('VAR', 'v'), value('ARG'), value('SIZE', 'Number')], 'statement', algorithmOps),
  block('algorithm_bound', '二分查找位置', '二分查找 %1 对象 %2 目标值 %3 数组长度（可选） %4',
    [select('OP', ['lower_bound', 'upper_bound']), text('VAR', 'v'), value('ARG'), value('SIZE', 'Number')], 'Number', ['lower_bound', 'upper_bound']),
];
