import * as Blockly from 'blockly';
import { algorithmOps, stringOps } from '../blocks/methods';
import { scanWorkspaceSymbols } from './symbolTable';

type Items = Blockly.utils.toolbox.FlyoutItemInfoArray;
const label = (text: string) => ({ kind: 'label', text, id: undefined });
const block = (type: string, fields: Record<string, string> = {}) => ({ kind: 'block', type: `algo_${type}`, fields });

function variableItems(workspace: Blockly.Workspace): Items {
  const items: Items = [];
  const { symbols } = scanWorkspaceSymbols(workspace);
  const seen = new Set<string>();
  if (!symbols.some(({ kind }) => kind !== 'function')) items.push(label('请先拖入声明块来创建变量'));
  for (const symbol of symbols) {
    const key = `${symbol.kind}:${symbol.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (symbol.kind === 'function') {
      const fields = { NAME: symbol.name };
      if (symbol.returnType !== 'void') items.push(block('func_call_expr', fields));
      items.push(block('func_call_stmt', fields));
    } else {
      const fields = { VAR: symbol.name };
      items.push(block('var_get', fields), block('var_set', fields));
    }
  }
  return items;
}

function methodItems(workspace: Blockly.Workspace): Items {
  const items: Items = [];
  const seen = new Set<string>();
  for (const symbol of scanWorkspaceSymbols(workspace).symbols) {
    const VAR = symbol.name;
    if (seen.has(VAR)) continue;
    seen.add(VAR);
    const ops: Items = [];
    const add = (type: string, fields = {}) => ops.push(block(type, { VAR, ...fields }));
    const stmt = (...names: string[]) => names.forEach((OP) => add('container_op_stmt', { OP }));
    const expr = (...names: string[]) => names.forEach((OP) => add('container_op_expr', { OP }));
    if (symbol.kind === 'array') {
      if (workspace.getBlockById(symbol.blockId)?.type === 'algo_decl_array2d') {
        add('array2d_get');
        add('array2d_set');
      } else {
        add('array_get');
        add('array_set');
        for (const MODE of ['array_asc', 'array_desc']) add('algorithm_sort', { MODE });
      }
    } else if (symbol.kind === 'scalar' && symbol.baseType === 'string') {
      for (const OP of stringOps) add('string_op', { OP });
      stmt('push_back');
    } else if (symbol.kind === 'scalar' && ['int', 'long long', 'double', 'char', 'bool'].includes(symbol.baseType)) {
      add('string_op', { OP: 'to_string' });
    } else if (symbol.kind === 'container') {
      switch (symbol.baseType) {
        case 'vector':
        case 'deque':
          add('array_get');
          add('array_set');
          stmt('push_back', 'pop_back', 'clear', 'resize');
          expr('size', 'empty', 'back', 'front');
          add('fill');
          add('container_stat');
          if (symbol.baseType === 'deque') stmt('push_front', 'pop_front');
          for (const MODE of ['vector_asc', 'vector_desc']) add('algorithm_sort', { MODE });
          break;
        case 'stack':
        case 'queue':
        case 'priority_queue_max':
        case 'priority_queue_min':
          stmt('push', 'pop');
          expr(symbol.baseType === 'queue' ? 'front' : 'top', 'empty', 'size');
          break;
        case 'set':
        case 'map':
        case 'unordered_map':
          stmt('insert', 'erase', 'clear');
          expr('count', 'empty', 'size');
          if (symbol.baseType !== 'set') {
            add('map_get');
            add('map_set');
          }
          break;
        case 'pair':
          ops.push(block('make_pair'));
          expr('first', 'second');
          break;
      }
    }
    if (ops.length) items.push(label(`${VAR} · ${symbol.baseType}`), ...ops);
  }
  items.push(label('通用 <algorithm>'), block('algorithm_sort'));
  items.push(block('swap_vars'), block('fill'), block('container_stat'));
  for (const OP of algorithmOps) items.push(block('algorithm_op', { OP }));
  for (const OP of ['lower_bound', 'upper_bound']) items.push(block('algorithm_bound', { OP }));
  return items;
}

export function registerDynamicFlyouts(workspace: Blockly.WorkspaceSvg): void {
  workspace.registerToolboxCategoryCallback('ALGO_VARIABLES', variableItems);
  workspace.registerToolboxCategoryCallback('ALGO_METHODS', methodItems);
}

export function attachSymbolSync(workspace: Blockly.WorkspaceSvg): () => void {
  const signature = () => JSON.stringify(scanWorkspaceSymbols(workspace).symbols);
  const symbolEvents = new Set<string>([
    Blockly.Events.BLOCK_CREATE, Blockly.Events.BLOCK_DELETE, Blockly.Events.BLOCK_MOVE,
    Blockly.Events.BLOCK_CHANGE, Blockly.Events.FINISHED_LOADING,
  ]);
  let previous = signature();
  const listener = (event: Blockly.Events.Abstract) => {
    if (!symbolEvents.has(event.type)) return;
    const next = signature();
    if (next === previous) return;
    previous = next;
    const toolbox = workspace.getToolbox();
    if (!(toolbox instanceof Blockly.Toolbox) || !workspace.getFlyout()?.isVisible()) return;
    const selected = toolbox.getSelectedItem();
    if (!(selected instanceof Blockly.ToolboxCategory)) return;
    const contents = selected.getContents();
    if (contents === 'ALGO_VARIABLES' || contents === 'ALGO_METHODS') toolbox.refreshSelection();
  };
  workspace.addChangeListener(listener);
  return () => workspace.removeChangeListener(listener);
}
