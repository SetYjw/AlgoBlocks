import React, { useEffect, useRef, useState } from 'react';
import { Compartment, EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, lineNumbers } from '@codemirror/view';
import { cpp } from '@codemirror/lang-cpp';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { Copy, Check, Code2, AlertTriangle, Link2 } from 'lucide-react';
import type { Diagnostic } from '../generators';
import type { TargetLanguage } from '../api/runnerApi';

interface CodePanelProps {
  language: TargetLanguage;
  code: string;
  highlightRange: [number, number] | null;
  diagnostics: Diagnostic[];
}

const setHighlightRangeEffect = StateEffect.define<[number, number] | null>();
const languageCompartment = new Compartment();
const highlightLineDeco = Decoration.line({ class: 'cm-block-highlight-line' });

const highlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decos, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setHighlightRangeEffect)) {
        const range = effect.value;
        if (!range) return Decoration.none;
        const [startLine, endLine] = range;
        const maxLines = tr.state.doc.lines;
        const clampedStart = Math.max(1, Math.min(startLine, maxLines));
        const clampedEnd = Math.max(clampedStart, Math.min(endLine, maxLines));
        const builder: ReturnType<typeof highlightLineDeco.range>[] = [];
        for (let lineNo = clampedStart; lineNo <= clampedEnd; lineNo++) {
          const line = tr.state.doc.line(lineNo);
          builder.push(highlightLineDeco.range(line.from));
        }
        return Decoration.set(builder);
      }
    }
    return decos.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const CodePanel: React.FC<CodePanelProps> = ({
  language,
  code,
  highlightRange,
  diagnostics,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        languageCompartment.of(language === 'python' ? python() : cpp()),
        oneDark,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        highlightField,
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Dynamically switch CodeMirror language grammar when C++ <-> Python changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: languageCompartment.reconfigure(language === 'python' ? python() : cpp()),
    });
  }, [language]);

  // Sync code updates cleanly
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== code) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: code },
      });
    }
  }, [code]);

  // Sync block-to-code line highlight & scroll into view
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const effects: StateEffect<unknown>[] = [setHighlightRangeEffect.of(highlightRange)];
    if (highlightRange) {
      const targetLine = Math.max(1, Math.min(highlightRange[0], view.state.doc.lines));
      const pos = view.state.doc.line(targetLine).from;
      effects.push(EditorView.scrollIntoView(pos, { y: 'center' }));
    }
    view.dispatch({ effects });
  }, [highlightRange, code]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore clipboard failure
    }
  };

  const lineCount = code ? code.split('\n').length : 0;
  const filename = language === 'python' ? 'main.py' : 'main.cpp';

  return (
    <section className="flex flex-col h-full bg-[#0b101b] overflow-hidden">
      {/* Code Header */}
      <div className="h-9 shrink-0 px-3 border-b border-slate-800/90 bg-[#0d1320] flex items-center justify-between gap-2 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <Code2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="text-xs font-mono font-medium text-slate-200">{filename}</span>
          <span className="text-[11px] text-slate-500 font-mono">{lineCount} 行</span>
          {highlightRange && (
            <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/30 text-[10px] text-indigo-300 font-mono">
              <Link2 className="w-3 h-3" />
              L{highlightRange[0]}
              {highlightRange[1] > highlightRange[0] ? `-L${highlightRange[1]}` : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {diagnostics.length > 0 && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] text-amber-300"
              title={diagnostics.map((d) => d.message).join('\n')}
            >
              <AlertTriangle className="w-3 h-3" />
              {diagnostics.length} 提示
            </span>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-slate-300 hover:text-white bg-slate-800/70 hover:bg-slate-700/80 border border-slate-700/70 transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-300">已复制</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>复制代码</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Diagnostics Banner */}
      {diagnostics.length > 0 && (
        <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-[11px] text-amber-200 flex flex-col gap-0.5">
          {diagnostics.slice(0, 2).map((d, i) => (
            <div key={i} className="truncate">
              • {d.message}
            </div>
          ))}
        </div>
      )}

      {/* CodeMirror Mount */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden" />
    </section>
  );
};
