import { parser as cppParser } from '@lezer/cpp';
import { containerTypes, scalarTypes } from '../blocks/definition';
import { containerExpressionOps, containerStatementOps } from '../blocks/methods';
import {
  assignmentOps, binary, binaryTypes, block, castTypes, chain, children, contents, identifier,
  mathOps, nonNumeric, number, parts, quoted, Source, type Block, type Node,
} from './shared';
import type { ParseToBlocksResult } from './types';

const normalize = (text: string) => text.trim().replace(/^std\s*::\s*/, '').replace(/\s+/g, ' ')
  .replace(/^long long int$/, 'long long');
const typeNames = ['PrimitiveType', 'SizedTypeSpecifier', 'TypeIdentifier', 'ScopedTypeIdentifier', 'TemplateType'];
const presets: Record<string, string> = {
  INT_MAX: 'INT_MAX', LLONG_MAX: 'LLONG_MAX', '1000000007LL': 'MOD_1E9_7',
  '1000000000': 'INF_1E9', '1000000000000000000LL': 'INF_1E18',
};
const callCode = (name: string) => /^std\s*::/.test(name) ? normalize(name) : name;

class Cpp extends Source {
  private types = new Map<string, string>();

  parse(): ParseToBlocksResult {
    const nodes = contentsWithComments(cppParser.parse(this.code).topNode);
    const globals: Block[] = [], functions: Block[] = [];
    // Functions may refer to globals declared elsewhere in the source.
    for (const node of nodes) {
      if (node.name === 'FunctionDefinition' && this.functionSignature(node)) continue;
      if (node.name === 'PreprocDirective' && node.getChild('#include')) continue;
      if (node.name === 'UsingDeclaration' && /^using\s+namespace\s+std\s*;$/.test(this.text(node))) continue;
      globals.push(...this.statement(node));
    }
    for (const node of nodes) {
      if (node.name !== 'FunctionDefinition') continue;
      const signature = this.functionSignature(node);
      if (!signature) continue;
      const { name, type, params, body } = signature;
      const outer = this.types;
      this.types = new Map(outer);
      for (const param of params) {
        const match = /^\s*(?:const\s+)?((?:std::)?\w+(?:\s+\w+)?(?:<.*>)?)\s*[&*]*\s+([A-Za-z_]\w*)\s*(?:=.*)?$/.exec(this.text(param));
        if (match) this.types.set(match[2], normalize(match[1]).split('<')[0]);
      }
      let statements = contentsWithComments(body);
      if (name === 'main') {
        const io = (n: Node) => this.text(n).replace(/\s/g, '').replace(/std::/g, '');
        const sync = (n: Node) => /^(?:ios|ios_base)::sync_with_stdio\(false\);$/.test(io(n));
        const tie = (n: Node) => /^cin\.tie\([^;]*\);$/.test(io(n));
        const fast = statements.some(sync) && statements.some(tie);
        if (fast) statements = statements.filter((n) => !sync(n) && !tie(n));
        let last = statements.length - 1;
        while (last >= 0 && /Comment$/.test(statements[last].name)) last--;
        if (last >= 0 && /^return\s+0\s*;$/.test(this.text(statements[last]))) statements.splice(last, 1);
        functions.push(block('main', { FAST_IO: fast }, { BODY: this.statements(statements) }));
      } else {
        functions.push(block('func_def', { NAME: name, RET_TYPE: type, PARAMS: params.map((p) => this.text(p)).join(', ') },
          { BODY: this.statements(statements) }));
      }
      this.types = outer;
    }
    return this.finish([...(globals.length ? [block('global_section', {}, { BODY: chain(globals) })] : []), ...functions]);
  }

  private functionSignature(node: Node) {
    const [ret, declarator, body] = parts(node);
    if (parts(node).length !== 3 || declarator?.name !== 'FunctionDeclarator' || body?.name !== 'CompoundStatement') return;
    const [id, list] = parts(declarator);
    const name = this.text(id), type = normalize(this.text(ret)), params = contents(list);
    if (parts(declarator).length !== 2 || id?.name !== 'Identifier' || list?.name !== 'ParameterList' ||
      !['void', ...scalarTypes].includes(type) || params.some((p) => p.type.isError)) return;
    if (name === 'main' && (type !== 'int' || (params.length && !(params.length === 1 && this.text(params[0]) === 'void')))) return;
    return { name, type, params, body };
  }

  private statements(nodes: Node[]): Block | undefined {
    return chain(nodes.flatMap((node) => this.statement(node)));
  }

  private body(node: Node): Block | undefined {
    const outer = this.types;
    this.types = new Map(outer);
    const result = this.statements(node.name === 'CompoundStatement' ? contentsWithComments(node) : [node]);
    this.types = outer;
    return result;
  }

  private declaration(node: Node): Block[] | undefined {
    const items = contents(node);
    const constant = items[0]?.name === 'const';
    if (constant) items.shift();
    const typeNode = items.shift();
    if (!typeNode || !typeNames.includes(typeNode.name) || !items.length) return;
    let TYPE = normalize(this.text(typeNode));
    if (items[0]?.name === 'const') { // Also accept `int const n = ...`.
      if (constant) return;
      return this.declarators(items.slice(1), TYPE, true);
    }
    if (typeNode.name !== 'TemplateType') return this.declarators(items, TYPE, constant);
    const [kind, template] = parts(typeNode);
    TYPE = normalize(this.text(kind));
    const args = contents(template).map((arg) => normalize(this.text(arg)));
    const [ELEM_TYPE, ELEM_TYPE2] = args;
    const two = ['map', 'unordered_map', 'pair'].includes(TYPE);
    let CONTAINER = TYPE;
    if (TYPE === 'priority_queue') {
      const [storage, compare] = args.slice(1).map((arg) => arg.replace(/\s|std::/g, ''));
      const elem = ELEM_TYPE?.replace(/\s/g, '');
      if (args.length === 1) CONTAINER = 'priority_queue_max';
      else if (args.length === 3 && storage === `vector<${elem}>` && compare === `greater<${elem}>`) CONTAINER = 'priority_queue_min';
      else return;
    } else if (args.length !== (two ? 2 : 1)) return;
    if (constant || !containerTypes.includes(CONTAINER) || !scalarTypes.includes(ELEM_TYPE) ||
      (two && !scalarTypes.includes(ELEM_TYPE2)) || items.some((n) => n.name !== 'Identifier')) return;
    return items.map((n) => {
      const NAME = this.text(n);
      this.types.set(NAME, CONTAINER);
      return block('decl_container', { NAME, CONTAINER, ELEM_TYPE, ...(two ? { ELEM_TYPE2 } : {}) });
    });
  }

  private declarators(items: Node[], TYPE: string, constant: boolean): Block[] | undefined {
    if (!scalarTypes.includes(TYPE) || !items.length) return;
    const declarations = items.map((item) => {
      const [decl, initial] = item.name === 'InitDeclarator' ? contents(item) : [item];
      const dimensions: Node[] = [];
      let id = decl;
      while (id?.name === 'ArrayDeclarator') {
        const [base, size] = contents(id);
        if (!size || contents(id).length !== 2) return;
        dimensions.unshift(size);
        id = base;
      }
      if (id?.name !== 'Identifier' || dimensions.length > 2 || (dimensions.length && (constant || initial)) ||
        (constant && !initial) || (initial && !/=\s*$/.test(this.code.slice(decl.to, initial.from)))) return;
      return { NAME: this.text(id), dimensions, initial };
    });
    if (declarations.some((d) => !d)) return;
    return declarations.map((decl) => {
      const { NAME, dimensions, initial } = decl!;
      this.types.set(NAME, TYPE);
      if (dimensions.length === 2) return block('decl_array2d', { NAME, TYPE }, { ROWS: this.expr(dimensions[0]), COLS: this.expr(dimensions[1]) });
      if (dimensions.length === 1) return block('decl_array', { NAME, TYPE }, { SIZE: this.expr(dimensions[0]) });
      return block(constant ? 'decl_const' : 'decl_var', { NAME, TYPE }, { [constant ? 'VALUE' : 'INIT']: initial && this.expr(initial) });
    });
  }

  private call(node?: Node) {
    if (node?.name !== 'CallExpression') return;
    const [callee, list] = parts(node);
    if (!callee || list?.name !== 'ArgumentList') return;
    return { callee, name: callCode(this.text(callee)), args: contents(list), list };
  }

  private subscript(node: Node) {
    const indexes: Node[] = [];
    while (node.name === 'SubscriptExpression') {
      const items = contents(node);
      if (items.length !== 2) return;
      indexes.unshift(items[1]);
      node = items[0];
    }
    if (node.name === 'Identifier' && indexes.length >= 1 && indexes.length <= 2) return { VAR: this.text(node), indexes };
  }

  private indexing(node: Node, VALUE?: Block): Block | undefined {
    const target = this.subscript(node);
    if (!target) return;
    const { VAR, indexes } = target;
    const suffix = VALUE ? 'set' : 'get', first = this.expr(indexes[0]);
    if (indexes.length === 2) return block(`array2d_${suffix}`, { VAR }, { ROW: first, COL: this.expr(indexes[1]), VALUE });
    if (['map', 'unordered_map'].includes(this.types.get(VAR) ?? '')) return block(`map_${suffix}`, { VAR }, { KEY: first, VALUE });
    return block(`array_${suffix}`, { VAR }, { INDEX: first, VALUE });
  }

  private range(begin?: Node, end?: Node) {
    const a = this.call(begin), b = this.call(end);
    const member = /^([A-Za-z_]\w*)\s*\.\s*begin$/.exec(a?.name ?? '');
    if (member && !a!.args.length && !b?.args.length && b?.name.replace(/\s/g, '') === `${member[1]}.end`) {
      return { VAR: member[1], array: false };
    }
    if (a?.name === 'begin' && b?.name === 'end' && a.args.length === 1 && b.args.length === 1 &&
      a.args[0].name === 'Identifier' && this.text(a.args[0]) === this.text(b.args[0])) {
      return { VAR: this.text(a.args[0]), array: true };
    }
    if (begin?.name === 'Identifier' && end?.name === 'BinaryExpression') {
      const [lhs, op, rhs] = parts(end), VAR = this.text(begin);
      if (this.text(lhs) === VAR && this.text(op) === '+' && rhs) return { VAR, array: true, size: rhs };
    }
  }

  private expr(node: Node): Block {
    const text = this.text(node), nodes = contents(node);
    if (parts(node).some((c) => c.type.isError)) return this.raw(node, true);
    switch (node.name) {
      case 'Number':
      case 'Identifier':
      case 'ScopedIdentifier': {
        const name = normalize(text);
        const preset = Object.hasOwn(presets, name) ? presets[name] : undefined;
        if (preset) return block('const_preset', { CONST: preset });
        if (node.name === 'Number') return number(text);
        if (node.name === 'Identifier') return block('var_get', { VAR: text });
        break;
      }
      case 'True': case 'False': return block('bool', { BOOL: text });
      case 'String': case 'UserDefinedLiteral': case 'CharLiteral': {
        const char = node.name === 'CharLiteral';
        const literal = node.name === 'UserDefinedLiteral'
          ? (nodes[0]?.name === 'String' && this.text(nodes[1]) === 's' ? this.text(nodes[0]) : '') : text;
        const value = quoted(literal, 'cpp');
        if (value !== undefined && (!char || [...value].length === 1)) return block(char ? 'char' : 'string', { TEXT: value });
        break;
      }
      case 'ParenthesizedExpression':
      case 'ConditionClause':
        if (nodes.length === 1) return this.expr(nodes[0]);
        break;
      case 'BinaryExpression': {
        const [a, op, b] = nodes, OP = this.text(op);
        if (a && b && Object.hasOwn(binaryTypes, OP)) {
          const kind = binaryTypes[OP], A = this.expr(a), B = this.expr(b);
          if (['arith', 'bitwise'].includes(kind)) {
            return binary(kind, OP, nonNumeric(A) ? this.raw(a, true) : A, nonNumeric(B) ? this.raw(b, true) : B);
          }
          return binary(kind, OP, A, B);
        }
        break;
      }
      case 'UnaryExpression': {
        const [op, arg] = nodes;
        if (!arg) break;
        if (this.text(op) === '!') return block('not', {}, { VALUE: this.expr(arg) });
        if (this.text(op) === '-') return arg.name === 'Number' ? number(`-${this.text(arg)}`) : binary('arith', '-', number('0'), this.numeric(arg));
        break;
      }
      case 'ConditionalExpression':
        if (nodes.length === 3) return this.ternary(nodes[0], nodes[1], nodes[2]);
        break;
      case 'CastExpression': {
        const [type, value] = nodes, TYPE = normalize(this.text(type));
        if (value && castTypes.includes(TYPE)) return this.cCast(TYPE, value);
        break;
      }
      case 'SubscriptExpression': return this.indexing(node) ?? this.raw(node, true);
      case 'FieldExpression': {
        const member = this.member(node);
        if (member && ['first', 'second'].includes(member.OP)) return block('container_op_expr', member);
        break;
      }
      case 'PointerExpression': {
        const call = this.call(nodes[0]);
        if (text.startsWith('*') && call && ['min_element', 'max_element'].includes(call.name) && call.args.length === 2) {
          const range = this.range(...call.args);
          if (range && !range.size) return block('container_stat', { VAR: range.VAR, OP: call.name.slice(0, 3) });
        }
        break;
      }
      case 'CallExpression': return this.expressionCall(node) ?? this.raw(node, true);
    }
    return this.raw(node, true);
  }

  private ternary(cond: Node, yes: Node, no: Node) {
    return block('ternary', {}, { COND: this.expr(cond), THEN: this.expr(yes), ELSE: this.expr(no) });
  }

  private numeric(node: Node): Block {
    const value = this.expr(node);
    return nonNumeric(value) ? this.raw(node, true) : value;
  }

  private cCast(TYPE: string, operand: Node): Block {
    // Lezer's C-style cast can greedily include a following binary or conditional operator.
    const [a, op, b] = contents(operand);
    if (operand.name === 'BinaryExpression' && a && b && Object.hasOwn(binaryTypes, this.text(op))) {
      const OP = this.text(op);
      const kind = binaryTypes[OP];
      return binary(kind, OP, this.cCast(TYPE, a), ['arith', 'bitwise'].includes(kind) ? this.numeric(b) : this.expr(b));
    }
    if (operand.name === 'ConditionalExpression' && a && op && b) {
      return block('ternary', {}, { COND: this.cCast(TYPE, a), THEN: this.expr(op), ELSE: this.expr(b) });
    }
    return block('cast', { TYPE }, { VALUE: this.expr(operand) });
  }

  private member(node?: Node) {
    const [receiver, field] = contents(node), VAR = this.text(receiver), OP = this.text(field);
    if (node?.name === 'FieldExpression' && receiver?.name === 'Identifier' && field?.name === 'FieldIdentifier' &&
      this.code.slice(receiver.to, field.from).trim() === '.') return { VAR, OP };
  }

  private expressionCall(node: Node): Block | undefined {
    const call = this.call(node);
    if (!call) return;
    const { name, args, callee, list } = call;
    const [a, b, c] = args;
    const type = /^static_cast\s*<(.+)>$/.exec(name)?.[1] ?? (typeNames.includes(callee.name) ? name : undefined);
    if (type && args.length === 1 && castTypes.includes(normalize(type))) return block('cast', { TYPE: normalize(type) }, { VALUE: this.expr(a) });
    if (mathOps.includes(name) && args.length === (['abs', 'sqrt'].includes(name) ? 1 : 2)) {
      return block('math_func', { FUNC: name }, { A: this.numeric(a), B: b && this.numeric(b) });
    }
    if (['stoi', 'to_string'].includes(name) && args.length === 1) {
      return block('string_op', { VAR: a.name === 'Identifier' ? this.text(a) : '', OP: name }, { ARG: this.expr(a) });
    }
    if (name === 'accumulate' && args.length === 3 && /^0(?:ll)?$/i.test(this.text(c))) {
      const range = this.range(a, b);
      if (range && !range.size) return block('container_stat', { VAR: range.VAR, OP: 'sum' });
    }
    if (name === 'make_pair' && args.length === 2) return block('make_pair', {}, { FIRST: this.expr(a), SECOND: this.expr(b) });
    const member = this.member(callee);
    if (member) {
      const { VAR, OP } = member;
      if ((OP === 'substr' && [1, 2].includes(args.length)) || (OP === 'find' && args.length === 1) ||
        (OP === 'size' && !args.length && this.types.get(VAR) === 'string')) {
        return block('string_op', member, { ARG: a && this.expr(a), ARG2: b && this.expr(b) });
      }
      if (containerExpressionOps.includes(OP) && !['first', 'second'].includes(OP) && args.length === Number(OP === 'count')) {
        return block('container_op_expr', member, { ARG: a && this.expr(a) });
      }
      return;
    }
    if (callee.name === 'Identifier' && !mathOps.includes(name) &&
      !['stoi', 'to_string', 'accumulate', 'min_element', 'max_element', 'make_pair'].includes(name)) {
      return block('func_call_expr', { NAME: name, ARGS: this.code.slice(list.from + 1, list.to - 1) });
    }
  }

  private stream(node: Node, op: string, stream: string): Node[] | undefined {
    if (normalize(this.text(node)) === stream) return [];
    if (node.name !== 'BinaryExpression') return;
    const [left, operator, right] = contents(node);
    if (!left || !right || this.text(operator) !== op) return;
    const previous = this.stream(left, op, stream);
    if (previous) return [...previous, right];
  }

  private outputOperands(nodes: Node[]): Array<{ node: Node; cast?: string }> {
    // A greedy cast can swallow trailing stream insertions. Split them back out
    // without splitting a shift explicitly enclosed in parentheses.
    const split = (node: Node, cast?: string): Array<{ node: Node; cast?: string }> => {
      const [a, op, b] = contents(node);
      if (cast && node.name === 'BinaryExpression' && this.text(op) === '<<') {
        return [...split(a, cast), { node: b }];
      }
      return [{ node, cast }];
    };
    return nodes.flatMap((node) => {
      const [type, operand] = contents(node);
      const cast = normalize(this.text(type));
      return node.name === 'CastExpression' && operand && castTypes.includes(cast) ? split(operand, cast) : [{ node }];
    });
  }

  private assignment(node: Node): { lhs: Node; OP: string; value: () => Block } | undefined {
    const [a, op, b] = contents(node);
    if (node.name === 'AssignmentExpression') {
      const compound = op?.name === 'UpdateOp';
      const rhs = compound ? b : op;
      if (a && rhs) return { lhs: a, OP: compound ? this.text(op) : '=', value: () => this.expr(rhs) };
    }
    // Lezer can place a low-precedence operator above the assignment rather
    // than inside its RHS. Recover only along the unparenthesized left spine.
    if (a && op && b && ['BinaryExpression', 'ConditionalExpression'].includes(node.name)) {
      const target = this.assignment(a);
      if (!target) return;
      if (node.name === 'ConditionalExpression') return {
        ...target, value: () => block('ternary', {}, { COND: target.value(), THEN: this.expr(op), ELSE: this.expr(b) }),
      };
      const OP = this.text(op);
      if (Object.hasOwn(binaryTypes, OP)) return {
        ...target, value: () => binary(binaryTypes[OP], OP, target.value(), this.expr(b)),
      };
    }
  }

  private expressionStatement(node: Node): Block | undefined {
    if (node.name === 'UpdateExpression') {
      const items = contents(node);
      const id = items.find((n) => n.name === 'Identifier'), op = items.find((n) => n.name === 'UpdateOp');
      if (id && op && items.length === 2) return block('var_incdec', { VAR: this.text(id), OP: this.text(op) });
    }
    const assignment = this.assignment(node);
    if (assignment && assignmentOps.includes(assignment.OP)) {
      const { lhs, OP, value } = assignment;
      if (lhs.name === 'Identifier') return block('var_set', { VAR: this.text(lhs), OP }, { VALUE: value() });
      if (OP === '=') return this.indexing(lhs, value());
    }
    const read = this.stream(node, '>>', 'cin');
    if (read?.length && read.every((n) => n.name === 'Identifier' || this.subscript(n))) {
      const targets = read.map((n) => this.text(n));
      if (targets.every((t) => !/[\s,]/.test(t))) return block('cin', { TARGETS: targets.join(', ') });
    }
    const stream = this.stream(node, '<<', 'cout');
    const print = stream && this.outputOperands(stream);
    if (print?.length) {
      const newline = ({ node, cast }: typeof print[number]) => !cast && /^(?:'\\n'|endl)$/.test(normalize(this.text(node)));
      const value = ({ node, cast }: typeof print[number]) => cast ? this.cCast(cast, node) : this.expr(node);
      const NEWLINE = newline(print[print.length - 1]);
      if (NEWLINE) print.pop();
      if (!print.length) return block('cout', { NEWLINE }, { VALUE: block('string', { TEXT: '' }) });
      if (print.length === 1) return block('cout', { NEWLINE }, { VALUE: value(print[0]) });
      const SEP = print.length === 2 ? '' : newline(print[1]) ? '\n' : !print[1].cast && /^['"] ['"]s?$/.test(this.text(print[1].node)) ? ' ' : undefined;
      if (SEP !== undefined && print.length <= 3) return block('cout_pair', { SEP, NEWLINE },
        { VAL1: value(print[0]), VAL2: value(print[print.length - 1]) });
      return;
    }
    const call = this.call(node);
    if (!call) return;
    const { callee, name, args, list } = call, [a, b, c] = args;
    if (name === 'getline' && args.length === 2 && normalize(this.text(a)) === 'cin' && b.name === 'Identifier') {
      return block('getline', { VAR: this.text(b) });
    }
    if (name === 'swap' && args.length === 2 && a.name === 'Identifier' && b.name === 'Identifier') {
      return block('swap_vars', { A: this.text(a), B: this.text(b) });
    }
    if (['sort', 'fill', 'reverse', 'lower_bound', 'upper_bound'].includes(name)) {
      const range = this.range(a, b);
      if (!range) return;
      const { VAR, array, size } = range;
      const SIZE = size && this.expr(size);
      if (name === 'sort') {
        const desc = args.length === 3 && /^(?:std::)?greater<[^<>]*>\(\)$/.test(this.text(c).replace(/\s/g, ''));
        if (args.length === 2 || desc) return block('algorithm_sort', { VAR, MODE: `${array ? 'array' : 'vector'}_${desc ? 'desc' : 'asc'}` }, { SIZE });
      } else if (name === 'fill' && args.length === 3 && !size) {
        return block('fill', { VAR }, { VALUE: this.expr(c) });
      } else if (args.length === (name === 'reverse' ? 2 : 3) && name !== 'fill') {
        return block('algorithm_op', { VAR, OP: name }, { SIZE, ARG: c && this.expr(c) });
      }
      return;
    }
    const member = this.member(callee);
    if (member && containerStatementOps.includes(member.OP) &&
      args.length === Number(['push_back', 'push_front', 'push', 'insert', 'erase', 'resize'].includes(member.OP))) {
      return block('container_op_stmt', member, { ARG: a && this.expr(a) });
    }
    if (callee.name === 'Identifier' && !['getline', 'swap'].includes(name)) {
      return block('func_call_stmt', { NAME: name, ARGS: this.code.slice(list.from + 1, list.to - 1) });
    }
  }

  private conditional(node: Node): Block | undefined {
    const [, condition, yes, , no] = contents(node);
    if (condition?.name !== 'ConditionClause' || contents(condition).length !== 1 || !yes) return;
    const COND = this.expr(condition), DO = this.body(yes);
    if (!no) return block('if', {}, { COND, DO });
    if (no.name === 'IfStatement') {
      const [, other, otherYes, , otherNo] = contents(no);
      if (other?.name === 'ConditionClause' && contents(other).length === 1 && otherYes) {
        return block('if_elseif_else', {}, {
          COND, DO, ELSE_IF_COND: this.expr(other), ELSE_IF_DO: this.body(otherYes), ELSE_DO: otherNo && this.body(otherNo),
        });
      }
    }
    return block('if_else', {}, { COND, DO, ELSE_DO: this.body(no) });
  }

  private forRange(node: Node): Block | undefined {
    const [, initial, condition, update, body] = contents(node);
    if (initial?.name !== 'Declaration' || condition?.name !== 'BinaryExpression' || !body) return;
    const [type, decl] = contents(initial), TYPE = normalize(this.text(type));
    const [id, start] = contents(decl), VAR = this.text(id);
    const [left, cmp, end] = contents(condition), CMP = this.text(cmp);
    if (!['int', 'long long'].includes(TYPE) || contents(initial).length !== 2 ||
      decl?.name !== 'InitDeclarator' || id?.name !== 'Identifier' || !start || !/=\s*$/.test(this.code.slice(id.to, start.from)) ||
      this.text(left) !== VAR || !['<', '<=', '>', '>='].includes(CMP) || !end) return;
    const descending = CMP.startsWith('>');
    const updateText = this.text(update).replace(/\s/g, '');
    let STEP: Block | undefined;
    if (update?.name === 'AssignmentExpression') {
      const [target, op, step] = contents(update);
      const negativeLiteral = /^-\s*\d/.test(this.text(step));
      const expected = descending && !negativeLiteral ? '-=' : '+=';
      if (this.text(target) !== VAR || this.text(op) !== expected || !step) return;
      STEP = this.expr(step);
    } else {
      const op = descending ? '--' : '++';
      if (updateText !== `${op}${VAR}` && updateText !== `${VAR}${op}`) return;
    }
    const START = this.expr(start), END = this.expr(end);
    const outer = this.types;
    this.types = new Map(outer).set(VAR, TYPE);
    const BODY = this.body(body);
    this.types = outer;
    return block('for_range', { TYPE, VAR, CMP }, { START, END, STEP, BODY });
  }

  private statement(node: Node): Block[] {
    const items = contents(node), [, condition, body] = items;
    let result: Block | undefined;
    if (parts(node).some((n) => n.type.isError)) return this.text(node).trim() ? [this.raw(node)] : [];
    switch (node.name) {
      case 'Declaration': return this.declaration(node) ?? [this.raw(node)];
      case 'LineComment': result = block('comment', { TEXT: this.text(node).slice(2).trim() }); break;
      case 'ExpressionStatement': if (items.length === 1) result = this.expressionStatement(items[0]); break;
      case 'IfStatement': result = this.conditional(node); break;
      case 'ForStatement': result = this.forRange(node); break;
      case 'ForRangeLoop': {
        const [, type, id, range, loopBody] = items;
        const ref = id?.name === 'ReferenceDeclarator';
        const VAR = this.text(ref ? id.getChild('Identifier') ?? undefined : id);
        const CONTAINER = this.text(range);
        if (type?.name === 'auto' && identifier.test(VAR) && (!ref || /^\s*&\s*\w+$/.test(this.text(id))) &&
          identifier.test(CONTAINER) && loopBody) {
          const outer = this.types;
          this.types = new Map(outer).set(VAR, 'auto');
          result = block('for_each', { VAR, CONTAINER, REF: ref }, { BODY: this.body(loopBody) });
          this.types = outer;
        }
        break;
      }
      case 'WhileStatement':
        if (condition?.name === 'ConditionClause' && body && contents(condition).length === 1) {
          const test = contents(condition)[0];
          const count = test.name === 'UpdateExpression' && /^([A-Za-z_]\w*)\s*--$/.exec(this.text(test));
          result = count ? block('while_t', { VAR: count[1] }, { BODY: this.body(body) })
            : block('while', {}, { COND: this.expr(test), BODY: this.body(body) });
        }
        break;
      case 'DoStatement':
        if (condition && items[3]?.name === 'ParenthesizedExpression') {
          result = block('do_while', {}, { BODY: this.body(condition), COND: this.expr(items[3]) });
        }
        break;
      case 'BreakStatement': case 'ContinueStatement':
        result = block('break_continue', { OP: this.text(items[0]) }); break;
      case 'ReturnStatement':
        result = block('return', {}, { VALUE: condition && this.expr(condition) }); break;
    }
    return result ? [result] : this.text(node).trim() ? [this.raw(node)] : [];
  }
}

const contentsWithComments = (node: Node) => children(node).filter((n) => !['{', '}'].includes(n.name));

export function parseCppToBlocks(code: string): ParseToBlocksResult {
  return new Cpp(code).parse();
}
