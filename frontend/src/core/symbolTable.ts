import type * as Blockly from 'blockly';

export type SymbolKind = 'scalar' | 'array' | 'container' | 'function';

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  baseType: string;
  elemType?: string;
  elemType2?: string;
  params?: string;
  returnType?: string;
  blockId: string;
  isGlobal: boolean;
}

export interface SymbolTable {
  symbols: SymbolInfo[];
  byName: Map<string, SymbolInfo>;
}

export function scanWorkspaceSymbols(workspace: Blockly.Workspace): SymbolTable {
  const symbols: SymbolInfo[] = [];
  const byName = new Map<string, SymbolInfo>();
  for (const block of workspace.getAllBlocks(true)) {
    if (!block.isEnabled() || block.getInheritedDisabled()) continue;
    const field = (name: string) => String(block.getFieldValue(name) ?? '').trim();
    const loop = block.type === 'algo_for_range' || block.type === 'algo_for_each';
    const name = field(loop ? 'VAR' : 'NAME');
    if (!name) continue;

    const blockId = block.id;
    const isGlobal = block.getRootBlock().type === 'algo_global_section' && !loop;
    let symbol: SymbolInfo;
    switch (block.type) {
      case 'algo_decl_var':
      case 'algo_decl_const':
      case 'algo_for_range':
        symbol = { name, blockId, isGlobal, kind: 'scalar', baseType: field('TYPE') };
        break;
      case 'algo_for_each':
        symbol = { name, blockId, isGlobal, kind: 'scalar', baseType: 'auto' };
        break;
      case 'algo_decl_array':
      case 'algo_decl_array2d':
        symbol = { name, blockId, isGlobal, kind: 'array', baseType: field('TYPE'), elemType: field('TYPE') };
        break;
      case 'algo_decl_container': {
        const baseType = field('CONTAINER');
        symbol = { name, blockId, isGlobal, kind: 'container', baseType, elemType: field('ELEM_TYPE') };
        if (['map', 'unordered_map', 'pair'].includes(baseType)) symbol.elemType2 = field('ELEM_TYPE2');
        break;
      }
      case 'algo_func_def': {
        const returnType = field('RET_TYPE');
        symbol = { name, blockId, isGlobal: true, kind: 'function', baseType: returnType, returnType, params: field('PARAMS') };
        break;
      }
      default:
        continue;
    }
    symbols.push(symbol);
    // Keep all declarations in symbols; a bare name lookup favors the global declaration.
    if (!byName.has(name) || (symbol.isGlobal && !byName.get(name)?.isGlobal)) byName.set(name, symbol);
  }
  return { symbols, byName };
}
