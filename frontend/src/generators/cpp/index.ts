import type { Block, Workspace } from 'blockly';
import { scanWorkspaceSymbols } from '../../core/symbolTable';
import { character, singleLine, splitFields } from '../text';
import type { Diagnostic, GeneratedCodeResult, GenerateOptions, LanguageTarget } from '../types';

const precedence: Record<string, number> = {
  '||': 2, '&&': 3, '|': 4, '^': 5, '&': 6, '==': 7, '!=': 7,
  '<': 8, '<=': 8, '>': 8, '>=': 8, '<<': 9, '>>': 9,
  '+': 10, '-': 10, '*': 11, '/': 11, '%': 11,
};
const containerHeaders: Record<string, string> = {
  vector: 'vector', stack: 'stack', queue: 'queue', deque: 'deque',
  priority_queue_min: 'queue', priority_queue_max: 'queue', set: 'set',
  map: 'map', unordered_map: 'unordered_map', pair: 'utility',
};

const field = (block: Block, name: string) => String(block.getFieldValue(name) ?? '').trim();
const enabled = (block: Block) => block.isEnabled() && !block.getInheritedDisabled();
const statements = (block: Block | null): Block[] => {
  const result: Block[] = [];
  for (let current = block; current; current = current.getNextBlock()) {
    if (enabled(current)) result.push(current);
  }
  return result;
};

function cppString(text: string): string {
  return `"${text.replace(/["\\\x00-\x1f\x7f]/g, (char) => {
    if (char === '\n') return '\\n';
    if (char === '\r') return '\\r';
    if (char === '\t') return '\\t';
    if (char === '"' || char === '\\') return `\\${char}`;
    return `\\${char.charCodeAt(0).toString(8).padStart(3, '0')}`;
  })}"`;
}

const presets: Record<string, string> = {
  INT_MAX: 'INT_MAX', LLONG_MAX: 'LLONG_MAX', MOD_1E9_7: '1000000007LL',
  INF_1E9: '1000000000', INF_1E18: '1000000000000000000LL',
};

interface Expression {
  text: string;
  precedence: number;
  ids: string[];
}

function generate(workspace: Workspace, options?: GenerateOptions): GeneratedCodeResult {
  const headers = new Set<string>();
  const lines: string[] = [];
  const lineMap: GeneratedCodeResult['lineMap'] = Object.create(null);
  const diagnostics: Diagnostic[] = [];
  const { byName } = scanWorkspaceSymbols(workspace);
  const need = (...names: string[]) => names.forEach((name) => headers.add(name));
  const warn = (block: Block, message: string) => diagnostics.push({ severity: 'warning', blockId: block.id, message });
  const useType = (type: string) => {
    if (/\bstring\b/.test(type)) need('string');
    for (const [name, header] of Object.entries(containerHeaders)) {
      if (new RegExp(`\\b${name}\\b`).test(type)) need(header);
    }
    if (/\bpriority_queue\b/.test(type)) need('queue');
  };
  const emit = (indent: number, text: string, ...expressions: Expression[]) => {
    const first = lines.length + 1;
    for (const line of text.split(/\r\n?|\n/)) lines.push(line ? `${'    '.repeat(indent)}${line}` : '');
    for (const { ids } of expressions) for (const id of ids) lineMap[id] = [first, lines.length];
  };
  const atom = (text: string): Expression => ({ text, precedence: 13, ids: [] });
  const operand = (expr: Expression, minimum: number) =>
    expr.precedence < minimum ? `(${expr.text})` : expr.text;
  const input = (block: Block, name: string, fallback = '0') => {
    const child = block.getInputTargetBlock(name);
    return child && enabled(child) ? expression(child) : atom(fallback);
  };
  const optional = (block: Block, name: string) => {
    const child = block.getInputTargetBlock(name);
    return child && enabled(child) ? expression(child) : undefined;
  };
  const argument = (expr: Expression) => operand(expr, 1);

  function range(block: Block, variable: string, mode?: string) {
    const size = optional(block, 'SIZE');
    const isArray = mode ? mode.startsWith('array_') : byName.get(variable)?.kind === 'array';
    if (size || isArray) {
      if (size) return { begin: variable, end: `${variable} + ${operand(size, 11)}`, inputs: [size] };
      need('iterator');
      return { begin: `begin(${variable})`, end: `end(${variable})`, inputs: [] };
    }
    return { begin: `${variable}.begin()`, end: `${variable}.end()`, inputs: [] };
  }

  function expression(block: Block): Expression {
    const f = (name: string) => field(block, name);
    const v = (name: string, fallback?: string) => input(block, name, fallback);
    const make = (text: string, order = 13, ...children: Expression[]): Expression => ({
      text, precedence: order, ids: [block.id, ...children.flatMap(({ ids }) => ids)],
    });
    const op = f('OP');
    const variable = f('VAR');
    switch (block.type) {
      case 'algo_number': {
        const number = f('NUM') || '0';
        return make(number, /^[+-]/.test(number) ? 12 : 13);
      }
      case 'algo_string':
        need('string');
        return make(`${cppString(String(block.getFieldValue('TEXT') ?? ''))}s`);
      case 'algo_char': {
        const char = character(block);
        const code = char.codePointAt(0)!;
        if (code > 255) warn(block, '字符超出 C++ char 的单字节范围。');
        const escaped = code > 127 ? `\\${(code % 256).toString(8).padStart(3, '0')}` :
          cppString(char).slice(1, -1).replace(/'/g, "\\'");
        return make(`'${escaped}'`);
      }
      case 'algo_const_preset': {
        const preset = f('CONST');
        if (preset.endsWith('_MAX')) need('climits');
        return make(presets[preset]);
      }
      case 'algo_container_stat': {
        const { begin, end } = range(block, variable);
        if (op === 'sum') {
          need('numeric');
          return make(`accumulate(${begin}, ${end}, 0LL)`);
        }
        need('algorithm');
        return make(`*${op}_element(${begin}, ${end})`, 12);
      }
      case 'algo_bool': return make(f('BOOL'));
      case 'algo_var_get': return make(variable);
      case 'algo_raw_expr': return make(`(${f('EXPR') || '0'})`);
      case 'algo_func_call_expr': return make(`${f('NAME')}(${f('ARGS')})`);
      case 'algo_arith':
      case 'algo_compare':
      case 'algo_logic':
      case 'algo_bitwise': {
        const a = v('A'), b = v('B'), order = precedence[op];
        return make(`${operand(a, order)} ${op} ${operand(b, order + 1)}`, order, a, b);
      }
      case 'algo_not': {
        const arg = v('VALUE', 'false');
        return make(`!${operand(arg, 12)}`, 12, arg);
      }
      case 'algo_ternary': {
        const cond = v('COND', 'false'), yes = v('THEN'), no = v('ELSE');
        return make(`${operand(cond, 2)} ? ${yes.text} : ${no.text}`, 1, cond, yes, no);
      }
      case 'algo_math_func': {
        const fn = f('FUNC');
        need(['gcd', 'lcm'].includes(fn) ? 'numeric' : ['min', 'max'].includes(fn) ? 'algorithm' : 'cmath');
        const args = ['abs', 'sqrt'].includes(fn) ? [v('A')] : [v('A'), v('B')];
        return make(`${fn}(${args.map(argument).join(', ')})`, 13, ...args);
      }
      case 'algo_cast': {
        const arg = v('VALUE');
        return make(`static_cast<${f('TYPE')}>(${arg.text})`, 13, arg);
      }
      case 'algo_array_get':
      case 'algo_array2d_get':
      case 'algo_map_get': {
        const indexes = block.type === 'algo_array2d_get' ? [v('ROW'), v('COL')] :
          [v(block.type === 'algo_map_get' ? 'KEY' : 'INDEX')];
        return make(`${variable}${indexes.map((index) => `[${index.text}]`).join('')}`, 13, ...indexes);
      }
      case 'algo_container_op_expr': {
        if (op === 'first' || op === 'second') return make(`${variable}.${op}`);
        const args = op === 'count' ? [v('ARG')] : [];
        return make(`${variable}.${op}(${args.map(argument).join(', ')})`, 13, ...args);
      }
      case 'algo_string_op': {
        if (op === 'size') return make(`${variable}.size()`);
        if (op === 'stoi' || op === 'to_string') {
          need('string');
          const arg = v('ARG', op === 'to_string' && byName.get(variable)?.baseType === 'string' ? '0' : variable);
          return make(`${op}(${argument(arg)})`, 13, arg);
        }
        const arg = v('ARG', op === 'find' ? '""' : '0');
        const count = op === 'substr' ? optional(block, 'ARG2') : undefined;
        const args = count ? [arg, count] : [arg];
        return make(`${variable}.${op}(${args.map(argument).join(', ')})`, 13, ...args);
      }
      case 'algo_make_pair': {
        need('utility');
        const first = v('FIRST'), second = v('SECOND');
        return make(`make_pair(${argument(first)}, ${argument(second)})`, 13, first, second);
      }
      case 'algo_algorithm_bound': {
        need('algorithm');
        const { begin, end, inputs } = range(block, variable);
        const arg = v('ARG');
        return make(`(${op}(${begin}, ${end}, ${argument(arg)}) - ${begin})`, 13, ...inputs, arg);
      }
      default:
        warn(block, `不支持的表达式块：${block.type}`);
        return make('0');
    }
  }

  const emitBody = (block: Block, name: string, indent: number) =>
    statements(block.getInputTargetBlock(name)).forEach((statement) => emitStatement(statement, indent));

  function emitStatement(block: Block, indent: number) {
    const begin = lines.length + 1;
    const put = (text: string, ...exprs: Expression[]) => emit(indent, text, ...exprs);
    const f = (name: string) => field(block, name);
    const v = (name: string, fallback?: string) => input(block, name, fallback);
    const body = (name = 'BODY') => emitBody(block, name, indent + 1);
    const variable = f('VAR'), name = f('NAME'), type = f('TYPE'), op = f('OP');

    switch (block.type) {
      case 'algo_main':
        put('int main() {');
        if (f('FAST_IO') === 'TRUE') {
          need('iostream');
          emit(indent + 1, 'ios::sync_with_stdio(false);');
          emit(indent + 1, 'cin.tie(nullptr);');
        }
        body();
        put('}');
        break;
      case 'algo_global_section':
        emitBody(block, 'BODY', indent);
        break;
      case 'algo_func_def': {
        const type = f('RET_TYPE'), params = f('PARAMS');
        useType(type);
        useType(params);
        put(`${type} ${name}(${params}) {`);
        body();
        put('}');
        break;
      }
      case 'algo_func_call_stmt': put(`${name}(${f('ARGS')});`); break;
      case 'algo_comment':
        // A trailing backslash could splice the next source line into the comment.
        put(`// ${singleLine(String(block.getFieldValue('TEXT') ?? '')).replace(/\\\s*$/, '\\.')}`);
        break;
      case 'algo_return': {
        const arg = optional(block, 'VALUE');
        if (arg) put(`return ${arg.text};`, arg);
        else put('return;');
        break;
      }
      case 'algo_raw_code': {
        const code = f('CODE');
        if (code) put(code);
        break;
      }
      case 'algo_decl_var':
      case 'algo_decl_const': {
        const constant = block.type === 'algo_decl_const';
        const initial = constant ? v('VALUE') : optional(block, 'INIT');
        useType(type);
        const decl = `${constant ? 'const ' : ''}${type} ${name}`;
        if (initial) put(`${decl} = ${initial.text};`, initial);
        else put(`${decl};`);
        break;
      }
      case 'algo_decl_array':
      case 'algo_decl_array2d': {
        useType(type);
        const sizes = block.type === 'algo_decl_array2d' ? [v('ROWS', '1'), v('COLS', '1')] : [v('SIZE', '1')];
        put(`${type} ${name}${sizes.map((size) => `[${size.text}]`).join('')};`, ...sizes);
        break;
      }
      case 'algo_decl_container': {
        const container = f('CONTAINER'), elem = f('ELEM_TYPE'), elem2 = f('ELEM_TYPE2');
        need(containerHeaders[container]);
        useType(elem);
        if (container === 'priority_queue_min') {
          need('vector', 'functional');
          put(`priority_queue<${elem}, vector<${elem}>, greater<${elem}>> ${name};`);
        } else if (container === 'priority_queue_max') put(`priority_queue<${elem}> ${name};`);
        else if (['map', 'unordered_map', 'pair'].includes(container)) {
          useType(elem2);
          put(`${container}<${elem}, ${elem2}> ${name};`);
        } else put(`${container}<${elem}> ${name};`);
        break;
      }
      case 'algo_var_set': {
        const arg = v('VALUE');
        put(`${variable} ${op} ${arg.text};`, arg);
        break;
      }
      case 'algo_var_incdec': put(`${variable}${op};`); break;
      case 'algo_cin': {
        const targets = splitFields(f('TARGETS'), /[\s,]/);
        if (targets.length) {
          need('iostream');
          put(`cin >> ${targets.join(' >> ')};`);
        } else warn(block, '输入块需要至少一个目标。');
        break;
      }
      case 'algo_cout':
      case 'algo_cout_pair': {
        need('iostream');
        const single = block.type === 'algo_cout';
        const first = v(single ? 'VALUE' : 'VAL1');
        const end = f('NEWLINE') === 'TRUE' ? " << '\\n'" : '';
        const prefix = `cout << ${operand(first, 10)}`;
        if (single) put(`${prefix}${end};`, first);
        else {
          const second = v('VAL2');
          const separator = block.getFieldValue('SEP');
          const middle = separator === ' ' ? " << ' '" : separator === '\n' ? " << '\\n'" : '';
          put(`${prefix}${middle} << ${operand(second, 10)}${end};`, first, second);
        }
        break;
      }
      case 'algo_getline':
        need('iostream', 'string');
        put(`getline(cin, ${variable});`);
        break;
      case 'algo_setprecision': {
        need('iostream', 'iomanip');
        const digits = v('DIGITS', '6');
        put(`cout << fixed << setprecision(${argument(digits)});`, digits);
        break;
      }
      case 'algo_if':
      case 'algo_if_else':
      case 'algo_if_elseif_else': {
        const cond = v('COND', 'false');
        put(`if (${cond.text}) {`, cond);
        body('DO');
        if (block.type === 'algo_if_elseif_else') {
          const other = v('ELSE_IF_COND', 'false');
          put(`} else if (${other.text}) {`, other);
          body('ELSE_IF_DO');
        }
        if (block.type !== 'algo_if') {
          put('} else {');
          body('ELSE_DO');
        }
        put('}');
        break;
      }
      case 'algo_for_range': {
        const start = v('START'), end = v('END');
        const step = optional(block, 'STEP');
        const cmp = f('CMP');
        const descending = cmp.startsWith('>');
        const update = step
          ? `${variable} ${descending && !/^-\d/.test(step.text) ? '-=' : '+='} ${step.text}`
          : `${descending ? '--' : '++'}${variable}`;
        put(`for (${type} ${variable} = ${start.text}; ${variable} ${cmp} ${operand(end, 9)}; ${update}) {`,
          start, end, ...(step ? [step] : []));
        body();
        put('}');
        break;
      }
      case 'algo_for_each':
        put(`for (auto${f('REF') === 'TRUE' ? '&' : ''} ${variable} : ${f('CONTAINER')}) {`);
        body();
        put('}');
        break;
      case 'algo_while': {
        const cond = v('COND', 'false');
        put(`while (${cond.text}) {`, cond);
        body();
        put('}');
        break;
      }
      case 'algo_do_while': {
        const cond = v('COND', 'false');
        put('do {');
        body();
        put(`} while (${cond.text});`, cond);
        break;
      }
      case 'algo_while_t':
        put(`while (${variable}--) {`);
        body();
        put('}');
        break;
      case 'algo_break_continue': put(`${op};`); break;
      case 'algo_array_set':
      case 'algo_array2d_set':
      case 'algo_map_set': {
        const indexes = block.type === 'algo_array2d_set' ? [v('ROW'), v('COL')] :
          [v(block.type === 'algo_map_set' ? 'KEY' : 'INDEX')];
        const arg = v('VALUE');
        put(`${variable}${indexes.map((index) => `[${index.text}]`).join('')} = ${arg.text};`, ...indexes, arg);
        break;
      }
      case 'algo_container_op_stmt': {
        const args = ['push_back', 'push_front', 'push', 'insert', 'erase', 'resize'].includes(op) ? [v('ARG')] : [];
        put(`${variable}.${op}(${args.map(argument).join(', ')});`, ...args);
        break;
      }
      case 'algo_swap_vars':
        need('utility');
        put(`swap(${f('A')}, ${f('B')});`);
        break;
      case 'algo_fill': {
        need('algorithm');
        const arg = v('VALUE');
        const { begin, end } = range(block, variable);
        put(`fill(${begin}, ${end}, ${argument(arg)});`, arg);
        break;
      }
      case 'algo_algorithm_sort': {
        need('algorithm');
        const mode = f('MODE'), { begin, end, inputs } = range(block, variable, mode);
        const desc = mode.endsWith('_desc');
        if (desc) need('functional');
        put(`sort(${begin}, ${end}${desc ? ', greater<>()' : ''});`, ...inputs);
        break;
      }
      case 'algo_algorithm_op': {
        if (op === 'swap') {
          need('utility');
          const other = v('ARG', variable);
          put(`swap(${variable}, ${argument(other)});`, other);
        } else {
          need('algorithm');
          const { begin, end, inputs } = range(block, variable);
          const args = op === 'reverse' ? [] : [v('ARG')];
          put(`${op}(${[begin, end, ...args.map(argument)].join(', ')});`, ...inputs, ...args);
        }
        break;
      }
      default:
        warn(block, `未生成独立块：${block.type}`);
    }

    if (begin <= lines.length) lineMap[block.id] = [begin, lines.length];
  }

  const roots = workspace.getTopBlocks(true).flatMap(statements);
  const mains = roots.filter(({ type }) => type === 'algo_main');
  const globals = roots.filter(({ type }) => type === 'algo_global_section');
  const functions = roots.filter(({ type }) => type === 'algo_func_def');
  const loose = roots.filter(({ type }) => !['algo_main', 'algo_global_section', 'algo_func_def'].includes(type));
  for (const block of globals) emitStatement(block, 0);
  if (lines.length) lines.push('');
  for (const block of functions) {
    emitStatement(block, 0);
    lines.push('');
  }
  if (mains.length) {
    emitStatement(mains[0], 0);
    for (const block of mains.slice(1)) warn(block, '每个程序只能有一个 main。');
    for (const block of loose) warn(block, '请把独立的块连接到程序正文。');
  } else {
    emit(0, 'int main() {');
    for (const block of loose) emitStatement(block, 1);
    emit(0, '}');
  }

  const includes = options?.useBitsHeader !== false ? ['bits/stdc++.h'] : [...headers].sort();
  const preamble = [...includes.map((header) => `#include <${header}>`), 'using namespace std;', ''];
  for (const range of Object.values(lineMap)) {
    range[0] += preamble.length;
    range[1] += preamble.length;
  }
  return { code: [...preamble, ...lines, ''].join('\n'), headers: includes, lineMap, diagnostics };
}

export const cppTarget: LanguageTarget = { id: 'cpp', label: 'C++17/20', fileExtension: '.cpp', generate };
