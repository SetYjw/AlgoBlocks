import React, { useState } from 'react';
import { Code2, Sparkles, X, AlertTriangle, ArrowRight } from 'lucide-react';
import { parseCodeToBlocks, type ParseToBlocksResult } from '../parsers';
import type { TargetLanguage } from '../api/runnerApi';

interface CodeToBlocksModalProps {
  open: boolean;
  defaultLanguage: TargetLanguage;
  currentCode: string;
  onClose: () => void;
  onApplyBlocks: (result: ParseToBlocksResult, language: TargetLanguage) => void;
}

const SAMPLE_SNIPPETS: Record<TargetLanguage, string> = {
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin >> n;
    long long sum = 0;
    for (int i = 1; i <= n; ++i) {
        sum += i;
    }
    cout << sum << '\\n';
    return 0;
}`,
  python: `import sys

_tokens = iter(sys.stdin.read().split())
_next = lambda: next(_tokens)

def main():
    n = int(_next())
    total = 0
    for i in range(1, n + 1):
        total += i
    print(total)

if __name__ == "__main__":
    main()`,
};

export const CodeToBlocksModal: React.FC<CodeToBlocksModalProps> = ({
  open,
  defaultLanguage,
  currentCode,
  onClose,
  onApplyBlocks,
}) => {
  const [lang, setLang] = useState<TargetLanguage>(defaultLanguage);
  const [source, setSource] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParseToBlocksResult | null>(null);

  React.useEffect(() => {
    if (open) {
      setLang(defaultLanguage);
      setSource(currentCode || SAMPLE_SNIPPETS[defaultLanguage]);
      setError(null);
      setPreview(null);
    }
  }, [open, defaultLanguage]);

  if (!open) return null;

  const handleConvert = () => {
    if (!source.trim()) {
      setError('请先粘贴或输入一段 C++ 或 Python 代码');
      return;
    }
    try {
      const result = parseCodeToBlocks(source, lang);
      setPreview(result);
      setError(null);
      onApplyBlocks(result, lang);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '代码解析失败，请检查语法');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-xl bg-[#0f172a] border border-slate-700/80 shadow-2xl shadow-black/70 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-100">代码转积木</h2>
            <span className="text-[11px] text-slate-400">
              将 C++ / Python 代码自动解析为可拖拽积木（冷门语法自动使用自定义代码块兜底）
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-4 py-2 border-b border-slate-800/80 bg-[#0b101b] flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-[11px] font-mono">
            {([
              { id: 'cpp', label: 'C++' },
              { id: 'python', label: 'Python 3' },
            ] as const).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setLang(item.id)}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  lang === item.id
                    ? 'bg-indigo-600/90 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setSource(SAMPLE_SNIPPETS[lang])}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] text-amber-300 hover:bg-amber-500/15 border border-amber-500/30 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3 h-3" />
            <span>填入示例代码</span>
          </button>
        </div>

        {/* Code Textarea */}
        <div className="p-4 flex-1 min-h-0 flex flex-col gap-2">
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            rows={14}
            spellCheck={false}
            placeholder={
              lang === 'cpp'
                ? '在此粘贴 C++ 代码...'
                : '在此粘贴 Python 3 代码...'
            }
            className="w-full flex-1 min-h-[260px] rounded-lg bg-[#090d16] border border-slate-800 focus:border-indigo-500/70 p-3 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none resize-none leading-relaxed"
          />

          {error && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {preview && preview.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              {preview.warnings[0]}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-800 bg-[#0b101b] flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            转换后会替换当前画布中的积木
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-slate-800 border border-slate-700/70 transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConvert}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
            >
              <span>转换为积木</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
