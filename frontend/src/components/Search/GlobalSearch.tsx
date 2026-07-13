import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  FileText,
  Lightbulb,
  Search,
} from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import {
  globalSearch,
  type GlobalSearchResponse,
  type SearchResultKind,
} from '../../api/search/searchApi';
import { Alert, Button, EmptyState, Input, Modal, Skeleton } from '../ds';

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

const KIND_ORDER: SearchResultKind[] = ['blog', 'episode', 'project', 'idea'];
const KIND_ICONS = {
  blog: FileText,
  episode: BookOpen,
  project: Briefcase,
  idea: Lightbulb,
} as const;

const GlobalSearch: React.FC<GlobalSearchProps> = ({ isOpen, onClose, initialQuery = '', returnFocusRef }) => {
  const { language } = useLanguage();
  const locale = language as 'en' | 'zh';
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  const [response, setResponse] = useState<GlobalSearchResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  const copy = language === 'en'
    ? {
        title: 'Search the knowledge base',
        description: 'Articles, episodes, projects, and research ideas.',
        placeholder: 'Search by title, topic, or phrase…',
        idleTitle: 'Start with a topic or phrase',
        idleBody: 'Press Enter to open the full result page.',
        emptyTitle: 'No published content matched',
        emptyBody: 'Try a shorter phrase or a related term.',
        errorTitle: 'Search is unavailable',
        errorBody: 'The content service did not respond. Try again in a moment.',
        partial: 'Some content types could not be searched. Available results are still shown.',
        allResults: 'View all results',
        close: 'Close search',
      }
    : {
        title: '搜索知识库',
        description: '文章、系列章节、项目与研究想法。',
        placeholder: '按标题、主题或短语搜索…',
        idleTitle: '输入主题或短语',
        idleBody: '按回车可打开完整搜索结果页。',
        emptyTitle: '没有匹配的已发布内容',
        emptyBody: '可以尝试更短的短语或相关词。',
        errorTitle: '搜索暂时不可用',
        errorBody: '内容服务没有响应，请稍后重试。',
        partial: '部分内容类型暂时无法搜索，当前可用结果仍已显示。',
        allResults: '查看全部结果',
        close: '关闭搜索',
      };

  useEffect(() => {
    if (!isOpen) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResponse(null);
      setLoadState('idle');
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoadState('loading');
      void globalSearch({ query: trimmed, type: 'all', limit: 3 }, locale, controller.signal)
        .then((next) => {
          if (controller.signal.aborted) return;
          setResponse(next);
          setLoadState('ready');
        })
        .catch((error) => {
          if (controller.signal.aborted || error instanceof DOMException && error.name === 'AbortError') return;
          setResponse(null);
          setLoadState('error');
        });
    }, 240);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, locale, query]);

  const visibleGroups = useMemo(() => {
    if (!response) return [];
    return KIND_ORDER
      .map((kind) => ({ kind, items: response.groups[kind] }))
      .filter((group) => group.items.length > 0);
  }, [response]);

  const openAll = (currentValue: string = query) => {
    const trimmed = currentValue.trim();
    if (!trimmed) return;
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      size="lg"
      closeLabel={copy.close}
      returnFocusRef={returnFocusRef}
      className="max-h-[min(44rem,calc(100dvh-2rem))] overflow-hidden"
    >
      <form
        role="search"
        className="border-b border-ds-border pb-4"
        onSubmit={(event) => {
          event.preventDefault();
          // Read the control's current value so an immediate Enter after
          // typing cannot race React's state update by one render.
          openAll(inputRef.current?.value ?? query);
        }}
      >
        <Input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              openAll(event.currentTarget.value);
            }
          }}
          leadingIcon={<Search />}
          placeholder={copy.placeholder}
          aria-label={copy.placeholder}
          autoComplete="off"
        />
      </form>

      <div className="max-h-[min(31rem,calc(100dvh-13rem))] overflow-y-auto py-4" aria-live="polite" aria-busy={loadState === 'loading'}>
        {loadState === 'idle' && (
          <EmptyState icon={<Search />} title={copy.idleTitle} description={copy.idleBody} />
        )}

        {loadState === 'loading' && (
          <div className="divide-y divide-ds-border" aria-label={language === 'en' ? 'Searching' : '正在搜索'}>
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="grid grid-cols-[2rem_1fr] gap-3 py-3.5">
                <Skeleton shape="circle" className="size-8" />
                <div className="space-y-2">
                  <Skeleton className="w-2/3" />
                  <Skeleton className="w-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {loadState === 'error' && (
          <Alert tone="error" title={copy.errorTitle}>{copy.errorBody}</Alert>
        )}

        {loadState === 'ready' && response?.partialFailures.length ? (
          <Alert tone="warning" className="mb-4">{copy.partial}</Alert>
        ) : null}

        {loadState === 'ready' && visibleGroups.length === 0 && (
          <EmptyState icon={<Search />} title={copy.emptyTitle} description={copy.emptyBody} />
        )}

        {loadState === 'ready' && visibleGroups.length > 0 && (
          <div className="space-y-5">
            {visibleGroups.map(({ kind, items }) => {
              const Icon = KIND_ICONS[kind];
              return (
                <section key={kind} aria-labelledby={`quick-search-${kind}`}>
                  <h3 id={`quick-search-${kind}`} className="mb-1.5 flex items-center gap-1.5 text-ds-xs font-semibold uppercase tracking-[0.08em] text-ds-fg-subtle">
                    <Icon className="size-3.5" aria-hidden />
                    {language === 'en'
                      ? { blog: 'Articles', episode: 'Episodes', project: 'Projects', idea: 'Ideas' }[kind]
                      : { blog: '文章', episode: '章节', project: '项目', idea: '想法' }[kind]}
                    <span className="font-normal tracking-normal">{response?.counts[kind] ?? items.length}</span>
                  </h3>
                  <ul className="divide-y divide-ds-border border-y border-ds-border">
                    {items.map((result) => (
                      <li key={`${kind}-${result.id}`}>
                        <Link
                          to={result.path}
                          onClick={onClose}
                          className="group flex items-center gap-3 py-3 outline-none focus-visible:rounded-ds-sm focus-visible:shadow-ds-focus"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-ds-sm font-medium text-ds-fg group-hover:text-ds-primary">{result.title}</span>
                            {result.description && <span className="mt-0.5 block truncate text-ds-xs text-ds-fg-muted">{result.description}</span>}
                          </span>
                          <ArrowRight className="size-3.5 shrink-0 text-ds-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-ds-primary" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {query.trim() && loadState === 'ready' && response && response.total > 0 ? (
        <div className="border-t border-ds-border pt-3">
          <Button variant="ghost" className="w-full justify-center" onClick={() => openAll()}>
            {copy.allResults} <span className="tabular-nums">({response.total})</span>
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      ) : null}
    </Modal>
  );
};

export default GlobalSearch;
