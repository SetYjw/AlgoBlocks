import React, { useState } from 'react';
import {
  Terminal,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertOctagon,
  Play,
} from 'lucide-react';
import type { JudgeStatus, RunResponse, RunTestCaseResult } from '../api/runnerApi';

export interface EditableTestCase {
  id: string;
  name: string;
  input: string;
  expectedOutput: string;
}

interface RunnerPanelProps {
  testCases: EditableTestCase[];
  onChangeTestCases: (cases: EditableTestCase[]) => void;
  runResponse: RunResponse | null;
  runError: string | null;
  isRunning: boolean;
  onRun: () => void;
}

const STATUS_STYLE: Record<
  JudgeStatus,
  { bg: string; text: string; border: string; dot: string; label: string }
> = {
  AC: {
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-300',
    border: 'border-emerald-500/40',
    dot: 'bg-emerald-400',
    label: 'AC 通过',
  },
  OK: {
    bg: 'bg-cyan-500/15',
    text: 'text-cyan-300',
    border: 'border-cyan-500/40',
    dot: 'bg-cyan-400',
    label: '运行正常',
  },
  WA: {
    bg: 'bg-rose-500/15',
    text: 'text-rose-300',
    border: 'border-rose-500/40',
    dot: 'bg-rose-400',
    label: 'WA 答案错误',
  },
  TLE: {
    bg: 'bg-amber-500/15',
    text: 'text-amber-300',
    border: 'border-amber-500/40',
    dot: 'bg-amber-400',
    label: 'TLE 超时',
  },
  RE: {
    bg: 'bg-purple-500/15',
    text: 'text-purple-300',
    border: 'border-purple-500/40',
    dot: 'bg-purple-400',
    label: 'RE 运行错误',
  },
};

export const RunnerPanel: React.FC<RunnerPanelProps> = ({
  testCases,
  onChangeTestCases,
  runResponse,
  runError,
  isRunning,
  onRun,
}) => {
  const [activeId, setActiveId] = useState<string>(testCases[0]?.id ?? '');

  const currentCase =
    testCases.find((tc) => tc.id === activeId) ?? testCases[0] ?? null;

  const resultById = new Map<string, RunTestCaseResult>();
  runResponse?.results.forEach((r) => resultById.set(r.id, r));
  const activeResult = currentCase ? resultById.get(currentCase.id) : undefined;

  const handleAddCase = () => {
    const nextIdx = testCases.length + 1;
    const newCase: EditableTestCase = {
      id: `tc-${Date.now()}`,
      name: `样例 ${nextIdx}`,
      input: '',
      expectedOutput: '',
    };
    onChangeTestCases([...testCases, newCase]);
    setActiveId(newCase.id);
  };

  const handleRemoveCase = (id: string) => {
    if (testCases.length <= 1) return;
    const next = testCases.filter((tc) => tc.id !== id);
    onChangeTestCases(next);
    if (activeId === id) {
      setActiveId(next[0].id);
    }
  };

  const handleUpdateField = (field: 'input' | 'expectedOutput', value: string) => {
    if (!currentCase) return;
    onChangeTestCases(
      testCases.map((tc) =>
        tc.id === currentCase.id ? { ...tc, [field]: value } : tc
      )
    );
  };

  const acCount =
    runResponse?.results.filter((r) => r.status === 'AC' || r.status === 'OK').length ?? 0;
  const totalCount = runResponse?.results.length ?? 0;

  return (
    <section className="flex flex-col h-full bg-[#0b101b] overflow-hidden">
      {/* Top Bar: Tabs + Summary */}
      <div className="h-9 shrink-0 px-2.5 border-b border-slate-800/90 bg-[#0d1320] flex items-center justify-between gap-2 select-none">
        <div className="flex items-center gap-1 overflow-x-auto min-w-0">
          <Terminal className="w-3.5 h-3.5 text-cyan-400 shrink-0 mr-1" />
          {testCases.map((tc) => {
            const isSelected = currentCase?.id === tc.id;
            const res = resultById.get(tc.id);
            return (
              <div
                key={tc.id}
                onClick={() => setActiveId(tc.id)}
                className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer shrink-0 transition-colors ${
                  isSelected
                    ? 'bg-slate-800 text-slate-100 border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                {res && (
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_STYLE[res.status].dot}`} />
                )}
                <span>{tc.name}</span>
                {testCases.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveCase(tc.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition-opacity cursor-pointer"
                    title="删除样例"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={handleAddCase}
            className="flex items-center gap-0.5 px-1.5 py-1 rounded-md text-[11px] text-slate-400 hover:text-indigo-300 hover:bg-slate-800/60 cursor-pointer shrink-0"
            title="新增测试样例"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Summary pill */}
        <div className="flex items-center gap-2 shrink-0">
          {runResponse && !runResponse.compileOk && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-purple-500/15 border border-purple-500/40 text-purple-300">
              CE 编译错误
            </span>
          )}
          {runResponse && runResponse.compileOk && totalCount > 0 && (
            <span
              className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                acCount === totalCount
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
              }`}
            >
              {acCount}/{totalCount} 通过 · 编译 {runResponse.compileTimeMs}ms
            </span>
          )}
          <button
            type="button"
            onClick={onRun}
            disabled={isRunning}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-indigo-600/20 hover:bg-indigo-600/35 text-indigo-300 border border-indigo-500/30 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>运行</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3">
        {/* Network / Runner Error */}
        {runError && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-200 flex items-start gap-2">
            <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="font-mono whitespace-pre-wrap break-all">{runError}</div>
          </div>
        )}

        {/* Compile Error Box */}
        {runResponse && !runResponse.compileOk && (
          <div className="rounded-lg border border-purple-500/40 bg-purple-950/30 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-300 mb-1.5">
              <XCircle className="w-4 h-4" />
              <span>编译失败 (Compile Error)</span>
            </div>
            <pre className="text-[11px] font-mono text-purple-200/90 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
              {runResponse.compileError || '未知编译错误'}
            </pre>
          </div>
        )}

        {/* Editable Input & Expected Output */}
        {currentCase && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-slate-400">
                标准输入 (stdin)
              </label>
              <textarea
                value={currentCase.input}
                onChange={(e) => handleUpdateField('input', e.target.value)}
                rows={4}
                spellCheck={false}
                placeholder="输入测试数据..."
                className="w-full rounded-lg bg-[#0f172a] border border-slate-800 focus:border-indigo-500/70 p-2 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none resize-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-slate-400">
                期望输出 (留空则仅运行)
              </label>
              <textarea
                value={currentCase.expectedOutput}
                onChange={(e) => handleUpdateField('expectedOutput', e.target.value)}
                rows={4}
                spellCheck={false}
                placeholder="期望的 stdout..."
                className="w-full rounded-lg bg-[#0f172a] border border-slate-800 focus:border-indigo-500/70 p-2 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none resize-none"
              />
            </div>
          </div>
        )}

        {/* Active Test Case Result */}
        {activeResult && (
          <div className="rounded-lg border border-slate-800 bg-[#0f172a]/80 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${STATUS_STYLE[activeResult.status].bg} ${STATUS_STYLE[activeResult.status].text} ${STATUS_STYLE[activeResult.status].border}`}
                >
                  {activeResult.status === 'AC' || activeResult.status === 'OK' ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  {STATUS_STYLE[activeResult.status].label}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400">
                  <Clock className="w-3 h-3" />
                  {activeResult.timeMs} ms
                </span>
              </div>
              {activeResult.exitCode !== null && activeResult.exitCode !== 0 && (
                <span className="text-[11px] font-mono text-rose-400">
                  exitCode: {activeResult.exitCode}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <div className="text-[11px] text-slate-400">实际输出 (stdout)</div>
              <pre className="rounded-md bg-[#090d16] border border-slate-800/90 p-2 text-xs font-mono text-slate-200 whitespace-pre-wrap break-all max-h-36 overflow-y-auto">
                {activeResult.stdout !== '' ? activeResult.stdout : '(空输出)'}
              </pre>
            </div>

            {activeResult.stderr && (
              <div className="flex flex-col gap-1">
                <div className="text-[11px] text-rose-400">标准错误 (stderr)</div>
                <pre className="rounded-md bg-rose-950/30 border border-rose-500/30 p-2 text-xs font-mono text-rose-200 whitespace-pre-wrap break-all max-h-28 overflow-y-auto">
                  {activeResult.stderr}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
