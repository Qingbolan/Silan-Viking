import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  Briefcase,
  Clock3,
  FileText,
  Folder,
  Lightbulb,
  PencilLine,
  Radio,
  RefreshCw,
  Save,
  Search,
  UserRound,
} from 'lucide-react';
import Vditor from 'vditor';
import 'vditor/dist/index.css';

type ContentKind = 'blog' | 'project' | 'idea' | 'resume' | 'episode' | 'update';

type EditorDocument = {
  id: string;
  part_id: string;
  entity_type: ContentKind;
  entity_id: string;
  series_id?: string | null;
  series_slug?: string | null;
  series_title?: string | null;
  episode_number?: number | null;
  slug: string;
  role: string;
  canonical_language: string;
  title: string;
  status: string;
  visibility: string;
  updated_at: string;
  translations: EditorTranslation[];
};

type EditorTranslation = {
  id: string;
  language: string;
  content: string;
  revision: string;
  source_path: string;
};

type DashboardData = {
  total_views: number;
  total_likes: number;
  total_comments: number;
  pending_comments: number;
  human_interactions: number;
  crawler_interactions: number;
  recent_items: DashboardItem[];
};

type DashboardItem = {
  entity_type: string;
  title: string;
  slug: string;
  status: string;
  visibility: string;
  updated_at: string;
};

type EntityFilter = 'all' | ContentKind;

type ContentGroup = {
  id: string;
  kind: ContentKind;
  title: string;
  slug: string;
  status: string;
  visibility: string;
  documents: EditorDocument[];
};

type EpisodeGroup = ContentGroup & {
  episodeNumber?: number | null;
};

type EpisodeSeries = {
  id: string;
  title: string;
  slug: string;
  episodes: EpisodeGroup[];
};

const entityMeta: Record<EntityFilter, { label: string; Icon: typeof Folder }> = {
  all: { label: 'Library', Icon: Folder },
  blog: { label: 'Blog', Icon: BookOpen },
  project: { label: 'Projects', Icon: Briefcase },
  idea: { label: 'Ideas', Icon: Lightbulb },
  resume: { label: 'Resume', Icon: UserRound },
  episode: { label: 'Episodes', Icon: Radio },
  update: { label: 'Updates', Icon: Clock3 },
};

const entityFilters = Object.keys(entityMeta) as EntityFilter[];

const destroyVditor = (editor: Vditor | null) => {
  if (!editor) return;
  const internal = (editor as unknown as { vditor?: { element?: HTMLElement } }).vditor;
  if (internal?.element) editor.destroy();
};

const docPath = (doc: EditorDocument) => {
  if (doc.entity_type === 'episode' && doc.series_slug) {
    return `episode/${doc.series_slug}/${doc.slug}/${doc.role}`;
  }
  return `${doc.entity_type}/${doc.slug}/${doc.role}`;
};

const badgeClass = (kind: ContentKind) => `badge badge-${kind}`;

function MarkdownPreview({ content }: { content: string }) {
  const previewRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    element.innerHTML = '';
    void Vditor.preview(element, content, {
      mode: 'light',
      hljs: { lineNumber: true },
      markdown: { toc: true },
    });
    return () => {
      element.innerHTML = '';
    };
  }, [content]);

  return <div ref={previewRef} className="markdown-preview" />;
}

export default function App() {
  const [documents, setDocuments] = React.useState<EditorDocument[]>([]);
  const [dashboard, setDashboard] = React.useState<DashboardData | null>(null);
  const [screen, setScreen] = React.useState<'dashboard' | 'content'>('dashboard');
  const [selectedId, setSelectedId] = React.useState('');
  const [languageByDocument, setLanguageByDocument] = React.useState<Record<string, string>>({});
  const [query, setQuery] = React.useState('');
  const [entityFilter, setEntityFilter] = React.useState<EntityFilter>('all');
  const [dirtyIds, setDirtyIds] = React.useState<Set<string>>(() => new Set());
  const [mode, setMode] = React.useState<'edit' | 'preview'>('edit');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const editorRef = React.useRef<Vditor | null>(null);

  const entityCounts = React.useMemo(() => {
    const itemIds = new Map<ContentKind, Set<string>>();
    const episodeSeriesIds = new Set<string>();
    documents.forEach((document) => {
      if (!itemIds.has(document.entity_type)) itemIds.set(document.entity_type, new Set());
      itemIds.get(document.entity_type)?.add(document.entity_id);
      if (document.entity_type === 'episode') {
        episodeSeriesIds.add(document.series_id || document.series_slug || document.entity_id);
      }
    });
    const counts = new Map<EntityFilter, number>();
    itemIds.forEach((ids, kind) => counts.set(kind, ids.size));
    counts.set('episode', episodeSeriesIds.size);
    counts.set('all', Array.from(itemIds.values()).reduce((total, ids) => total + ids.size, 0));
    return counts;
  }, [documents]);

  const filtered = React.useMemo(() => documents.filter((document) => {
    const text = [
      document.title,
      document.entity_type,
      document.slug,
      document.role,
      document.series_title,
      document.series_slug,
      ...document.translations.map((translation) => translation.language),
    ].filter(Boolean).join(' ').toLowerCase();
    return (entityFilter === 'all' || document.entity_type === entityFilter)
      && text.includes(query.trim().toLowerCase());
  }), [documents, entityFilter, query]);

  const contentGroups = React.useMemo(() => {
    const groups = new Map<string, ContentGroup>();
    filtered.filter((document) => document.entity_type !== 'episode').forEach((document) => {
      const id = `${document.entity_type}:${document.entity_id}`;
      if (!groups.has(id)) {
        groups.set(id, {
          id,
          kind: document.entity_type,
          title: document.title,
          slug: document.slug,
          status: document.status,
          visibility: document.visibility,
          documents: [],
        });
      }
      groups.get(id)?.documents.push(document);
    });
    return Array.from(groups.values());
  }, [filtered]);

  const episodeSeries = React.useMemo(() => {
    const seriesMap = new Map<string, { id: string; title: string; slug: string; episodes: Map<string, EpisodeGroup> }>();
    filtered.filter((document) => document.entity_type === 'episode').forEach((document) => {
      const seriesId = document.series_id || document.series_slug || 'unfiled';
      if (!seriesMap.has(seriesId)) {
        seriesMap.set(seriesId, {
          id: seriesId,
          title: document.series_title || document.series_slug || 'Unfiled series',
          slug: document.series_slug || seriesId,
          episodes: new Map(),
        });
      }
      const series = seriesMap.get(seriesId);
      if (!series?.episodes.has(document.entity_id)) {
        series?.episodes.set(document.entity_id, {
          id: document.entity_id,
          kind: 'episode',
          title: document.title,
          slug: document.slug,
          status: document.status,
          visibility: document.visibility,
          episodeNumber: document.episode_number,
          documents: [],
        });
      }
      series?.episodes.get(document.entity_id)?.documents.push(document);
    });
    return Array.from(seriesMap.values()).map((series): EpisodeSeries => ({
      id: series.id,
      title: series.title,
      slug: series.slug,
      episodes: Array.from(series.episodes.values()).sort(
        (left, right) => (left.episodeNumber || 0) - (right.episodeNumber || 0),
      ),
    }));
  }, [filtered]);

  const selected = documents.find((document) => document.id === selectedId)
    || filtered[0]
    || null;
  const selectedLanguage = selected
    ? languageByDocument[selected.id]
      || selected.canonical_language
      || selected.translations[0]?.language
      || ''
    : '';
  const selectedTranslation = selected?.translations.find(
    (translation) => translation.language === selectedLanguage,
  ) || selected?.translations[0] || null;
  const dirty = selectedTranslation ? dirtyIds.has(selectedTranslation.id) : false;
  const currentShelf = entityMeta[entityFilter];
  const visibleItemCount = React.useMemo(
    () => new Set(filtered.map((document) => `${document.entity_type}:${document.entity_id}`)).size,
    [filtered],
  );
  const contentSummary = entityFilter === 'episode'
    ? `${episodeSeries.length} series · ${visibleItemCount} episodes · ${filtered.length} Markdown parts`
    : `${visibleItemCount} items · ${filtered.length} Markdown parts`;

  React.useEffect(() => {
    if (loading || filtered.length === 0) return;
    if (!selectedId || !filtered.some((document) => document.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, loading, selectedId]);

  const loadDocuments = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextDocuments, nextDashboard] = await Promise.all([
        invoke<EditorDocument[]>('list_documents'),
        invoke<DashboardData>('get_dashboard'),
      ]);
      setDocuments(nextDocuments);
      setDashboard(nextDashboard);
      setSelectedId((current) => (
        current && nextDocuments.some((document) => document.id === current)
          ? current
          : nextDocuments[0]?.id || ''
      ));
      setLanguageByDocument((current) => {
        const next: Record<string, string> = {};
        nextDocuments.forEach((document) => {
          next[document.id] = current[document.id]
            || document.canonical_language
            || document.translations[0]?.language
            || '';
        });
        return next;
      });
      setDirtyIds(new Set());
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  React.useEffect(() => {
    if (screen !== 'content' || mode !== 'edit' || !hostRef.current || !selected || !selectedTranslation) return;

    destroyVditor(editorRef.current);
    editorRef.current = null;
    hostRef.current.innerHTML = '';

    const editor = new Vditor(hostRef.current, {
      value: selectedTranslation.content,
      mode: 'wysiwyg',
      height: '100%',
      minHeight: 480,
      cache: { enable: false },
      lang: 'en_US',
      toolbar: [
        'headings', 'bold', 'italic', 'strike', '|',
        'list', 'ordered-list', 'check', 'outdent', 'indent', '|',
        'quote', 'line', 'code', 'inline-code', 'link', 'table', '|',
        'undo', 'redo',
      ],
      input(value) {
        setDocuments((current) => current.map((document) => (
          document.id === selected.id
            ? {
                ...document,
                translations: document.translations.map((translation) => (
                  translation.id === selectedTranslation.id ? { ...translation, content: value } : translation
                )),
              }
            : document
        )));
        setDirtyIds((current) => new Set(current).add(selectedTranslation.id));
      },
    });

    editorRef.current = editor;
    return () => {
      if (editorRef.current === editor) editorRef.current = null;
      destroyVditor(editor);
    };
  }, [mode, screen, selected?.id, selectedTranslation?.id]);

  const openShelf = (filter: EntityFilter) => {
    setEntityFilter(filter);
    setScreen('content');
  };

  const refreshDocuments = () => {
    if (dirtyIds.size > 0) {
      setError('Save the open Markdown changes before refreshing the source tree.');
      return;
    }
    void loadDocuments();
  };

  const saveSelected = async () => {
    if (!selected || !selectedTranslation) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await invoke<EditorDocument>('save_document', {
        id: selectedTranslation.id,
        content: selectedTranslation.content,
        expectedRevision: selectedTranslation.revision,
      });
      setDocuments((current) => current.map((document) => {
        if (document.id !== saved.id) return document;
        return {
          ...saved,
          translations: document.translations.map((translation) => {
            if (translation.id === selectedTranslation.id) {
              return saved.translations.find((candidate) => candidate.id === translation.id) || translation;
            }
            if (dirtyIds.has(translation.id)) return translation;
            return saved.translations.find((candidate) => candidate.id === translation.id) || translation;
          }),
        };
      }));
      setDirtyIds((current) => {
        const next = new Set(current);
        next.delete(selectedTranslation.id);
        return next;
      });
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };

  const renderDocumentRow = (document: EditorDocument, label = document.role) => (
    <button
      type="button"
      key={document.id}
      className={`document-row ${document.id === selected?.id ? 'active' : ''}`}
      onClick={() => setSelectedId(document.id)}
    >
      <FileText size={15} />
      <span className="document-copy">
        <strong>{label}</strong>
        <small>{document.translations.map((translation) => translation.language).join(' / ')}</small>
      </span>
      {document.translations.some((translation) => dirtyIds.has(translation.id)) && <span className="dirty-dot" />}
    </button>
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <FileText size={17} />
          <div>
            <div className="brand-title">Silan</div>
            <div className="brand-subtitle">Markdown studio</div>
          </div>
        </div>

        <nav className="entity-nav" aria-label="Workspace navigation">
          <button
            type="button"
            className={`entity-button ${screen === 'dashboard' ? 'active' : ''}`}
            onClick={() => setScreen('dashboard')}
          >
            <BarChart3 size={16} />
            <span>Dashboard</span>
            <strong>{dashboard?.pending_comments || 0}</strong>
          </button>
          <div className="nav-rule" />
          {entityFilters.map((filter) => {
            const { label, Icon } = entityMeta[filter];
            return (
              <button
                type="button"
                key={filter}
                className={`entity-button ${screen === 'content' && entityFilter === filter ? 'active' : ''}`}
                onClick={() => openShelf(filter)}
              >
                <Icon size={16} />
                <span>{label}</span>
                <strong>{entityCounts.get(filter) || 0}</strong>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <label className="search">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
          </label>
          <div className="source-note">
            <FileText size={14} />
            <span><strong>content/</strong> is the source</span>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="title-block">
            <div className="eyebrow">{screen === 'dashboard' ? 'Workspace' : 'Content library'}</div>
            <h1>{screen === 'dashboard' ? 'Overview' : currentShelf.label}</h1>
            <div className="meta">
              {screen === 'dashboard' ? (
                <>
                  <span>{dashboard?.human_interactions || 0} human interactions</span>
                  <span>{dashboard?.pending_comments || 0} comments to review</span>
                  <span>{dirtyIds.size} unsaved Markdown files</span>
                </>
              ) : (
                <>
                  <span>{contentSummary}</span>
                  <span>{dirtyIds.size} unsaved</span>
                  {selected && <span>{docPath(selected)}</span>}
                </>
              )}
            </div>
          </div>
          {screen === 'content' && (
            <div className="mode-switch" role="tablist" aria-label="Editor mode">
              <button type="button" className={mode === 'edit' ? 'active' : ''} disabled={!selected} onClick={() => setMode('edit')}>Edit</button>
              <button type="button" className={mode === 'preview' ? 'active' : ''} disabled={!selected} onClick={() => setMode('preview')}>Preview</button>
            </div>
          )}
        </header>

        {error && (
          <div className="error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {screen === 'dashboard' ? (
          <section className="dashboard-area">
            <div className="dashboard-grid">
              <section className="activity-summary">
                <div>
                  <div className="eyebrow">Site activity</div>
                  <h2>{dashboard?.human_interactions || 0}</h2>
                  <p>human interactions recorded in the local projection</p>
                </div>
                <div className="activity-breakdown">
                  <div><span>Views</span><strong>{dashboard?.total_views || 0}</strong></div>
                  <div><span>Likes</span><strong>{dashboard?.total_likes || 0}</strong></div>
                  <div><span>Comments</span><strong>{dashboard?.total_comments || 0}</strong></div>
                  <div><span>Crawlers</span><strong>{dashboard?.crawler_interactions || 0}</strong></div>
                </div>
              </section>

              <section className="attention-panel">
                <span>Needs attention</span>
                <strong>{dashboard?.pending_comments || 0}</strong>
                <p>comments pending review</p>
              </section>

              <section className="recent-board">
                <div className="board-head">
                  <div>
                    <span>Content activity</span>
                    <h2>Recently touched</h2>
                  </div>
                  <button type="button" onClick={refreshDocuments} title="Refresh source tree" aria-label="Refresh source tree">
                    <RefreshCw size={15} />
                  </button>
                </div>
                <div className="recent-list">
                  {(dashboard?.recent_items || []).map((item) => (
                    <button
                      type="button"
                      key={`${item.entity_type}-${item.slug}`}
                      className="recent-row"
                      onClick={() => openShelf(item.entity_type as EntityFilter)}
                    >
                      <span className={badgeClass(item.entity_type as ContentKind)}>{item.entity_type}</span>
                      <strong>{item.title}</strong>
                      <small>{item.status || 'draft'} · {item.visibility || 'private'}</small>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </section>
        ) : (
          <section className="editor-area">
            <div className="workspace">
              <section className="library-panel" aria-label={`${currentShelf.label} content`}>
                <div className="library-head">
                  <div>
                    <span>{currentShelf.label}</span>
                    <strong>{filtered.length} parts</strong>
                  </div>
                  <button type="button" onClick={refreshDocuments} title="Refresh source tree" aria-label="Refresh source tree">
                    <RefreshCw size={15} />
                  </button>
                </div>

                <div className="document-list">
                  {loading ? (
                    <div className="empty">Reading Markdown sources...</div>
                  ) : filtered.length === 0 ? (
                    <div className="empty">No matching Markdown content.</div>
                  ) : entityFilter === 'episode' ? (
                    episodeSeries.map((series) => (
                      <section className="series-group" key={series.id}>
                        <div className="series-head">
                          <span>{series.title}</span>
                          <strong>{series.episodes.length}</strong>
                        </div>
                        {series.episodes.map((episode) => (
                          <div className="item-group" key={episode.id}>
                            <div className="item-head">
                              <span>Episode {episode.episodeNumber || '?'}</span>
                              <strong>{episode.title}</strong>
                            </div>
                            {episode.documents.map((document) => renderDocumentRow(document))}
                          </div>
                        ))}
                      </section>
                    ))
                  ) : (
                    <>
                      {contentGroups.map((group) => (
                        <section className="item-group" key={group.id}>
                          <div className="item-head">
                            {entityFilter === 'all' && <span className={badgeClass(group.kind)}>{group.kind}</span>}
                            <strong>{group.title}</strong>
                            <small>{group.status || 'draft'}</small>
                          </div>
                          {group.documents.map((document) => renderDocumentRow(document))}
                        </section>
                      ))}
                      {entityFilter === 'all' && episodeSeries.map((series) => (
                        <section className="series-group" key={series.id}>
                          <div className="series-head">
                            <span>{series.title}</span>
                            <strong>{series.episodes.length} episodes</strong>
                          </div>
                          {series.episodes.map((episode) => (
                            <div className="item-group" key={episode.id}>
                              <div className="item-head">
                                <span className={badgeClass('episode')}>episode {episode.episodeNumber || '?'}</span>
                                <strong>{episode.title}</strong>
                              </div>
                              {episode.documents.map((document) => renderDocumentRow(document))}
                            </div>
                          ))}
                        </section>
                      ))}
                    </>
                  )}
                </div>
              </section>

              <section className="writing-panel" aria-label="Selected Markdown editor">
                {!selected && !loading ? (
                  <div className="empty large">Select a Markdown Part from the content library.</div>
                ) : selected ? (
                  <>
                    <header className="document-header">
                      <div className="document-identity">
                        <span className={badgeClass(selected.entity_type)}>{selected.entity_type}</span>
                        <div>
                          <h2>{selected.title}</h2>
                          <p>{selected.role} · {selectedTranslation?.source_path}</p>
                        </div>
                      </div>
                      <div className="document-state">
                        {selected.status && <span>{selected.status}</span>}
                        {selected.visibility && <span>{selected.visibility}</span>}
                      </div>
                    </header>

                    <div className="editor-frame" data-entity={selected.entity_type}>
                      <div className="language-tabs" role="tablist" aria-label="Language representations">
                        {selected.translations.map((translation) => (
                          <button
                            type="button"
                            key={translation.id}
                            className={translation.id === selectedTranslation?.id ? 'active' : ''}
                            onClick={() => setLanguageByDocument((current) => ({
                              ...current,
                              [selected.id]: translation.language,
                            }))}
                          >
                            {translation.language}
                            {dirtyIds.has(translation.id) && <span />}
                          </button>
                        ))}
                      </div>
                      {mode === 'edit' ? (
                        <div ref={hostRef} className="editor-host" />
                      ) : (
                        <MarkdownPreview content={selectedTranslation?.content || ''} />
                      )}
                    </div>
                  </>
                ) : null}
              </section>
            </div>
          </section>
        )}

        {screen === 'dashboard' ? (
          <div className="quick-dock" aria-label="Writing shortcuts">
            <button type="button" onClick={() => openShelf('blog')}><PencilLine size={15} />Write blog</button>
            <button type="button" onClick={() => openShelf('idea')}><Lightbulb size={15} />Record idea</button>
            <button type="button" onClick={() => openShelf('update')}><Clock3 size={15} />Log update</button>
          </div>
        ) : (
          <div className="save-dock">
            <div>
              <strong>{dirty ? 'Unsaved Markdown' : 'Source saved'}</strong>
              <span>{selectedTranslation?.source_path || 'No source selected'}</span>
            </div>
            <button className="primary" type="button" disabled={!selected || !dirty || saving} onClick={() => void saveSelected()}>
              <Save size={16} />
              {saving ? 'Saving' : 'Save Markdown'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
