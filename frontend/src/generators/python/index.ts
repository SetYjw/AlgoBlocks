import type { Block, Workspace } from 'blockly';
import { scanWorkspaceSymbols, type SymbolInfo } from '../../core/symbolTable';
import { character, singleLine, splitFields } from '../text';
import type { Diagnostic, GeneratedCodeResult, LanguageTarget } from '../types';

const field = (block: Block, name: string) => String(block.getFieldValue(name) ?? '').trim();
const enabled = (block: Block) => block.isEnabled() && !block.getInheritedDisabled();
const scalar: Record<string, string> = {
  int: 'int', 'long long': 'int', double: 'float', string: 'str', bool: 'bool', char: 'str',
};
const defaults: Record<string, string> = { int: '0', 'long long': '0', double: '0.0', string: "''", char: "'\\0'", bool: 'False' };
const defaultValue = (type = '') => defaults[type] ?? '0';
const presets: Record<string, string> = {
  INT_MAX: '2**31 - 1', LLONG_MAX: '2**63 - 1', MOD_1E9_7: '1000000007', INF_1E9: '10**9', INF_1E18: '10**18',
};
const order: Record<string, number> = {
  or: 2, and: 3, '==': 5, '!=': 5, '<': 5, '<=': 5, '>': 5, '>=': 5, '|': 6, '^': 7, '&': 8,
  '<<': 9, '>>': 9, '+': 10, '-': 10, '*': 11, '/': 11, '//': 11, '%': 11, '**': 13,
};
const reserved = new Set((
  'False None True and as assert async await break class continue def del elif else except finally for from global if ' +
  'import in is lambda nonlocal not or pass raise return try while with yield ' +
  'abs bool chr dict enumerate float format int isinstance iter len list max min next ord pow print range set sorted str sum ' +
  'bisect collections heapq math re sys'
).split(' '));
const identifier = (name: string) => reserved.has(name) || name.startsWith('_') ? `_user_${name}` : name;
const tokens = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:0[xX][0-9a-fA-F]+|0[bB][01]+|(?:\d+\.\d*|\d+)(?:[eE][+-]?\d+)?)[uUlLfF]*|\b[A-Za-z_]\w*\b|&&|\|\||!(?!=)/g;
const numberLiteral = (text: string) => {
  const number = text.replace(/'/g, '').replace(/(?<=[0-9a-f])[ul]+$/i, '');
  const plain = /^[-+]?0[xXbB]/.test(number) ? number : number.replace(/(?<=\d)f$/i, '');
  return plain.replace(/^([+-]?)0([0-7]+)$/, '$10o$2');
};
// Call arguments and input targets are text fields, not Blockly expressions.
const inline = (text: string) => text.replace(tokens, (token) => {
  if (/^['"]/.test(token)) return token;
  if (/^\d/.test(token)) return numberLiteral(token);
  return ({ true: 'True', false: 'False', '&&': ' and ', '||': ' or ', '!': ' not ' } as Record<string, string>)[token]
    ?? identifier(token);
}).trim();
const quotedChar = (char: string) => `'${JSON.stringify(char).slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'")}'`;
const paramsOf = (block: Block) => splitFields(field(block, 'PARAMS'), /,/).flatMap((param) => {
  const match = /(\w+)\s*(?:=\s*(.*))?$/.exec(param);
  if (!match) return [];
  const [, name, initial] = match;
  const type = param.slice(0, match.index).trim().replace(/\bconst\b|[&*]/g, '').trim().replace(/\s+/g, ' ');
  if (name === 'void' && !type) return [];
  return [{ name, type, initial }];
});
const statementChain = (first: Block | null) => {
  const blocks: Block[] = [];
  for (let block = first; block; block = block.getNextBlock()) if (enabled(block)) blocks.push(block);
  return blocks;
};
const mainTypes = ['algo_main', 'algo_global_section', 'algo_func_def'];
const targetsOf = (block: Block) => splitFields(field(block, 'TARGETS'), /[\s,]/);

interface Expr {
  text: string;
  ids: string[];
  order: number;
  type?: string;
}

function generate(workspace: Workspace): GeneratedCodeResult {
  const lines: string[] = [];
  const lineMap: GeneratedCodeResult['lineMap'] = Object.create(null);
  const diagnostics: Diagnostic[] = [];
  const imports = new Set<string>();
  const helpers = new Set<string>();
  const { symbols } = scanWorkspaceSymbols(workspace);
  const scope = (block: Block) => {
    const root = block.getRootBlock();
    return mainTypes.includes(root.type) ? root : null;
  };
  const locals = new Map<Block | null, Map<string, SymbolInfo>>();
  for (const symbol of symbols) {
    if (symbol.isGlobal) continue;
    const root = scope(workspace.getBlockById(symbol.blockId)!);
    if (!locals.has(root)) locals.set(root, new Map());
    locals.get(root)!.set(symbol.name, symbol);
  }
  const globals = new Map(symbols.filter(({ isGlobal }) => isGlobal).map((symbol) => [symbol.name, symbol]));
  const symbolOf = (block: Block, name: string): SymbolInfo | undefined => {
    const root = scope(block);
    const param = root?.type === 'algo_func_def' && paramsOf(root).find((param) => param.name === name);
    if (param) return { name, kind: 'scalar', baseType: param.type, blockId: root.id, isGlobal: false };
    return locals.get(root)?.get(name) ?? globals.get(name);
  };
  const valueType = (block: Block, name: string): string | undefined => {
    const symbol = symbolOf(block, name);
    if (symbol?.baseType === 'auto') {
      const loop = workspace.getBlockById(symbol.blockId)!;
      return symbolOf(loop, field(loop, 'CONTAINER'))?.elemType;
    }
    return symbol?.baseType;
  };
  const indexType = (block: Block, name: string) => {
    const symbol = symbolOf(block, name);
    return symbol?.baseType === 'string' ? 'char' : symbol?.elemType2 && ['map', 'unordered_map'].includes(symbol.baseType)
      ? symbol.elemType2 : symbol?.elemType;
  };
  const warn = (block: Block, message: string) => diagnostics.push({ severity: 'warning', blockId: block.id, message });
  const emit = (indent: number, text: string, ...exprs: Expr[]) => {
    const first = lines.length + 1;
    for (const line of text.split(/\r\n?|\n/)) lines.push(line ? `${'    '.repeat(indent)}${line}` : '');
    for (const { ids } of exprs) for (const id of ids) lineMap[id] = [first, lines.length];
  };
  const atom = (text: string, type?: string): Expr => ({ text, type, order: 14, ids: [] });
  const operand = (expr: Expr, minimum: number) => expr.order < minimum ? `(${expr.text})` : expr.text;
  const optional = (block: Block, name: string) => {
    const child = block.getInputTargetBlock(name);
    return child && enabled(child) ? expression(child) : undefined;
  };
  const input = (block: Block, name: string, fallback = '0') => optional(block, name) ?? atom(fallback, fallback === '0' ? 'int' : undefined);
  const condition = (block: Block, name = 'COND') => input(block, name, 'False');
  const cast = (text: string, type: string, from?: string) => {
    if (type === 'char') return ['char', 'string'].includes(from ?? '') ? `${text}[0]` : `chr(int(${text}) % 256)`;
    return scalar[type] ? `${scalar[type]}(${from === 'char' && type !== 'string' ? `ord(${text})` : text})` : text;
  };
  const call = (block: Block) => `${identifier(field(block, 'NAME'))}(${inline(field(block, 'ARGS'))})`;
  const bounds = (v: string, op: string, arg: Expr, size?: Expr) => {
    imports.add('bisect');
    return `bisect.bisect_${op === 'lower_bound' ? 'left' : 'right'}(${v}, ${arg.text}${size ? `, hi=${size.text}` : ''})`;
  };

  function expression(block: Block): Expr {
    const f = (name: string) => field(block, name);
    const v = (name: string, fallback?: string) => input(block, name, fallback);
    const make = (text: string, type?: string, precedence = 14, ...children: Expr[]): Expr => ({
      text, type, order: precedence, ids: [block.id, ...children.flatMap(({ ids }) => ids)],
    });
    const name = f('VAR'), variable = identifier(name), container = valueType(block, name);
    const op = f('OP');
    switch (block.type) {
      case 'algo_number': {
        const literal = numberLiteral(f('NUM') || '0');
        const float = !/^[-+]?0[xXbB]/.test(literal) && /[.e]/i.test(literal);
        return make(literal, float ? 'double' : 'int', /^[-+]/.test(literal) ? 12 : 14);
      }
      case 'algo_string': return make(JSON.stringify(String(block.getFieldValue('TEXT') ?? '')), 'string');
      case 'algo_char': return make(quotedChar(character(block)), 'char');
      case 'algo_const_preset': {
        const text = presets[f('CONST')];
        return make(text, 'int', text.includes(' - ') ? 10 : text.includes('**') ? 13 : 14);
      }
      case 'algo_bool': return make(f('BOOL') === 'true' ? 'True' : 'False', 'bool');
      case 'algo_var_get': return make(variable, container);
      case 'algo_raw_expr': return make(`(${f('EXPR') || '0'})`);
      case 'algo_func_call_expr': return make(call(block), globals.get(f('NAME'))?.returnType);
      case 'algo_arith':
      case 'algo_compare':
      case 'algo_logic':
      case 'algo_bitwise': {
        const a = v('A'), b = v('B');
        const type = a.type === 'double' || b.type === 'double' ? 'double' : a.type === 'string' ? 'string'
          : a.type && b.type ? 'int' : undefined;
        const symbol = op === '&&' ? 'and' : op === '||' ? 'or' : op === '/' && type === 'int' ? '//' : op;
        const p = order[symbol];
        const result = `${operand(a, p === 5 ? p + 1 : p)} ${symbol} ${operand(b, p + 1)}`;
        return block.type === 'algo_logic'
          ? make(`bool(${result})`, 'bool', 14, a, b)
          : make(result, block.type === 'algo_compare' ? 'bool' : type, p, a, b);
      }
      case 'algo_not': {
        const arg = v('VALUE', 'False');
        return make(`not ${operand(arg, 4)}`, 'bool', 4, arg);
      }
      case 'algo_ternary': {
        const cond = condition(block), yes = v('THEN'), no = v('ELSE');
        return make(`${operand(yes, 2)} if ${operand(cond, 2)} else ${no.text}`, yes.type === no.type ? yes.type :
          [yes.type, no.type].includes('double') ? 'double' : undefined, 1, cond, yes, no);
      }
      case 'algo_math_func': {
        const fn = f('FUNC');
        const args = ['abs', 'sqrt'].includes(fn) ? [v('A')] : [v('A'), v('B')];
        const useMath = ['sqrt', 'pow', 'gcd', 'lcm'].includes(fn);
        if (useMath) imports.add('math');
        const type = ['sqrt', 'pow'].includes(fn) || args.some((arg) => arg.type === 'double') ? 'double' : 'int';
        return make(`${useMath ? 'math.' : ''}${fn}(${args.map(({ text }) => text).join(', ')})`, type, 14, ...args);
      }
      case 'algo_cast': {
        const arg = v('VALUE'), type = f('TYPE');
        return make(cast(operand(arg, type === 'char' ? 14 : 0), type, arg.type), type, 14, arg);
      }
      case 'algo_array_get':
      case 'algo_array2d_get':
      case 'algo_map_get': {
        const indexes = block.type === 'algo_array2d_get' ? [v('ROW'), v('COL')] :
          [v(block.type === 'algo_map_get' ? 'KEY' : 'INDEX')];
        return make(`${variable}${indexes.map(({ text }) => `[${text}]`).join('')}`, indexType(block, name), 14, ...indexes);
      }
      case 'algo_container_op_expr': {
        const symbol = symbolOf(block, name);
        if (op === 'size') return make(`len(${variable})`, 'int');
        if (op === 'empty') return make(`not ${variable}`, 'bool', 4);
        if (op === 'count') {
          const arg = v('ARG');
          return make(`int(${arg.text} in ${variable})`, 'int', 14, arg);
        }
        const element = op === 'second' ? symbol?.elemType2 : symbol?.elemType;
        if (op === 'top' && container === 'priority_queue_max') {
          if (['string', 'char'].includes(element ?? '')) return make(`${variable}[0].value`, element);
          return make(`-${variable}[0]`, element, 12);
        }
        const index = op === 'back' || (op === 'top' && container !== 'priority_queue_min') ? -1 : op === 'second' ? 1 : 0;
        return make(`${variable}[${index}]`, element);
      }
      case 'algo_container_stat': {
        const elem = symbolOf(block, name)?.elemType;
        return make(`${op}(${variable})`, op === 'sum' && elem !== 'double' ? 'int' : elem);
      }
      case 'algo_string_op': {
        if (op === 'size') return make(`len(${variable})`, 'int');
        if (op === 'stoi' || op === 'to_string') {
          const arg = v('ARG', op === 'to_string' && container === 'string' ? '0' : variable);
          if (op === 'stoi') {
            imports.add('re');
            return make(`int(re.match(r'\\s*[+-]?\\d+', ${arg.text})[0])`, 'int', 14, arg);
          }
          const type = arg.type ?? container;
          const text = type === 'double' ? `format(${arg.text}, '.6f')` : type === 'char' ? `str(ord(${arg.text}))`
            : type === 'bool' ? `str(int(${arg.text}))` : `str(${arg.text})`;
          return make(text, 'string', 14, arg);
        }
        const arg = v('ARG', op === 'find' ? "''" : '0');
        if (op === 'find') return make(`${variable}.find(${arg.text})`, 'int', 14, arg);
        const count = optional(block, 'ARG2');
        if (!count) return make(`${variable}[${arg.text}:]`, 'string', 14, arg);
        helpers.add('substr');
        return make(`_substr(${variable}, ${arg.text}, ${count.text})`, 'string', 14, arg, count);
      }
      case 'algo_make_pair': {
        const first = v('FIRST'), second = v('SECOND');
        return make(`(${first.text}, ${second.text})`, 'pair', 14, first, second);
      }
      case 'algo_algorithm_bound': {
        const arg = v('ARG'), size = optional(block, 'SIZE');
        return make(bounds(variable, op, arg, size), 'int', 14, arg, ...(size ? [size] : []));
      }
      default:
        warn(block, `不支持的表达式块：${block.type}`);
        return make('0', 'int');
    }
  }

  const suites = (first: Block | null, indent: number, requireStatement = true) => {
    const start = lines.length;
    for (const statement of statementChain(first)) emitStatement(statement, indent);
    if (requireStatement && !lines.slice(start).some((line) => !/^\s*(?:#|$)/.test(line))) emit(indent, 'pass');
  };
  const revertLoopCondition = (block: Block, indent: number) => {
    const cond = condition(block);
    emit(indent, `if not (${cond.text}):`, cond);
    emit(indent + 1, 'break');
  };

  function emitStatement(block: Block, indent: number) {
    const start = lines.length + 1;
    const put = (text: string, ...exprs: Expr[]) => emit(indent, text, ...exprs);
    const f = (name: string) => field(block, name);
    const v = (name: string, fallback?: string) => input(block, name, fallback);
    const body = (name = 'BODY', depth = indent + 1, required = true) => suites(block.getInputTargetBlock(name), depth, required);
    const rawName = f('VAR'), variable = identifier(rawName), name = identifier(f('NAME')), op = f('OP'), type = f('TYPE');
    const container = valueType(block, rawName);
    switch (block.type) {
      case 'algo_main':
        put('def main():');
        declareGlobals([block.getInputTargetBlock('BODY')], indent + 1);
        body();
        break;
      case 'algo_global_section':
        body('BODY', indent, false);
        break;
      case 'algo_func_def': {
        const params = paramsOf(block).map(({ name, initial }) =>
          `${identifier(name)}${initial === undefined ? '' : `=${inline(initial)}`}`);
        put(`def ${name}(${params.join(', ')}):`);
        declareGlobals([block.getInputTargetBlock('BODY')], indent + 1);
        body();
        break;
      }
      case 'algo_func_call_stmt': put(call(block)); break;
      case 'algo_comment': put(`# ${singleLine(String(block.getFieldValue('TEXT') ?? ''))}`); break;
      case 'algo_raw_code':
        if (f('CODE')) put(f('CODE')); // Raw blocks are native to the selected target.
        break;
      case 'algo_return': {
        const arg = optional(block, 'VALUE');
        if (arg) put(`return ${arg.text}`, arg);
        else put('return');
        break;
      }
      case 'algo_decl_var':
      case 'algo_decl_const': {
        const arg = optional(block, block.type === 'algo_decl_const' ? 'VALUE' : 'INIT');
        if (!arg) put(`${name} = ${defaultValue(type)}`);
        else {
          const text = type === arg.type || (scalar[type] === 'int' && scalar[arg.type ?? ''] === 'int')
            ? arg.text : cast(operand(arg, type === 'char' ? 14 : 0), type, arg.type);
          put(`${name} = ${text}`, arg);
        }
        break;
      }
      case 'algo_decl_array':
      case 'algo_decl_array2d': {
        const item = defaultValue(type);
        if (block.type === 'algo_decl_array') {
          const size = v('SIZE', '1');
          put(`${name} = [${item}] * ${operand(size, 12)}`, size);
        } else {
          const rows = v('ROWS', '1'), cols = v('COLS', '1');
          put(`${name} = [[${item}] * ${operand(cols, 12)} for _ in range(${rows.text})]`, rows, cols);
        }
        break;
      }
      case 'algo_decl_container': {
        const kind = f('CONTAINER'), elem = f('ELEM_TYPE'), elem2 = f('ELEM_TYPE2');
        let text = '[]';
        if (kind === 'set') text = 'set()';
        else if (kind === 'pair') text = `(${defaultValue(elem)}, ${defaultValue(elem2)})`;
        else if (['deque', 'queue', 'map', 'unordered_map'].includes(kind)) {
          imports.add('collections');
          text = ['deque', 'queue'].includes(kind) ? 'collections.deque()'
            : `collections.defaultdict(${elem2 === 'char' ? "lambda: '\\0'" : scalar[elem2]})`;
        }
        put(`${name} = ${text}`);
        break;
      }
      case 'algo_var_set': {
        const arg = v('VALUE');
        const operator = op === '/=' && ['int', 'long long'].includes(container ?? '') ? '//=' : op;
        const text = op === '=' && container && scalar[container] && arg.type !== container &&
          !(scalar[container] === 'int' && scalar[arg.type ?? ''] === 'int')
          ? cast(operand(arg, container === 'char' ? 14 : 0), container, arg.type) : arg.text;
        put(`${variable} ${operator} ${text}`, arg);
        break;
      }
      case 'algo_var_incdec': put(`${variable} ${op === '++' ? '+=' : '-='} 1`); break;
      case 'algo_cin': {
        const targets = targetsOf(block);
        if (!targets.length) warn(block, '输入块需要至少一个目标。');
        for (const target of targets) {
          imports.add('sys');
          helpers.add('tokens');
          const base = /^\w+/.exec(target)?.[0] ?? target;
          const type = (target.includes('[') ? indexType(block, base) : valueType(block, base)) ?? 'int';
          let read = '_next()';
          if (type === 'char') {
            helpers.add('read_char');
            read = '_read_char()';
          } else if (type === 'bool') read = 'bool(int(_next()))';
          else if (type !== 'string') read = `${scalar[type] ?? 'int'}(_next())`;
          put(`${inline(target)} = ${read}`);
        }
        break;
      }
      case 'algo_getline':
        imports.add('sys');
        helpers.add('readline');
        put(`${variable} = _readline()`);
        break;
      case 'algo_setprecision': {
        helpers.add('precision');
        const digits = v('DIGITS', '6');
        put(`_precision[0] = ${digits.text}`, digits);
        break;
      }
      case 'algo_cout':
      case 'algo_cout_pair': {
        const single = block.type === 'algo_cout';
        const args = single ? [v('VALUE')] : [v('VAL1'), v('VAL2')];
        const sep = single ? '' : `, sep=${JSON.stringify(block.getFieldValue('SEP'))}`;
        const end = f('NEWLINE') === 'TRUE' ? '' : `, end=''`;
        const formatted = args.map((arg) => {
          if (arg.type === 'bool') return `int(${arg.text})`;
          if (arg.type && ['int', 'long long', 'string', 'char'].includes(arg.type)) return arg.text;
          helpers.add('format');
          return `_format(${arg.text})`;
        });
        put(`print(${formatted.join(', ')}${sep}${end})`, ...args);
        break;
      }
      case 'algo_if':
      case 'algo_if_else':
      case 'algo_if_elseif_else': {
        const cond = condition(block);
        put(`if ${cond.text}:`, cond);
        body('DO');
        if (block.type === 'algo_if_elseif_else') {
          const other = condition(block, 'ELSE_IF_COND');
          put(`elif ${other.text}:`, other);
          body('ELSE_IF_DO');
        }
        if (block.type !== 'algo_if') {
          put('else:');
          body('ELSE_DO');
        }
        break;
      }
      case 'algo_while': {
        const cond = condition(block);
        put(`while ${cond.text}:`, cond);
        body();
        break;
      }
      case 'algo_do_while':
        put('while True:');
        body('BODY', indent + 1, false);
        revertLoopCondition(block, indent + 1);
        break;
      case 'algo_while_t':
        put('while True:');
        emit(indent + 1, `${variable} -= 1`);
        emit(indent + 1, `if ${variable} == -1:`);
        emit(indent + 2, 'break');
        body('BODY', indent + 1, false);
        break;
      case 'algo_for_range': {
        const from = v('START'), end = v('END'), step = optional(block, 'STEP'), cmp = f('CMP');
        const descending = cmp.startsWith('>');
        const stop = cmp.length === 1 ? end.text : `${operand(end, 10)} ${descending ? '-' : '+'} 1`;
        const stride = step
          ? descending && !/^-\d/.test(step.text) ? `-${operand(step, 13)}` : step.text
          : descending ? '-1' : '';
        put(`for ${variable} in range(${from.text}, ${stop}${stride ? `, ${stride}` : ''}):`, from, end, ...(step ? [step] : []));
        body();
        break;
      }
      case 'algo_for_each': {
        const source = f('CONTAINER'), collection = identifier(source), kind = valueType(block, source);
        const sequence = ['vector', 'deque'].includes(kind ?? '') || symbolOf(block, source)?.kind === 'array';
        if (f('REF') === 'TRUE' && sequence) {
          const index = `_index_${start}`;
          put(`for ${index}, ${variable} in enumerate(${collection}):`);
          emit(indent + 1, 'try:');
          body('BODY', indent + 2);
          emit(indent + 1, 'finally:');
          emit(indent + 2, `${collection}[${index}] = ${variable}`);
        } else {
          const values = kind === 'map' ? `sorted(${collection}.items())` : kind === 'unordered_map' ? `${collection}.items()`
            : kind === 'set' ? `sorted(${collection})` : collection;
          put(`for ${variable} in ${values}:`);
          body();
        }
        break;
      }
      case 'algo_break_continue':
        if (op === 'continue') {
          for (let parent = block.getSurroundParent(); parent; parent = parent.getSurroundParent()) {
            if (parent.type === 'algo_do_while') revertLoopCondition(parent, indent);
            if (/^algo_(?:do_while|while|while_t|for_range|for_each)$/.test(parent.type)) break;
          }
        }
        put(op);
        break;
      case 'algo_array_set':
      case 'algo_array2d_set':
      case 'algo_map_set': {
        const indexes = block.type === 'algo_array2d_set' ? [v('ROW'), v('COL')] :
          [v(block.type === 'algo_map_set' ? 'KEY' : 'INDEX')];
        const arg = v('VALUE');
        put(`${variable}${indexes.map(({ text }) => `[${text}]`).join('')} = ${arg.text}`, ...indexes, arg);
        break;
      }
      case 'algo_container_op_stmt': {
        const arg = ['push_back', 'push_front', 'push', 'insert', 'erase', 'resize'].includes(op) ? v('ARG') : undefined;
        const value = arg?.text ?? '';
        let text: string;
        if (container?.startsWith('priority_queue_') && ['push', 'pop'].includes(op)) {
          imports.add('heapq');
          let item = value;
          if (arg && container === 'priority_queue_max') {
            const elem = symbolOf(block, rawName)?.elemType;
            if (['char', 'string'].includes(elem ?? '')) {
              helpers.add('reverse_heap');
              item = `_Reverse(${value})`;
            } else item = `-${operand(arg, 13)}`;
          }
          text = op === 'push' ? `heapq.heappush(${variable}, ${item})` : `heapq.heappop(${variable})`;
        } else if (op === 'push_back' && container === 'string') text = `${variable} += ${value}`;
        else if (op === 'resize') {
          helpers.add('resize');
          const fill = defaultValue(symbolOf(block, rawName)?.elemType);
          text = `_resize(${variable}, ${value}, ${fill})`;
        } else {
          const map = container === 'map' || container === 'unordered_map';
          const method = ({
            push: 'append', push_back: 'append', push_front: 'appendleft', pop_back: 'pop', pop_front: 'popleft',
            pop: container === 'queue' ? 'popleft' : 'pop', insert: map ? 'setdefault' : 'add', erase: map ? 'pop' : 'discard',
          } as Record<string, string>)[op] ?? op;
          const args = map && op === 'insert' ? `*${value}` : map && op === 'erase' ? `${value}, None` : value;
          text = `${variable}.${method}(${args})`;
        }
        put(text, ...(arg ? [arg] : []));
        break;
      }
      case 'algo_swap_vars': {
        const a = identifier(f('A')), b = identifier(f('B'));
        put(`${a}, ${b} = ${b}, ${a}`);
        break;
      }
      case 'algo_fill': {
        const arg = v('VALUE');
        if (container === 'deque' || container === 'queue') {
          helpers.add('replace_deque');
          put(`_replace_deque(${variable}, [${arg.text}] * len(${variable}))`, arg);
        } else put(`${variable}[:] = [${arg.text}] * len(${variable})`, arg);
        break;
      }
      case 'algo_algorithm_sort':
      case 'algo_algorithm_op': {
        const sort = block.type === 'algo_algorithm_sort';
        const size = optional(block, 'SIZE');
        if (!sort && op === 'swap') {
          const other = v('ARG', variable);
          put(`${variable}, ${other.text} = ${other.text}, ${variable}`, other);
        } else if (!sort && op !== 'reverse') {
          const arg = v('ARG');
          put(bounds(variable, op, arg, size), arg, ...(size ? [size] : []));
        } else {
          const reverse = f('MODE').endsWith('_desc') ? ', reverse=True' : '';
          const args = size ? [size] : [];
          if (container === 'deque') {
            helpers.add('replace_deque');
            const slice = size ? `list(${variable})[:${size.text}]` : variable;
            const values = sort ? `sorted(${slice}${reverse})` : `reversed(${slice})`;
            put(`_replace_deque(${variable}, ${values}${size ? `, ${size.text}` : ''})`, ...args);
          } else if (size) {
            const slice = `${variable}[:${size.text}]`;
            put(`${slice} = ${sort ? `sorted(${slice}${reverse})` : `${slice}[::-1]`}`, ...args);
          } else put(sort ? `${variable}.sort(${reverse ? 'reverse=True' : ''})` : `${variable}.reverse()`);
        }
        break;
      }
      default:
        warn(block, `未生成独立块：${block.type}`);
    }
    if (start <= lines.length) lineMap[block.id] = [start, lines.length];
  }

  function declareGlobals(roots: (Block | null)[], indent: number) {
    const writes = new Set<string>();
    for (const block of roots.flatMap((root) => root?.getDescendants(false) ?? []).filter(enabled)) {
      const fields = ['algo_var_set', 'algo_var_incdec', 'algo_while_t', 'algo_getline'].includes(block.type) ||
        (block.type === 'algo_container_op_stmt' && field(block, 'OP') === 'push_back' && valueType(block, field(block, 'VAR')) === 'string')
        ? [field(block, 'VAR')] : block.type === 'algo_swap_vars' ? [field(block, 'A'), field(block, 'B')]
          : block.type === 'algo_cin' ? targetsOf(block).filter((target) => /^\w+$/.test(target))
            : block.type === 'algo_algorithm_op' && field(block, 'OP') === 'swap'
              ? [field(block, 'VAR'), field(block.getInputTargetBlock('ARG') ?? block, 'VAR')] : [];
      for (const name of fields) if (symbolOf(block, name)?.isGlobal) writes.add(identifier(name));
    }
    if (writes.size) emit(indent, `global ${[...writes].sort().join(', ')}`);
  }

  const top = workspace.getTopBlocks(true);
  const roots = top.flatMap(statementChain);
  const mains = roots.filter(({ type }) => type === 'algo_main');
  const loose = roots.filter(({ type }) => !mainTypes.includes(type));
  for (const block of roots.filter(({ type }) => type === 'algo_global_section')) emitStatement(block, 0);
  if (lines.length) lines.push('');
  for (const block of roots.filter(({ type }) => type === 'algo_func_def')) {
    emitStatement(block, 0);
    lines.push('', '');
  }
  if (mains.length) {
    emitStatement(mains[0], 0);
    for (const block of mains.slice(1)) warn(block, '每个程序只能有一个 main。');
    for (const block of loose) warn(block, '请把独立的块连接到程序正文。');
  } else {
    emit(0, 'def main():');
    declareGlobals(top.filter(({ type }) => !mainTypes.includes(type)), 1);
    const start = lines.length;
    for (const block of loose) emitStatement(block, 1);
    if (!lines.slice(start).some((line) => !/^\s*(?:#|$)/.test(line))) emit(1, 'pass');
  }
  lines.push('', '', 'if __name__ == "__main__":', '    main()');

  const preamble: string[] = [];
  const helper = (...code: string[]) => preamble.push(...code, '');
  const cursor = helpers.has('read_char') || helpers.has('tokens') && helpers.has('readline');
  if (cursor) imports.add('re');
  const headers = [...imports].sort();
  if (headers.length) helper(...headers.map((module) => `import ${module}`));
  if (cursor) {
    helper('_text = sys.stdin.read()', '_position = 0', "_token = re.compile(r'\\s*(\\S+)')", "_char = re.compile(r'\\s*(\\S)')");
    helper('def _read_match(pattern):', '    global _position', '    match = pattern.match(_text, _position)',
      '    if match is None:', '        raise EOFError("No more input")', '    _position = match.end()', '    return match[1]');
    helper('_next = lambda: _read_match(_token)', '_read_char = lambda: _read_match(_char)');
    if (helpers.has('readline')) helper('def _readline():', '    global _position', '    start = _position',
      "    end = _text.find('\\n', start)", '    if end < 0:', '        end = len(_text)',
      '    _position = min(end + 1, len(_text))', "    return _text[start:end].removesuffix('\\r')");
  } else if (helpers.has('tokens')) helper('_tokens = iter(sys.stdin.read().split())', '_next = lambda: next(_tokens)');
  else if (helpers.has('readline')) helper("_readline = lambda: sys.stdin.readline().removesuffix('\\n').removesuffix('\\r')");
  if (helpers.has('precision')) helper('_precision = [None]');
  if (helpers.has('format')) helper(
    'def _format(value):', '    if isinstance(value, bool):', '        return int(value)', '    if isinstance(value, float):',
    ...(helpers.has('precision') ? ['        if _precision[0] is not None:', '            return format(value, f".{_precision[0]}f")'] : []),
    '        return format(value, ".6g")', '    return value',
  );
  if (helpers.has('substr')) helper('def _substr(text, start, count):', '    return text[start:] if count < 0 else text[start:start + count]');
  if (helpers.has('resize')) helper('def _resize(items, size, fill):', '    while len(items) > size:', '        items.pop()',
    '    items.extend([fill] * (size - len(items)))');
  if (helpers.has('replace_deque')) helper('def _replace_deque(items, values, size=None):', '    values = list(values)',
    '    if size is not None:', '        values.extend(list(items)[size:])', '    items.clear()', '    items.extend(values)');
  if (helpers.has('reverse_heap')) helper('class _Reverse:', '    def __init__(self, value):', '        self.value = value', '',
    '    def __lt__(self, other):', '        return self.value > other.value');

  for (const span of Object.values(lineMap)) {
    span[0] += preamble.length;
    span[1] += preamble.length;
  }
  return { code: [...preamble, ...lines, ''].join('\n'), headers, diagnostics, lineMap };
}

export const pythonTarget: LanguageTarget = { id: 'python', label: 'Python 3', fileExtension: '.py', generate };
