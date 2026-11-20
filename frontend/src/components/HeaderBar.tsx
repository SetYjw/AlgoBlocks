import React, { useRef } from 'react';
import {
  Blocks,
  Play,
  Loader2,
  Search,
  Download,
  Upload,
  FileCode2,
  Cpu,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import type { AlgoTemplate } from '../core/templates';
import type { HealthResponse, TargetLanguage } from '../api/runnerApi';

interface HeaderBarProps {
  templates: AlgoTemplate[];
  activeTemplateId: string;
  onSelectTemplate: (template: AlgoTemplate) => void;
  language: TargetLanguage;
  onChangeLanguage: (lang: TargetLanguage) => void;
  cppStd: 'c++17' | 'c++20';
  onChangeCppStd: (std: 'c++17' | 'c++20') => void;
  useBitsHeader: boolean;
  onToggleBitsHeader: () => void;
  onOpenSearch: () => void;
  onOpenCodeToBlocks: () => void;
  onExportJson: () => void;
  onImportJson: (jsonText: string) => void;
  onExportSource: () => void;
  onRun: () => void;
  isRunning: boolean;
  health: HealthResponse | null;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  templates,
  activeTemplateId,
  onSelectTemplate,
  language,
  onChangeLanguage,
  cppStd,
  onChangeCppStd,
  useBitsHeader,
  onToggleBitsHeader,
  onOpenSearch,
  onOpenCodeToBlocks,
  onExportJson,
  onImportJson,
  onExportSource,
  onRun,
  isRunning,
  health,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onImportJson(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const activeCompiler =
    language === 'cpp' ? health?.compilers.gpp : health?.compilers.python;
  const isLocalReady = Boolean(health?.ok && activeCompiler?.available);
  const compilerShortLabel = isLocalReady && activeCompiler?.version
    ? language === 'cpp'
      ? `g++ ${activeCompiler.version.match(/\d+\.\d+\.\d+/)?.[0] ?? ''}`.trim()
      : `Py ${activeCompiler.version.match(/\d+\.\d+\.\d+/)?.[0] ?? '3'}`.trim()
    : language === 'python'
      ? 'Pyodide 浏览器'
      : '云端 GCC';

  return (
    <header className="h-13 shrink-0 border-b border-slate-800/90 bg-[#0b101b] px-3.5 flex items-center justify-between gap-3 select-none">
      {/* Left: Brand & Template Picker */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <Blocks className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight text-slate-100">AlgoBlocks</span>
            </div>
            <p className="text-[10px] text-slate-400">图形化编程 IDE</p>
          </div>
        </div>

        <div className="h-5 w-px bg-slate-800 mx-0.5 shrink-0" />

        {/* Template Selector */}
        <div className="relative flex items-center">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 absolute left-2.5 pointer-events-none" />
          <select
            aria-label="选择算法示例模板"
            value={activeTemplateId}
            onChange={(e) => {
              const tpl = templates.find((t) => t.id === e.target.value);
              if (tpl) onSelectTemplate(tpl);
            }}
            className="appearance-none bg-slate-900/90 hover:bg-slate-800/90 border border-slate-700/80 rounded-lg pl-8 pr-7 py-1.5 text-xs font-medium text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id} className="bg-slate-900 text-slate-200">
                示例：{t.name}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 pointer-events-none" />
        </div>

        {/* Quick Search Trigger */}
        <button
          type="button"
          onClick={onOpenSearch}
          className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-700/70 text-xs text-slate-300 transition-colors cursor-pointer"
          title="快速搜索并插入积木 (Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <span>搜索积木</span>
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            Ctrl+K
          </kbd>
        </button>

        {/* Code -> Blocks Trigger */}
        <button
          type="button"
          onClick={onOpenCodeToBlocks}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-500/12 hover:bg-cyan-500/20 border border-cyan-500/35 text-xs font-medium text-cyan-200 transition-colors cursor-pointer"
          title="粘贴 C++ / Python 代码并自动转换为可视化积木"
        >
          <FileCode2 className="w-3.5 h-3.5 text-cyan-400" />
          <span>代码转积木</span>
        </button>
      </div>

      {/* Right: Language Switcher, Options, File Actions, Health & Run */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Target Language Toggle */}
        <div
          className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-[11px] font-mono"
          role="group"
          aria-label="目标编程语言"
        >
          {([
            { id: 'cpp', label: 'C++' },
            { id: 'python', label: 'Python' },
          ] as const).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeLanguage(item.id)}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                language === item.id
                  ? item.id === 'cpp'
                    ? 'bg-indigo-600/90 text-white font-semibold shadow-sm'
                    : 'bg-amber-500/90 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* C++-specific Options */}
        {language === 'cpp' && (
          <>
            <div className="hidden md:flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-[11px] font-mono">
              {(['c++20', 'c++17'] as const).map((std) => (
                <button
                  key={std}
                  type="button"
                  onClick={() => onChangeCppStd(std)}
                  className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                    cppStd === std
                      ? 'bg-slate-700 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {std.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onToggleBitsHeader}
              title="切换使用万能头 #include <bits/stdc++.h> 或按需引入最小头文件"
              className={`hidden xl:inline-flex px-2.5 py-1.5 rounded-lg text-[11px] font-mono border transition-colors cursor-pointer ${
                useBitsHeader
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                  : 'bg-slate-900 border-slate-700/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              bits/stdc++
            </button>
          </>
        )}

        <div className="h-5 w-px bg-slate-800 mx-0.5" />

        {/* File Import/Export */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/80 border border-transparent hover:border-slate-700/80 transition-colors cursor-pointer"
          title="导入工程 (.json)"
        >
          <Upload className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onExportJson}
          className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/80 border border-transparent hover:border-slate-700/80 transition-colors cursor-pointer"
          title="保存工程 (.json)"
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onExportSource}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
          title={`导出源码 (${language === 'cpp' ? '.cpp' : '.py'})`}
        >
          <FileCode2 className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden md:inline font-mono">
            {language === 'cpp' ? '.cpp' : '.py'}
          </span>
        </button>

        {/* Runtime Health Badge */}
        <div
          className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-mono border ${
            isLocalReady
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
          }`}
          title={
            isLocalReady
              ? `本地运行环境就绪: ${activeCompiler?.version}`
              : language === 'python'
                ? '静态网页模式：使用浏览器内 Pyodide WebAssembly 运行 Python 3'
                : '静态网页模式：使用 Wandbox 在线 GCC 服务编译运行 C++'
          }
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>{compilerShortLabel}</span>
        </div>

        {/* Run Button */}
        <button
          type="button"
          onClick={onRun}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-60 text-white text-xs font-semibold shadow-md shadow-indigo-600/25 transition-all cursor-pointer active:scale-[0.98]"
          title="运行所有样例 (Ctrl+Enter)"
        >
          {isRunning ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
          <span>{isRunning ? '运行中...' : language === 'cpp' ? '编译运行' : '运行代码'}</span>
          <kbd className="hidden xl:inline text-[10px] font-mono px-1 py-0.5 rounded bg-indigo-950/60 text-indigo-200 border border-indigo-400/30">
            Ctrl+↵
          </kbd>
        </button>
      </div>
    </header>
  );
};
