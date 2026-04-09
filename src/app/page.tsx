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

interface User {
  id: number;
  email: string;
}

interface DocMeta {
  id: number;
  title: string;
  updated_at: string;
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
  } catch { /* ignore */ }
}

function loadFromStorage(): Para[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Array.isArray(data) && data.length > 0) return data;
  } catch { /* ignore */ }
  return null;
}

/* ───────── Component ───────── */

export default function Home() {
  /* -- Core editor state -- */
  const [paragraphs, setParagraphs] = useState<Para[]>([
    { id: genId(), level: 1, text: '' },
  ]);
  const [activeIdx, setActiveIdx] = useState(0);
  const refs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const initialized = useRef(false);

  /* -- Dark mode -- */
  const [darkMode, setDarkMode] = useState(false);

  /* -- Auth & cloud state -- */
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authError, setAuthError] = useState('');
  const [showDocs, setShowDocs] = useState(false);
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [cloudDocId, setCloudDocId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [docTitle, setDocTitle] = useState('未命名文件');

  /* -- Init: load local + check session + dark mode -- */
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Sync dark mode state with what anti-FOUC script already set
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    setDarkMode(isDark);

    const saved = loadFromStorage();
    if (saved) {
      saved.forEach((p) => { p.id = genId(); });
      setParagraphs(saved);
    }
    // Check session
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => { if (d.user) setUser(d.user); })
      .catch(() => {})
      .finally(() => setAuthLoading(false));
  }, []);

  const toggleDark = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev;
      document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
      try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Auto-save to localStorage
  useEffect(() => {
    const timer = setTimeout(() => saveToStorage(paragraphs), 300);
    return () => clearTimeout(timer);
  }, [paragraphs]);

  /* ─── Auth handlers ─── */

  const handleAuth = useCallback(async () => {
    setAuthError('');
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPass }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || '操作失敗');
        return;
      }
      setUser(data.user);
      setShowAuth(false);
      setAuthEmail('');
      setAuthPass('');
    } catch {
      setAuthError('網路錯誤');
    }
  }, [authMode, authEmail, authPass]);

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setCloudDocId(null);
    setDocs([]);
  }, []);

  /* ─── Cloud document handlers ─── */

  const loadDocList = useCallback(async () => {
    const res = await fetch('/api/documents');
    if (res.ok) {
      const data = await res.json();
      setDocs(data.documents);
    }
  }, []);

  const saveToCloud = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    try {
      const content = paragraphs.map(({ level, text }) => ({ level, text }));
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cloudDocId, title: docTitle, content }),
      });
      const data = await res.json();
      if (res.ok) {
        if (!cloudDocId) setCloudDocId(data.id);
        alert('已儲存到雲端');
      }
    } catch {
      alert('儲存失敗');
    } finally {
      setSaving(false);
    }
  }, [user, paragraphs, cloudDocId, docTitle]);

  const loadFromCloud = useCallback(async (docId: number) => {
    const res = await fetch(`/api/documents/${docId}`);
    if (!res.ok) return;
    const data = await res.json();
    const doc = data.document;
    const paras: Para[] = doc.content.map((p: { level: Level; text: string }) => ({
      id: genId(),
      level: p.level,
      text: p.text,
    }));
    setParagraphs(paras);
    setCloudDocId(doc.id);
    setDocTitle(doc.title);
    setShowDocs(false);
    setActiveIdx(0);
  }, []);

  const deleteFromCloud = useCallback(async (docId: number) => {
    if (!confirm('確定要刪除這份雲端文件嗎？')) return;
    await fetch(`/api/documents?id=${docId}`, { method: 'DELETE' });
    if (cloudDocId === docId) setCloudDocId(null);
    loadDocList();
  }, [cloudDocId, loadDocList]);

  /* ─── Textarea helpers ─── */

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

  useEffect(() => {
    refs.current.forEach((el) => autoResize(el));
  }, [paragraphs, autoResize]);

  /* ─── Paragraph mutations ─── */

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

  /* ─── Key handling ─── */

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>, index: number) => {
      const ta = e.currentTarget;
      const para = paragraphs[index];

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

      if (e.key === 'ArrowUp' && ta.selectionStart === 0 && index > 0) {
        e.preventDefault();
        setActiveIdx(index - 1);
        focusPara(paragraphs[index - 1].id, paragraphs[index - 1].text.length);
        return;
      }

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

  /* ─── Paste handling ─── */

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>, index: number) => {
      const text = e.clipboardData.getData('text/plain');
      if (!text.includes('\n')) return;

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
        const firstText = before + (lines[0] ?? '');
        copy[index] = { ...copy[index], text: firstText };
        const newParas: Para[] = [];
        for (let i = 1; i < lines.length; i++) {
          const lineText = i === lines.length - 1 ? lines[i] + after : lines[i];
          newParas.push({ id: genId(), level: para.level, text: lineText });
        }
        copy.splice(index + 1, 0, ...newParas);
        return copy;
      });

      const lastIdx = index + lines.length - 1;
      setTimeout(() => {
        setActiveIdx(lastIdx);
        const keys = Array.from(refs.current.keys());
        if (keys[lastIdx]) {
          focusPara(keys[lastIdx], (lines[lines.length - 1] ?? '').length);
        }
      }, 50);
    },
    [paragraphs, focusPara],
  );

  /* ─── Export ─── */

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
    a.download = `${docTitle}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [paragraphs, docTitle]);

  const exportPdf = useCallback(() => {
    window.print();
  }, []);

  const newDoc = useCallback(() => {
    if (!confirm('確定要新建文件嗎？目前的內容將被清除。')) return;
    const id = genId();
    setParagraphs([{ id, level: 1, text: '' }]);
    setActiveIdx(0);
    setCloudDocId(null);
    setDocTitle('未命名文件');
    focusPara(id, 0);
  }, [focusPara]);

  /* ───────── Render ───────── */

  const activePara = paragraphs[activeIdx];

  return (
    <div className="app">
      {/* Toolbar */}
      <div className="toolbar">
        {/* Level format buttons */}
        <div className="toolbar-group">
          {([1, 2, 3, 4, 5] as Level[]).map((lv) => {
            const labels: Record<Level, string> = {
              1: '一、',
              2: '(一)',
              3: '1.',
              4: '(1)',
              5: '內文',
            };
            const titles: Record<Level, string> = {
              1: '第一層（一、）',
              2: '第二層（(一)）',
              3: '第三層（1.）',
              4: '第四層（(1)）',
              5: '無標號內文',
            };
            return (
              <button
                key={lv}
                className={activePara?.level === lv ? 'active' : ''}
                onClick={() => setLevel(lv)}
                title={titles[lv]}
              >
                {labels[lv]}
              </button>
            );
          })}
        </div>

        <div className="toolbar-divider" />

        {/* File actions */}
        <div className="toolbar-group">
          <button onClick={newDoc} title="新建文件">新建</button>
          <button className="export-btn" onClick={exportTxt} title="匯出為 TXT 檔">存 TXT</button>
          <button className="export-btn" onClick={exportPdf} title="列印 / 存為 PDF">存 PDF</button>
        </div>

        {/* Dark mode toggle */}
        <div className="toolbar-divider" />
        <button
          className="dark-toggle"
          onClick={toggleDark}
          title={darkMode ? '切換淺色模式' : '切換深色模式'}
        >
          {darkMode ? '☀' : '⏾'}
        </button>

        {/* Cloud buttons */}
        {!authLoading && (
          <>
            <div className="toolbar-divider" />
            {user ? (
              <div className="toolbar-group">
                <button className="cloud-btn" onClick={saveToCloud} disabled={saving} title="儲存至雲端">
                  {saving ? '儲存中…' : '存雲端'}
                </button>
                <button className="cloud-btn" onClick={() => { setShowDocs(true); loadDocList(); }} title="開啟雲端文件">
                  開啟
                </button>
                <span className="user-badge" title={user.email}>
                  {user.email.split('@')[0]}
                </span>
                <button onClick={handleLogout} title="登出帳號">登出</button>
              </div>
            ) : (
              <button onClick={() => setShowAuth(true)}>登入</button>
            )}
          </>
        )}
      </div>

      {/* Document title (when logged in) */}
      {user && (
        <div className="doc-title-bar">
          <input
            className="doc-title-input"
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            placeholder="文件標題"
          />
          {cloudDocId && <span className="cloud-badge">雲端文件 #{cloudDocId}</span>}
        </div>
      )}

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

      {/* Print view */}
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

      {/* ── Auth Modal ── */}
      {showAuth && (
        <div className="modal-overlay" onClick={() => setShowAuth(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{authMode === 'login' ? '登入帳號' : '建立帳號'}</h2>
              <button className="modal-close" onClick={() => setShowAuth(false)} aria-label="關閉">×</button>
            </div>
            {authError && <p className="auth-error">{authError}</p>}
            <input
              type="email"
              placeholder="電子郵件"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
              autoComplete="email"
            />
            <input
              type="password"
              placeholder="密碼（至少 6 字元）"
              value={authPass}
              onChange={(e) => setAuthPass(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
              autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
            />
            <button className="modal-primary" onClick={handleAuth}>
              {authMode === 'login' ? '登入' : '建立帳號'}
            </button>
            <p className="auth-switch">
              {authMode === 'login' ? (
                <>還沒有帳號？<button onClick={() => { setAuthMode('register'); setAuthError(''); }}>前往註冊</button></>
              ) : (
                <>已有帳號？<button onClick={() => { setAuthMode('login'); setAuthError(''); }}>前往登入</button></>
              )}
            </p>
          </div>
        </div>
      )}

      {/* ── Documents Modal ── */}
      {showDocs && (
        <div className="modal-overlay" onClick={() => setShowDocs(false)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>我的雲端文件</h2>
              <button className="modal-close" onClick={() => setShowDocs(false)} aria-label="關閉">×</button>
            </div>
            {docs.length === 0 ? (
              <p className="docs-empty">尚無雲端文件</p>
            ) : (
              <ul className="docs-list">
                {docs.map((d) => (
                  <li key={d.id}>
                    <button className="doc-item" onClick={() => loadFromCloud(d.id)}>
                      <span className="doc-item-title">{d.title}</span>
                      <span className="doc-item-date">
                        {new Date(d.updated_at).toLocaleDateString('zh-TW')}
                      </span>
                    </button>
                    <button
                      className="doc-delete"
                      onClick={() => deleteFromCloud(d.id)}
                      title="刪除此文件"
                    >
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
