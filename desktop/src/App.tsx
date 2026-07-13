import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertCircle, Database, FileText, RefreshCw, Save, Search } from 'lucide-react';
import Vditor from 'vditor';
import 'vditor/dist/index.css';

type EditorDocument = {
  id: string;
  part_id: string;
  entity_type: 'blog' | 'project' | 'idea' | 'resume' | 'episode' | 'update';
  entity_id: string;
  slug: string;
  role: string;
  language: string;
  title: string;
  status: string;
  visibility: string;
  updated_at: string;
  content: string;
};

const destroyVditor = (editor: Vditor | null) => {
  if (!editor) return;

  const internal = (editor as unknown as { vditor?: { element?: HTMLElement } }).vditor;
  if (!internal?.element) return;

  editor.destroy();
};

const docPath = (doc: EditorDocument) =>
  `${doc.entity_type}/${doc.slug || doc.entity_id}/${doc.role}/${doc.language}`;

const badgeClass = (kind: EditorDocument['entity_type']) => `badge badge-${kind}`;

export default function App() {
  const [documents, setDocuments] = React.useState<EditorDocument[]>([]);
  const [selectedId, setSelectedId] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [dirtyIds, setDirtyIds] = React.useState<Set<string>>(() => new Set());
  const [mode, setMode] = React.useState<'edit' | 'preview'>('edit');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const editorRef = React.useRef<Vditor | null>(null);

  const selected = documents.find((doc) => doc.id === selectedId) || documents[0] || null;
  const dirty = selected ? dirtyIds.has(selected.id) : false;
  const filtered = documents.filter((doc) => {
    const text = `${doc.title} ${doc.entity_type} ${doc.slug} ${doc.role} ${doc.language}`.toLowerCase();
    return text.includes(query.toLowerCase());
  });

  const loadDocuments = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await invoke<EditorDocument[]>('list_documents');
      setDocuments(next);
      setSelectedId((current) => (
        current && next.some((doc) => doc.id === current) ? current : next[0]?.id || ''
      ));
      setDirtyIds(new Set());
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  React.useEffect(() => {
    if (!hostRef.current || mode !== 'edit' || !selected) return;

    destroyVditor(editorRef.current);
    editorRef.current = null;
    hostRef.current.innerHTML = '';

    const editor = new Vditor(hostRef.current, {
      value: selected.content,
      mode: 'wysiwyg',
      height: '100%',
      minHeight: 520,
      cache: { enable: false },
      lang: 'en_US',
      toolbar: [
        'headings',
        'bold',
        'italic',
        'strike',
        '|',
        'list',
        'ordered-list',
        'check',
        'outdent',
        'indent',
        '|',
        'quote',
        'line',
        'code',
        'inline-code',
        'link',
        'table',
        '|',
        'undo',
        'redo',
      ],
      input(value) {
        setDocuments((current) => current.map((doc) => (
          doc.id === selected.id ? { ...doc, content: value } : doc
        )));
        setDirtyIds((current) => {
          const next = new Set(current);
          next.add(selected.id);
          return next;
        });
      },
    });

    editorRef.current = editor;
    return () => {
      if (editorRef.current === editor) editorRef.current = null;
      destroyVditor(editor);
    };
  }, [mode, selected?.id]);

  const saveSelected = async () => {
    if (!selected) return;

    setSaving(true);
    setError(null);
    try {
      const saved = await invoke<EditorDocument>('save_document', {
        id: selected.id,
        content: selected.content,
      });
      setDocuments((current) => current.map((doc) => (doc.id === saved.id ? saved : doc)));
      setDirtyIds((current) => {
        const next = new Set(current);
        next.delete(saved.id);
        return next;
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Database size={18} />
          <div>
            <div className="brand-title">Silan Desktop</div>
            <div className="brand-subtitle">SQLite content editor</div>
          </div>
        </div>

        <label className="search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search content"
          />
        </label>

        <div className="list-head">
          <span>{filtered.length} documents</span>
          <button type="button" onClick={() => void loadDocuments()} title="Refresh">
            <RefreshCw size={15} />
          </button>
        </div>

        <div className="doc-list">
          {loading ? (
            <div className="empty">Loading documents...</div>
          ) : filtered.map((doc) => (
            <button
              type="button"
              key={doc.id}
              className={`doc-row ${doc.id === selected?.id ? 'active' : ''}`}
              onClick={() => setSelectedId(doc.id)}
            >
              <FileText size={16} />
              <span className="doc-main">
                <span className="doc-title">{doc.title}</span>
                <span className="doc-path">{docPath(doc)}</span>
              </span>
              {dirtyIds.has(doc.id) && <span className="dirty-dot" />}
            </button>
          ))}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="title-block">
            <h1>{selected?.title || 'No document selected'}</h1>
            {selected && (
              <div className="meta">
                <span className={badgeClass(selected.entity_type)}>{selected.entity_type}</span>
                <span>{docPath(selected)}</span>
                {selected.status && <span>{selected.status}</span>}
                {selected.visibility && <span>{selected.visibility}</span>}
              </div>
            )}
          </div>
          <div className="actions">
            <button type="button" disabled={!selected} onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}>
              {mode === 'edit' ? 'Preview' : 'Edit'}
            </button>
            <button className="primary" type="button" disabled={!selected || !dirty || saving} onClick={() => void saveSelected()}>
              <Save size={16} />
              {saving ? 'Saving' : 'Save'}
            </button>
          </div>
        </header>

        {error && (
          <div className="error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <section className="editor-area">
          {!selected && !loading ? (
            <div className="empty large">No editable documents found in the selected database.</div>
          ) : mode === 'edit' ? (
            <div className="editor-frame">
              <div ref={hostRef} className="editor-host" />
            </div>
          ) : selected ? (
            <article className="preview">
              <pre>{selected.content}</pre>
            </article>
          ) : null}
        </section>
      </main>

      <aside className="inspector">
        <div className="panel-title">Inspector</div>
        {selected ? (
          <div className="fields">
            <div>
              <label>Entity</label>
              <code>{selected.entity_type}/{selected.slug || selected.entity_id}</code>
            </div>
            <div>
              <label>Part</label>
              <code>{selected.role}/{selected.language}</code>
            </div>
            <div>
              <label>Translation ID</label>
              <code>{selected.id}</code>
            </div>
            <div>
              <label>State</label>
              <strong className={dirty ? 'warn' : 'ok'}>{dirty ? 'Unsaved' : 'Saved'}</strong>
            </div>
            <div>
              <label>Updated</label>
              <span>{selected.updated_at || 'unknown'}</span>
            </div>
          </div>
        ) : (
          <div className="empty">Select a document.</div>
        )}
      </aside>
    </div>
  );
}
