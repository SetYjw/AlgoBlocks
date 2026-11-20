import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, CornerDownLeft, Blocks } from 'lucide-react';
import { BLOCK_CATALOG } from '../blocks';

interface QuickSearchModalProps {
  open: boolean;
  onClose: () => void;
  onSelectBlock: (blockType: string) => void;
}

export const QuickSearchModal: React.FC<QuickSearchModalProps> = ({
  open,
  onClose,
  onSelectBlock,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BLOCK_CATALOG.slice(0, 18);
    return BLOCK_CATALOG.filter((item) => {
      const haystack = `${item.label} ${item.category} ${item.type} ${item.keywords.join(' ')}`.toLowerCase();
      return haystack.includes(q);
    }).slice(0, 20);
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (filtered.length ? (prev + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        filtered.length ? (prev - 1 + filtered.length) % filtered.length : 0
      );
    } else if (e.key === 'Enter' && filtered[activeIndex]) {
      e.preventDefault();
      onSelectBlock(filtered[activeIndex].type);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/60 backdrop-blur-xs px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-[#0f172a] border border-slate-700/80 shadow-2xl shadow-black/60 overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800">
          <Search className="w-4 h-4 text-indigo-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索积木，如 vector、sort、for、priority_queue、位运算..."
            className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              没有找到匹配的积木，试试输入中文关键词或 C++ 关键字
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isActive = idx === activeIndex;
              return (
                <button
                  key={item.type}
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    onSelectBlock(item.type);
                    onClose();
                  }}
                  className={`w-full px-4 py-2.5 flex items-center justify-between text-left transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600/25 text-white'
                      : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Blocks
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-indigo-400' : 'text-slate-500'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{item.label}</div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">
                        {item.type}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/70">
                      {item.category}
                    </span>
                    {isActive && <CornerDownLeft className="w-3.5 h-3.5 text-indigo-300" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-800 bg-slate-900/70 flex items-center justify-between text-[11px] text-slate-500">
          <span>↑↓ 选择 · Enter 直接添加到画布</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  );
};
