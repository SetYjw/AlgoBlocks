import { body, check, define, select, text, value } from './definition';

const block = define.bind(null, 'control');
export const controlBlocks = [
  block('if', '如果', '如果 %1 执行 %2', [value('COND'), body('DO')], 'statement'),
  block('if_else', '如果 / 否则', '如果 %1 执行 %2 否则 %3', [value('COND'), body('DO'), body('ELSE_DO')], 'statement'),
  block('if_elseif_else', '如果 / 否则如果 / 否则', '如果 %1 执行 %2 否则如果 %3 执行 %4 否则 %5',
    [value('COND'), body('DO'), value('ELSE_IF_COND'), body('ELSE_IF_DO'), body('ELSE_DO')], 'statement'),
  block('for_range', '计数循环 for', '计数循环 for　%1 %2 从 %3 到 %4 %5 步长 %6 %7',
    [select('TYPE', ['int', 'long long']), text('VAR', 'i'), value('START', 'Number'), select('CMP', ['<', '<=', '>', '>=']),
      value('END', 'Number'), value('STEP', 'Number'), body('BODY')], 'statement'),
  block('for_each', '范围循环 for', '范围循环 for　%1 遍历 %2 引用 %3 %4',
    [text('VAR', 'x'), text('CONTAINER', 'v'), check('REF', false), body('BODY')], 'statement'),
  block('while', '条件循环 while', '当 %1 时循环 %2', [value('COND'), body('BODY')], 'statement'),
  block('do_while', '先执行后判断 do while', '执行 %1 当 %2 时继续', [body('BODY'), value('COND')], 'statement'),
  block('while_t', '循环 while (T--)', '循环 while (%1--) %2', [text('VAR', 'T'), body('BODY')], 'statement'),
  block('break_continue', '跳出 / 继续循环', '%1', [select('OP', ['break', 'continue'], ['跳出 break', '继续 continue'])], 'statement'),
];
