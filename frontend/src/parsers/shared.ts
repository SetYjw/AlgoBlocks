import type { SyntaxNode } from '@lezer/common';
import type { serialization } from 'blockly';
import type { ParseToBlocksResult } from './types';

export type Node = SyntaxNode;
export type Block = serialization.blocks.State;

export function block(
  type: string, fields: Record<string, string | boolean> = {}, children: Record<string, Block | undefined> = {},
): Block {
  const inputs: NonNullable<Block['inputs']> = {};
  for (const [name, child] of Object.entries(children)) if (child) inputs[name] = { block: child };
  return {
    type: `algo_${type}`,
    ...(Object.keys(fields).length ? { fields } : {}),
    ...(Object.keys(inputs).length ? { inputs } : {}),
  };
}

export function chain(blocks: Block[]): Block | undefined {
  let next: Block | undefined;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (next) blocks[i].next = { block: next };
    next = blocks[i];
  }
  return next;
}

export const children = (node?: Node): Node[] => {
  const result: Node[] = [];
  for (let child = node?.firstChild; child; child = child.nextSibling) result.push(child);
  return result;
};
export const isComment = (node: Node) => /^(?:LineComment|BlockComment|Comment)$/.test(node.name);
export const parts = (node?: Node) => children(node).filter((n) => !isComment(n));
export const contents = (node?: Node) => parts(node).filter((n) => !'()[]{},;:<>'.includes(n.name));
export const identifier = /^[A-Za-z_]\w*$/;
export const number = (NUM: string) => block('number', { NUM });
export const binary = (type: string, OP: string, A: Block, B: Block) => block(type, { OP }, { A, B });
export const binaryTypes: Record<string, string> = {
  '+': 'arith', '-': 'arith', '*': 'arith', '/': 'arith', '%': 'arith',
  '==': 'compare', '!=': 'compare', '<': 'compare', '<=': 'compare', '>': 'compare', '>=': 'compare',
  '&&': 'logic', '||': 'logic', '&': 'bitwise', '|': 'bitwise', '^': 'bitwise', '<<': 'bitwise', '>>': 'bitwise',
};
export const assignmentOps = ['=', '+=', '-=', '*=', '/=', '%=', '>>='];
export const mathOps = ['abs', 'min', 'max', 'sqrt', 'pow', 'gcd', 'lcm'];
export const castTypes = ['int', 'long long', 'double', 'char'];
export const nonNumeric = (value: Block) => [
  'algo_string', 'algo_char', 'algo_bool', 'algo_compare', 'algo_logic', 'algo_not',
].includes(value.type);

// Return undefined for escapes or literal forms we cannot decode without changing their value.
export function quoted(text: string, language: 'cpp' | 'python'): string | undefined {
  const match = /^(r)?("""|'''|"|')([\s\S]*)\2$/i.exec(text);
  if (!match || (language === 'cpp' && (match[1] || match[2].length !== 1))) return;
  if (match[1]) return match[3];
  let valid = true;
  const result = match[3].replace(/\\(?:x[\da-f]+|u[\da-f]{4}|U[\da-f]{8}|[0-7]{1,3}|\r?\n|[\s\S])/gi, (escape) => {
    const code = escape.slice(1);
    const basic: Record<string, string> = {
      n: '\n', r: '\r', t: '\t', a: '\x07', b: '\b', f: '\f', v: '\v',
      '\\': '\\', '"': '"', "'": "'", '\n': '', '\r\n': '',
    };
    if (Object.hasOwn(basic, code)) return basic[code];
    if (code === '?' && language === 'cpp') return '?';
    if (language === 'python' && /^x[\da-f]{2}/i.test(code)) {
      return String.fromCharCode(parseInt(code.slice(1, 3), 16)) + code.slice(3);
    }
    const point = /^[0-7]{1,3}$/.test(code) ? parseInt(code, 8)
      : /^(?:x[\da-f]+|u[\da-f]{4}|U[\da-f]{8})$/.test(code) ? parseInt(code.slice(1), 16) : NaN;
    if (point <= 0x10ffff && !(language === 'cpp' && /^[x0-7]/.test(code) && point > 255)) return String.fromCodePoint(point);
    valid = false;
    return escape;
  });
  return valid ? result : undefined;
}

export class Source {
  private readonly fallbackWarnings = new WeakMap<Block, string>();

  constructor(protected readonly code: string) {}

  protected text(node?: Node): string {
    return node ? this.code.slice(node.from, node.to) : '';
  }

  protected raw(node: Node, expression = false): Block {
    const start = this.code.lastIndexOf('\n', node.from - 1) + 1;
    const indent = /^[ \t]*/.exec(this.code.slice(start, node.from))![0];
    // Generators add their own indentation when emitting a raw statement.
    const [first, ...rest] = this.text(node).trimEnd().split(/\r?\n/);
    const text = [first, ...rest.map((line) => line.startsWith(indent) ? line.slice(indent.length) : line)].join('\n');
    const result = expression ? block('raw_expr', { EXPR: this.text(node) }) : block('raw_code', { CODE: text });
    const line = this.code.slice(0, node.from).split('\n').length;
    this.fallbackWarnings.set(result, `Line ${line}: kept ${node.type.isError ? 'unparsed source' : node.name} as raw ${expression ? 'expression' : 'code'}.`);
    return result;
  }

  protected finish(roots: Block[]): ParseToBlocksResult {
    const warnings: string[] = [];
    let totalBlocks = 0;
    let y = 40;
    const blocks = roots.map((root) => {
      let rows = 0;
      const pending = [root];
      while (pending.length) {
        const current = pending.pop()!;
        totalBlocks++;
        const warning = this.fallbackWarnings.get(current);
        if (warning) warnings.push(warning);
        if (current.next?.block) pending.push(current.next.block);
        for (const input of Object.values(current.inputs ?? {}).reverse()) if (input.block) pending.push(input.block);
        rows++;
      }
      const positioned = { ...root, x: 40, y };
      y += Math.max(100, rows * 36 + 48);
      return positioned;
    });
    return { workspaceJson: { blocks: { languageVersion: 0, blocks } }, warnings,
      stats: { totalBlocks, rawFallbackCount: warnings.length } };
  }
}
