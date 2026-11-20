import { cppTarget } from './cpp';
import { pythonTarget } from './python';
import type { LanguageTarget } from './types';

export type { Diagnostic, GenerateOptions, GeneratedCodeResult, LanguageTarget } from './types';

export function listLanguageTargets(): LanguageTarget[] {
  return [cppTarget, pythonTarget];
}

export function getLanguageTarget(id: string): LanguageTarget {
  const target = listLanguageTargets().find((language) => language.id === id);
  if (!target) throw new Error(`Unsupported language target: ${id}`);
  return target;
}
