'use client';

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  KeyboardEvent,
  ChangeEvent,
  ClipboardEvent,
} from 'react';

/* ───────── Types ───────── */

type Level = 1 | 2 | 3 | 4 | 5;

interface Para {
  id: string;
  level: Level;
  text: string;
}

/* ───────── Helpers ───────── */

let _nextId = 1;
function genId() {
  return `p${_nextId++}`;
}

const CN = [
  '一','二','三','四','五','六','七','八','九','十',
  '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
  '二十一','二十二','二十三','二十四','二十五','二十六','二十七','二十八','二十九','三十',
];

function toLabel(level: Level, count: number): string {
  const cn = CN[count - 1] ?? String(count);
  switch (level) {
    case 1: return `${cn}、`;
    case 2: return `(${cn})`;
    case 3: return `${count}.`;
    case 4: return `(${count})`;
    case 5: return '';
  }
}

function computeLabel(paragraphs: Para[], index: number): string {
  const level = paragraphs[index].level;
  if (level === 5) return '';
  let count = 1;
  for (let i = index - 1; i >= 0; i--) {
    if (paragraphs[i].level === level) count++;
    else if (paragraphs[i].level < level) break;
  }
  return toLabel(level, count);
}

function indentSpaces(level: Level): string {
  switch (level) {
    case 1: return '';
    case 2: return '';
    case 3: return '';
    case 4: return ' ';
    case 5: return '  ';
  }
}

/* ───────── LocalStorage ───────── */

const STORAGE_KEY = 'text-formatter-doc';

function saveToStorage(paragraphs: Para[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(paragraphs));
  } catch { /* quota exceeded — ignore */ }
}

function loadFromStorage(): Para[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Array.isArray(data) && data.length > 0) return data;
  } catch { /* corrupt data — ignore */ }
  return null;
}

/* ───────── Component ───────── */

export default function Home() {
  const [paragraphs, setParagraphs] = useState<Para[]>([
    { id: genId(), level: 1, text: '' },
  ]);
  const [activeIdx, setActiveIdx] = useState(0);
  const refs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const initialized = useRef(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const saved = loadFromStorage();
    if (saved) {
      // Ensure IDs are unique
      saved.forEach((p) => { p.id = genId(); });
      setParagraphs(saved);
    }
  }, []);

  // Auto-save on change
  useEffect(() => {
    const timer = setTimeout(() => saveToStorage(paragraphs), 300);
    return () => clearTimeout(timer);
  }, [paragraphs]);

  /* -- Textarea helpers -- */

  const autoResize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, []);

  const focusPara = useCallback(
    (id: string, cursor?: number) => {
      requestAnimationFrame(() => {
        const el = refs.current.get(id);
        if (!el) return;
        el.focus();
        if (cursor !== undefined) {
          el.selectionStart = el.selectionEnd = cursor;
        }
        autoResize(el);
      });
    },
    [autoResize],
  );

  // Resize all textareas on mount and when paragraphs change
  useEffect(() => {
    refs.current.forEach((el) => autoResize(el));
  }, [paragraphs, autoResize]);

  /* -- Paragraph mutations -- */

  const updateText = useCallback((id: string, text: string) => {
    setParagraphs((prev) => prev.map((p) => (p.id === id ? { ...p, text } : p)));
  }, []);

  const setLevel = useCallback(
    (level: Level) => {
      setParagraphs((prev) =>
        prev.map((p, i) => (i === activeIdx ? { ...p, level } : p)),
      );
    },
    [activeIdx],
  );

  const insertParaAfter = useCallback(
    (index: number, level: Level, text: string): string => {
      const newId = genId();
      setParagraphs((prev) => {
        const copy = [...prev];
        copy.splice(index + 1, 0, { id: newId, level, text });
        return copy;
      });
      return newId;
    },
    [],
  );

  const removePara = useCallback((index: number) => {
    setParagraphs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /* -- Key handling -- */

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>, index: number) => {
      const ta = e.currentTarget;
      const para = paragraphs[index];

      // Enter → split paragraph
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        const pos = ta.selectionStart;
        const before = para.text.slice(0, pos);
        const after = para.text.slice(pos);

        setParagraphs((prev) => {
          const copy = [...prev];
          copy[index] = { ...copy[index], text: before };
          return copy;
        });
        const newId = insertParaAfter(index, para.level, after);
        setActiveIdx(index + 1);
        focusPara(newId, 0);
        return;
      }

      // Backspace at start → merge with previous
      if (
        e.key === 'Backspace' &&
        ta.selectionStart === 0 &&
        ta.selectionEnd === 0 &&
        index > 0
      ) {
        e.preventDefault();
        const prev = paragraphs[index - 1];
        const mergePos = prev.text.length;
        setParagraphs((ps) => {
          const copy = [...ps];
          copy[index - 1] = { ...copy[index - 1], text: prev.text + para.text };
          copy.splice(index, 1);
          return copy;
        });
        setActiveIdx(index - 1);
        focusPara(prev.id, mergePos);
        return;
      }

      // Tab / Shift+Tab → change level
      if (e.key === 'Tab') {
        e.preventDefault();
        const newLevel = (
          e.shiftKey
            ? Math.max(1, para.level - 1)
            : Math.min(5, para.level + 1)
        ) as Level;
        setParagraphs((ps) =>
          ps.map((p, i) => (i === index ? { ...p, level: newLevel } : p)),
        );
        return;
      }

      // ArrowUp at start → focus previous
      if (e.key === 'ArrowUp' && ta.selectionStart === 0 && index > 0) {
        e.preventDefault();
        setActiveIdx(index - 1);
        focusPara(paragraphs[index - 1].id, paragraphs[index - 1].text.length);
        return;
      }

      // ArrowDown at end → focus next
      if (
        e.key === 'ArrowDown' &&
        ta.selectionStart === para.text.length &&
        index < paragraphs.length - 1
      ) {
        e.preventDefault();
        setActiveIdx(index + 1);
        focusPara(paragraphs[index + 1].id, 0);
        return;
      }
    },
    [paragraphs, insertParaAfter, focusPara],
  );

  /* -- Paste handling -- */

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>, index: number) => {
      const text = e.clipboardData.getData('text/plain');
      if (!text.includes('\n')) return; // single-line paste → default behavior

      e.preventDefault();
      const ta = e.currentTarget;
      const para = paragraphs[index];
      const pos = ta.selectionStart;
      const selEnd = ta.selectionEnd;
      const before = para.text.slice(0, pos);
      const after = para.text.slice(selEnd);
      const lines = text.split(/\r?\n/);

      setParagraphs((prev) => {
        const copy = [...prev];
        // First line merges with text before cursor
        const firstText = before + (lines[0] ?? '');
        copy[index] = { ...copy[index], text: firstText };

        // Middle lines become new paragraphs
        const newParas: Para[] = [];
        for (let i = 1; i < lines.length; i++) {
          const lineText = i === lines.length - 1 ? lines[i] + after : lines[i];
          newParas.push({ id: genId(), level: para.level, text: lineText });
        }
        copy.splice(index + 1, 0, ...newParas);
        return copy;
      });

      // Focus last inserted paragraph
      const lastIdx = index + lines.length - 1;
      setTimeout(() => {
        setActiveIdx(lastIdx);
        const keys = Array.from(refs.current.keys());
        if (keys[lastIdx]) {
          focusPara(keys[lastIdx], (lines[lines.length - 1] ?? '').length + (lines.length === 1 ? 0 : 0));
        }
      }, 50);
    },
    [paragraphs, focusPara],
  );

  /* -- Export TXT -- */

  const exportTxt = useCallback(() => {
    const lines = paragraphs.map((p, i) => {
      const label = computeLabel(paragraphs, i);
      const indent = indentSpaces(p.level);
      return `${indent}${label}${p.text}`;
    });
    const content = lines.join('\n');
    const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '文件.txt';
    a.click();
    URL.revokeObjectURL(url);
  }, [paragraphs]);

  /* -- Export PDF (via print) -- */

  const exportPdf = useCallback(() => {
    window.print();
  }, []);

  /* -- New document -- */

  const newDoc = useCallback(() => {
    if (!confirm('確定要新建文件嗎？目前的內容將被清除。')) return;
    const id = genId();
    setParagraphs([{ id, level: 1, text: '' }]);
    setActiveIdx(0);
    focusPara(id, 0);
  }, [focusPara]);

  /* ───────── Render ───────── */

  const activePara = paragraphs[activeIdx];

  return (
    <div className="app">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-group">
          {([1, 2, 3, 4, 5] as Level[]).map((lv) => {
            const labels: Record<Level, string> = {
              1: '一、',
              2: '(一)',
              3: '1.',
              4: '(1)',
              5: '無',
            };
            return (
              <button
                key={lv}
                className={activePara?.level === lv ? 'active' : ''}
                onClick={() => setLevel(lv)}
                title={`樣式 ${lv} (Tab/Shift+Tab 切換)`}
              >
                {labels[lv]}
              </button>
            );
          })}
        </div>
        <div className="toolbar-divider" />
        <div className="toolbar-group">
          <button className="export-btn" onClick={exportTxt}>
            存 TXT
          </button>
          <button className="export-btn" onClick={exportPdf}>
            存 PDF
          </button>
        </div>
        <div className="toolbar-divider" />
        <button onClick={newDoc}>新建</button>
      </div>

      {/* Editor */}
      <div className="editor">
        {paragraphs.map((p, i) => (
          <div
            key={p.id}
            className={`para level-${p.level}${i === activeIdx ? ' active' : ''}`}
          >
            {p.level !== 5 && (
              <span className="label">{computeLabel(paragraphs, i)}</span>
            )}
            <textarea
              ref={(el) => {
                if (el) {
                  refs.current.set(p.id, el);
                  autoResize(el);
                } else {
                  refs.current.delete(p.id);
                }
              }}
              value={p.text}
              rows={1}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                updateText(p.id, e.target.value);
                autoResize(e.target);
              }}
              onKeyDown={(e) => handleKeyDown(e, i)}
              onPaste={(e) => handlePaste(e, i)}
              onFocus={() => setActiveIdx(i)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>
        ))}
      </div>

      {/* Print view (hidden on screen, visible on print) */}
      <div className="print-view">
        {paragraphs.map((p, i) => (
          <div key={p.id} className={`print-para level-${p.level}`}>
            {p.level !== 5 && (
              <span className="print-label">{computeLabel(paragraphs, i)}</span>
            )}
            <span className="print-text">{p.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
