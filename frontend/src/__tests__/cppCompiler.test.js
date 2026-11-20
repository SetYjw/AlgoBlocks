import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Blockly from 'blockly';
import { expect, it } from 'vitest';
import { registerAllBlocks } from '../blocks';
import { ALGO_TEMPLATES } from '../core/templates';
import { getLanguageTarget } from '../generators';
import { newBlocksFixture } from './generatorFixtures';

registerAllBlocks();
const cpp = getLanguageTarget('cpp');
const hasCompiler = spawnSync('g++', ['--version']).status === 0;

it.skipIf(!hasCompiler).each([...ALGO_TEMPLATES, newBlocksFixture])('compiles and runs $id with g++', (template) => {
  const directory = mkdtempSync(join(fileURLToPath(new URL('.', import.meta.url)), '.cpp-test-'));
  const workspace = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(template.workspaceJson, workspace);
    for (const [cppStd, useBitsHeader] of [['c++17', true], ['c++20', false]]) {
      const executable = join(directory, 'solution.exe');
      const build = spawnSync('g++', [`-std=${cppStd}`, '-pedantic-errors', '-x', 'c++', '-', '-o', executable], {
        input: cpp.generate(workspace, { cppStd, useBitsHeader }).code, encoding: 'utf8', timeout: 20_000,
      });
      expect(build.status, build.stderr ?? build.error?.message).toBe(0);
      for (const test of template.testCases) {
        const run = spawnSync(executable, [], { input: test.input, encoding: 'utf8', timeout: 2_000 });
        expect(run.status, run.stderr ?? run.error?.message).toBe(0);
        expect(run.stdout.replace(/\r\n/g, '\n')).toBe(test.expectedOutput);
      }
    }
  } finally {
    workspace.dispose();
    rmSync(directory, { recursive: true });
  }
}, 45_000);
