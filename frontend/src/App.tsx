import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HeaderBar } from './components/HeaderBar';
import { BlocklyCanvas, type BlocklyCanvasHandle } from './components/BlocklyCanvas';
import { CodePanel } from './components/CodePanel';
import { RunnerPanel, type EditableTestCase } from './components/RunnerPanel';
import { QuickSearchModal } from './components/QuickSearchModal';
import { CodeToBlocksModal } from './components/CodeToBlocksModal';
import { ALGO_TEMPLATES, type AlgoTemplate } from './core/templates';
import type { GeneratedCodeResult } from './generators';
import type { ParseToBlocksResult } from './parsers';
import {
  fetchHealth,
  runCode,
  type HealthResponse,
  type RunResponse,
  type TargetLanguage,
} from './api/runnerApi';

export function App() {
  const canvasRef = useRef<BlocklyCanvasHandle | null>(null);
  const rootContainerRef = useRef<HTMLDivElement | null>(null);
  const rightPaneRef = useRef<HTMLDivElement | null>(null);

  const [activeTemplateId, setActiveTemplateId] = useState<string>(
    ALGO_TEMPLATES[0]?.id ?? ''
  );
  const [language, setLanguage] = useState<TargetLanguage>('cpp');
  const [cppStd, setCppStd] = useState<'c++17' | 'c++20'>('c++20');
  const [useBitsHeader, setUseBitsHeader] = useState<boolean>(true);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [codeImportOpen, setCodeImportOpen] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [generated, setGenerated] = useState<GeneratedCodeResult>({
    code: '// 正在初始化积木画布...',
    lineMap: {},
    headers: [],
    diagnostics: [],
  });
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const [testCases, setTestCases] = useState<EditableTestCase[]>(
    ALGO_TEMPLATES[0]?.testCases.map((tc) => ({ ...tc })) ?? [
      { id: 'tc-1', name: '样例 1', input: '', expectedOutput: '' },
    ]
  );

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [runResponse, setRunResponse] = useState<RunResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // Split pane percentages
  const [leftWidthPct, setLeftWidthPct] = useState<number>(58);
  const [codeHeightPct, setCodeHeightPct] = useState<number>(56);

  // Poll compiler health once on mount
  useEffect(() => {
    let active = true;
    fetchHealth().then((h) => {
      if (active) setHealth(h);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleRun = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setRunError(null);
    try {
      const preferLocal = Boolean(
        health?.ok &&
          (language === 'cpp'
            ? health.compilers.gpp.available
            : health.compilers.python.available)
      );
      const resp = await runCode(
        {
          language,
          std: language === 'cpp' ? cppStd : undefined,
          code: generated.code,
          timeLimitMs: 2000,
          testCases: testCases.map((tc) => ({
            id: tc.id,
            input: tc.input,
            expectedOutput: tc.expectedOutput,
          })),
        },
        preferLocal
      );
      setRunResponse(resp);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, health, language, cppStd, generated.code, testCases]);

  // Global keyboard shortcuts: Ctrl+K (search), Ctrl+Enter (run)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRun();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleRun]);

  const handleSelectTemplate = (template: AlgoTemplate) => {
    setActiveTemplateId(template.id);
    setTestCases(template.testCases.map((tc) => ({ ...tc })));
    setRunResponse(null);
    setRunError(null);
    canvasRef.current?.loadWorkspaceJson(template.workspaceJson);
  };

  const handleChangeLanguage = (nextLang: TargetLanguage) => {
    setLanguage(nextLang);
    setRunResponse(null);
    setRunError(null);
  };

  const downloadFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const data = canvasRef.current?.exportWorkspaceJson();
    if (!data) return;
    downloadFile(
      `algoblocks-${activeTemplateId || 'project'}.json`,
      JSON.stringify(data, null, 2),
      'application/json'
    );
  };

  const handleImportJson = (jsonText: string) => {
    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      canvasRef.current?.loadWorkspaceJson(parsed);
      setRunResponse(null);
      setRunError(null);
    } catch {
      setRunError('导入失败：JSON 文件格式无效');
    }
  };

  const handleExportSource = () => {
    const filename = language === 'python' ? 'main.py' : 'main.cpp';
    const mime = language === 'python' ? 'text/x-python' : 'text/x-c++src';
    downloadFile(filename, generated.code, mime);
  };

  const handleApplyParsedBlocks = (
    result: ParseToBlocksResult,
    parsedLang: TargetLanguage
  ) => {
    setLanguage(parsedLang);
    canvasRef.current?.loadWorkspaceJson(result.workspaceJson);
    setRunResponse(null);
    setRunError(null);
    const fallbackNote =
      result.stats.rawFallbackCount > 0
        ? `（含 ${result.stats.rawFallbackCount} 个自定义代码兜底块）`
        : '';
    setToastMsg(`已转换 ${result.stats.totalBlocks} 个积木${fallbackNote}`);
    window.setTimeout(() => setToastMsg(null), 3600);
  };

  // Drag horizontal splitter (Left Blockly vs Right Code/Runner)
  const startHorizontalDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = rootContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const onMove = (ev: MouseEvent) => {
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftWidthPct(Math.max(30, Math.min(76, pct)));
      canvasRef.current?.resize();
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      canvasRef.current?.resize();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Drag vertical splitter (Code top vs Runner bottom)
  const startVerticalDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const pane = rightPaneRef.current;
    if (!pane) return;
    const rect = pane.getBoundingClientRect();

    const onMove = (ev: MouseEvent) => {
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      setCodeHeightPct(Math.max(22, Math.min(78, pct)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const highlightRange =
    selectedBlockId && generated.lineMap[selectedBlockId]
      ? generated.lineMap[selectedBlockId]
      : null;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#090d16] text-slate-100">
      <HeaderBar
        templates={ALGO_TEMPLATES}
        activeTemplateId={activeTemplateId}
        onSelectTemplate={handleSelectTemplate}
        language={language}
        onChangeLanguage={handleChangeLanguage}
        cppStd={cppStd}
        onChangeCppStd={setCppStd}
        useBitsHeader={useBitsHeader}
        onToggleBitsHeader={() => setUseBitsHeader((prev) => !prev)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenCodeToBlocks={() => setCodeImportOpen(true)}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onExportSource={handleExportSource}
        onRun={handleRun}
        isRunning={isRunning}
        health={health}
      />

      <main ref={rootContainerRef} className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left/Center: Blockly Workspace */}
        <div
          style={{ width: `${leftWidthPct}%` }}
          className="h-full min-w-0 overflow-hidden"
        >
          <BlocklyCanvas
            ref={canvasRef}
            language={language}
            generateOptions={{ useBitsHeader, cppStd }}
            onCodeGenerated={setGenerated}
            onSelectBlock={setSelectedBlockId}
          />
        </div>

        {/* Horizontal Drag Handle */}
        <div
          onMouseDown={startHorizontalDrag}
          className="w-1.5 shrink-0 bg-slate-900 hover:bg-indigo-500/60 border-x border-slate-800/80 cursor-col-resize transition-colors"
          title="拖拽调整画布与代码区宽度"
        />

        {/* Right: Code Preview + Runner */}
        <div
          ref={rightPaneRef}
          style={{ width: `${100 - leftWidthPct}%` }}
          className="h-full min-w-0 flex flex-col overflow-hidden"
        >
          <div style={{ height: `${codeHeightPct}%` }} className="min-h-0 overflow-hidden">
            <CodePanel
              language={language}
              code={generated.code}
              highlightRange={highlightRange}
              diagnostics={generated.diagnostics}
            />
          </div>

          {/* Vertical Drag Handle */}
          <div
            onMouseDown={startVerticalDrag}
            className="h-1.5 shrink-0 bg-slate-900 hover:bg-indigo-500/60 border-y border-slate-800/80 cursor-row-resize transition-colors"
            title="拖拽调整代码区与运行区高度"
          />

          <div
            style={{ height: `${100 - codeHeightPct}%` }}
            className="min-h-0 overflow-hidden"
          >
            <RunnerPanel
              testCases={testCases}
              onChangeTestCases={setTestCases}
              runResponse={runResponse}
              runError={runError}
              isRunning={isRunning}
              onRun={handleRun}
            />
          </div>
        </div>
      </main>

      <QuickSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectBlock={(type) => canvasRef.current?.spawnBlock(type)}
      />

      <CodeToBlocksModal
        open={codeImportOpen}
        defaultLanguage={language}
        currentCode={generated.code}
        onClose={() => setCodeImportOpen(false)}
        onApplyBlocks={handleApplyParsedBlocks}
      />

      {toastMsg && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-slate-900/95 border border-cyan-500/40 text-xs text-cyan-200 shadow-xl shadow-black/50">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

export default App;
