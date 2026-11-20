import * as Blockly from 'blockly';
import { controlBlocks } from './control';
import { ioBlocks } from './io';
import { methodBlocks } from './methods';
import { operatorBlocks } from './operators';
import { structureBlocks } from './structure';
import { variableBlocks } from './variables';

const blocks = [...structureBlocks, ...variableBlocks, ...ioBlocks, ...operatorBlocks, ...controlBlocks, ...methodBlocks];
export const BLOCK_CATALOG: Array<{ type: string; label: string; category: string; keywords: string[] }> =
  blocks.map(({ catalog }) => catalog);

let registered = false;
export function registerAllBlocks(): void {
  if (registered) return;
  Blockly.defineBlocksWithJsonArray(blocks.map(({ json }) => json));
  registered = true;
}
