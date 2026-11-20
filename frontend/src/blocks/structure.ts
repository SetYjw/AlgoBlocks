import { body, check, define, select, scalarTypes, text, value } from './definition';

const block = define.bind(null, 'structure');
export const structureBlocks = [
  block('main', '主程序', '主程序 main　快速输入输出 %1 %2', [check('FAST_IO', true), body('BODY')], 'root'),
  block('global_section', '全局区', '全局区 %1', [body('BODY')], 'root'),
  block('func_def', '自定义函数', '定义函数　返回 %1 名称 %2 参数 %3 %4',
    [select('RET_TYPE', ['int', 'void', ...scalarTypes.slice(1)]), text('NAME', 'solve'), text('PARAMS', ''), body('BODY')], 'root'),
  block('func_call_expr', '函数调用（值）', '调用 %1 ( %2 )', [text('NAME', 'solve'), text('ARGS', '')], 'expression'),
  block('func_call_stmt', '函数调用（语句）', '调用 %1 ( %2 )', [text('NAME', 'solve'), text('ARGS', '')], 'statement'),
  block('return', '返回', '返回 %1', [value('VALUE')], 'statement'),
  block('comment', '单行注释', '注释 %1', [text('TEXT', '')], 'statement'),
  block('raw_code', '自定义代码', 'C++ 代码 %1', [text('CODE', '')], 'statement'),
  block('raw_expr', '自定义表达式', 'C++ 表达式 %1', [text('EXPR', '0')], 'expression'),
];
