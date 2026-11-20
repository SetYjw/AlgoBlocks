import * as Blockly from 'blockly';
import { BLOCK_CATALOG } from '../blocks';
import { categories } from '../blocks/definition';

export const CATEGORY_COLORS: Record<string, string> = {
  程序结构: '#31589f',
  声明与变量: '#7140a6',
  我的变量: '#7140a6',
  类型方法与算法: '#186b65',
  输入输出: '#257196',
  运算与逻辑: '#865522',
  分支与循环: '#973b69',
};

export const algoDarkTheme: Blockly.Theme = Blockly.Theme.defineTheme('algo_dark', {
  name: 'algo_dark',
  base: Blockly.Themes.Zelos,
  blockStyles: Object.fromEntries(Object.entries(categories).map(([style, label]) => [
    `${style}_blocks`,
    { colourPrimary: CATEGORY_COLORS[label], colourSecondary: '#485a75', colourTertiary: '#151d2c' },
  ])),
  componentStyles: {
    workspaceBackgroundColour: '#0d1117',
    toolboxBackgroundColour: '#111827',
    toolboxForegroundColour: '#e2e8f0',
    flyoutBackgroundColour: '#0f172a',
    flyoutForegroundColour: '#e2e8f0',
    flyoutOpacity: 1,
    scrollbarColour: '#64748b',
    scrollbarOpacity: 0.55,
    insertionMarkerColour: '#93c5fd',
    insertionMarkerOpacity: 0.5,
    markerColour: '#7dd3fc',
    cursorColour: '#f8fafc',
    selectedGlowColour: '#93c5fd',
  },
});

function category(name: string, custom?: string) {
  const appearance = {
    kind: 'category', name, colour: CATEGORY_COLORS[name], id: undefined, categorystyle: undefined,
    cssconfig: undefined, hidden: undefined,
  };
  return custom ? { ...appearance, custom } : {
    ...appearance,
    contents: BLOCK_CATALOG.filter((block) => block.category === name).map(({ type }) => ({ kind: 'block', type })),
  };
}

export const TOOLBOX_CONFIG: Blockly.utils.toolbox.ToolboxInfo = {
  kind: 'categoryToolbox',
  contents: [
    category(categories.structure),
    category(categories.variables),
    category('我的变量', 'ALGO_VARIABLES'),
    category(categories.methods, 'ALGO_METHODS'),
    category(categories.io),
    category(categories.operators),
    category(categories.control),
  ],
};
