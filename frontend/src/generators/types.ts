import type * as Blockly from 'blockly';

export interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  blockId?: string;
}

export interface GenerateOptions {
  useBitsHeader?: boolean;
  cppStd?: 'c++17' | 'c++20';
}

export interface GeneratedCodeResult {
  code: string;
  headers: string[];
  diagnostics: Diagnostic[];
  lineMap: Record<string, [number, number]>;
}

export interface LanguageTarget {
  id: string;
  label: string;
  fileExtension: string;
  generate(workspace: Blockly.Workspace, options?: GenerateOptions): GeneratedCodeResult;
}
