import { parseCppToBlocks } from './cppToBlocks';
import { parsePythonToBlocks } from './pythonToBlocks';
import type { ParseToBlocksResult } from './types';

export type { ParseToBlocksResult } from './types';
export { parseCppToBlocks, parsePythonToBlocks };

export function parseCodeToBlocks(code: string, language: 'cpp' | 'python'): ParseToBlocksResult {
  return language === 'cpp' ? parseCppToBlocks(code) : parsePythonToBlocks(code);
}
