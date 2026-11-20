import { check, define, select, text, value } from './definition';

const block = define.bind(null, 'io');
export const ioBlocks = [
  block('cin', '读取 cin', '输入 cin %1', [text('TARGETS', 'a, b')], 'statement'),
  block('cout', '输出 cout', '输出 cout %1 换行 %2', [value('VALUE'), check('NEWLINE', true)], 'statement'),
  block('cout_pair', '输出两个值', '输出 %1 间隔 %2 %3 换行 %4',
    [value('VAL1'), select('SEP', [' ', '', '\n'], ['空格', '无', '换行']), value('VAL2'), check('NEWLINE', true)], 'statement'),
  block('getline', '读取整行', '读取整行 getline → %1', [text('VAR', 's')], 'statement'),
  block('setprecision', '设置小数精度', '输出小数位数 setprecision %1', [value('DIGITS', 'Number')], 'statement'),
];
