import type { Block } from 'blockly';

export const singleLine = (text: string) => text.replace(/[\r\n\u2028\u2029]+/g, ' ');

export function character(block: Block): string {
  const text = String(block.getFieldValue('TEXT') ?? '');
  const escapes = new Map([['\\n', '\n'], ['\\r', '\r'], ['\\t', '\t'], ['\\0', '\0'], ['\\\\', '\\'], ["\\'", "'"]]);
  return escapes.get(text) ?? ([...text][0] || '\0');
}

// Split only outside grouping and quoted text (e.g. a[i + 1], n).
export function splitFields(text: string, delimiter: RegExp): string[] {
  const fields: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char)) depth--;
    else if (depth === 0 && delimiter.test(char)) {
      if (start !== i) fields.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (start < text.length) fields.push(text.slice(start).trim());
  return fields.filter(Boolean);
}
