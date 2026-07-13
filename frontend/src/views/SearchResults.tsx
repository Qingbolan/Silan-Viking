import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  BookOpen,
  Briefcase,
  CalendarDays,
  FileText,
  Lightbulb,
  Search,
} from 'lucide-react';
import { useLanguage } from '../components/LanguageContext';
import { Seo } from '../components/Seo';
import {
  globalSearch,
  type GlobalSearchResponse,
  type SearchResult,
  type SearchResultKind,
} from '../api/search/searchApi';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Input,
  Segmented,
  Select,
  Skeleton,
  type SegmentedOption,
} from '../components/ds';

type SearchTab = 'all' | SearchResultKind;
type LoadState = 'idle' | 'loading' | 'ready' | 'error';

const KIND_ICONS = {
  blog: FileText,
  episode: BookOpen,
  project: Briefcase,
  idea: Lightbulb,
} as const;

const KIND_ORDER: SearchResultKind[] = ['blog', 'episode', 'project', 'idea'];

const validDate = (value?: string): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1 ? null : date;
};

const SearchResultRow: React.FC<{
  result: SearchResult;
  query: string;
  language: 'en' | 'zh';
  index: number;
}> = ({ result, query, language, index }) => {
  const Icon = KIND_ICONS[result.kind];
  const date = validDate(result.date);
  const formattedDate = date?.toLocaleDateString(language === 'en' ? 'en-SG' : 'zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.035, 0.18) }}
      className="group border-b border-ds-border last:border-b-0"
    >
      <Link
        to={result.path}
        className="grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)] gap-3 py-5 outline-none transition-colors hover:text-ds-primary focus-visible:rounded-ds-md focus-visible:shadow-ds-focus sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:gap-4 sm:py-6"
      >
        <span className="mt-0.5 flex size-9 items-center justify-center rounded-full border border-ds-border bg-ds-surface-1 text-ds-fg-muted transition-colors group-hover:border-ds-primary/30 group-hover:bg-ds-primary-soft group-hover:text-ds-primary">
          <Icon className="size-4" aria-hidden />
        </span>

        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ds-xs text-ds-fg-subtle">
            {result.context && <span className="font-medium text-ds-fg-muted">{result.context}</span>}
            {formattedDate && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3" aria-hidden />
                {formattedDate}
              </span>
            )}
          </span>
          <span className="mt-1 block text-balance text-ds-lg font-semibold leading-snug tracking-[-0.015em] text-ds-fg group-hover:text-ds-primary sm:text-ds-xl">
            {result.title}
          </span>
          {result.description && (
            <span className="mt-1.5 line-clamp-2 block text-ds-sm leading-6 text-ds-fg-muted">
              {result.description}
            </span>
          )}
          {result.tags.length > 0 && (
            <span className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
              {result.tags.slice(0, 4).map((tag) => (
                <span key={tag} className="font-mono text-ds-xs text-ds-fg-subtle">#{tag}</span>
              ))}
            </span>
          )}
        </span>

        <ArrowUpRight className="mt-1 hidden size-4 text-ds-fg-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ds-primary sm:block" aria-hidden />
        <span className="sr-only">
          {language === 'en' ? `Open result for ${query}` : `打开“${query}”的搜索结果`}
        </span>
      </Link>
    </motion.li>
  );
};

const SearchResults: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').trim();
  const { language } = useLanguage();
  const locale = language as 'en' | 'zh';
  const [draft, setDraft] = useState(query);
  const [response, setResponse] = useState<GlobalSearchResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>(query ? 'loading' : 'idle');
  const [activeTab, setActiveTab] = useState<SearchTab>('all');
  const [retryKey, setRetryKey] = useState(0);

  const copy = language === 'en'
    ? {
        eyebrow: 'Find anything',
        title: 'Search',
        description: 'Search every published article, episode, project, and research idea.',
        placeholder: 'Search the knowledge base…',
        submit: 'Search',
        all: 'All',
        blog: 'Articles',
        episode: 'Episodes',
        project: 'Projects',
        idea: 'Ideas',
        resultsFor: 'Results for',
        loading: 'Searching published content',
        idleTitle: 'Search the knowledge base',
        idleBody: 'Try a system name, research topic, technology, or phrase from an article.',
        emptyTitle: 'No published content matched',
        emptyBody: 'Try a shorter phrase or a related term.',
        errorTitle: 'Search is temporarily unavailable',
        errorBody: 'The content service did not respond. Your query is still here.',
        partialTitle: 'Some result types are unavailable',
        partialBody: 'The available results are shown below. Retry to search every content type.',
        retry: 'Try again',
      }
    : {
        eyebrow: '查找内容',
        title: '搜索',
        description: '搜索所有已发布的文章、系列章节、项目和研究想法。',
        placeholder: '搜索知识库…',
        submit: '搜索',
        all: '全部',
        blog: '文章',
        episode: '章节',
        project: '项目',
        idea: '想法',
        resultsFor: '搜索结果',
        loading: '正在搜索已发布内容',
        idleTitle: '搜索知识库',
        idleBody: '可输入系统名称、研究主题、技术或文章中的短语。',
        emptyTitle: '没有匹配的已发布内容',
        emptyBody: '可以尝试更短的短语或相关词。',
        errorTitle: '搜索暂时不可用',
        errorBody: '内容服务没有响应，当前查询仍已保留。',
        partialTitle: '部分内容类型暂时不可用',
        partialBody: '可用结果已显示在下方，可重试以搜索全部内容。',
        retry: '重试',
      };

  useEffect(() => setDraft(query), [query]);

  useEffect(() => {
    if (!query) {
      setResponse(null);
      setLoadState('idle');
      return;
    }

    const controller = new AbortController();
    setLoadState('loading');
    void globalSearch({ query, type: 'all', limit: 20 }, locale, controller.signal)
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
    return () => controller.abort();
  }, [query, locale, retryKey]);

  const submit = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    const next = draft.trim();
    setActiveTab('all');
    setSearchParams(next ? { q: next } : {});
  }, [draft, setSearchParams]);

  const tabOptions = useMemo<SegmentedOption[]>(() => {
    const counts = response?.counts;
    const option = (value: SearchTab, label: string, count: number) => ({
      value,
      label: `${label}${count > 0 ? ` ${count}` : ''}`,
    });
    return [
      option('all', copy.all, response?.total ?? 0),
      option('blog', copy.blog, counts?.blog ?? 0),
      option('episode', copy.episode, counts?.episode ?? 0),
      option('project', copy.project, counts?.project ?? 0),
      option('idea', copy.idea, counts?.idea ?? 0),
    ];
  }, [copy.all, copy.blog, copy.episode, copy.idea, copy.project, response]);

  const visibleGroups = useMemo(() => {
    if (!response) return [];
    return KIND_ORDER
      .filter((kind) => activeTab === 'all' || activeTab === kind)
      .map((kind) => ({ kind, items: response.groups[kind] }))
      .filter((group) => group.items.length > 0);
  }, [activeTab, response]);

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 py-12 sm:px-8 sm:py-16">
      <Seo title={copy.title} description={copy.description} path="/search" noindex lang={locale} />

      <header className="mx-auto max-w-3xl text-center">
        <p className="text-ds-xs font-medium uppercase tracking-[0.14em] text-ds-primary">{copy.eyebrow}</p>
        <h1 className="mt-2 text-5xl font-bold leading-none tracking-[-0.03em] text-ds-fg md:text-6xl">{copy.title}</h1>
        <p className="mx-auto mt-4 max-w-xl text-ds-lg leading-7 text-ds-fg-muted">{copy.description}</p>

        <form onSubmit={submit} role="search" className="mx-auto mt-8 flex max-w-2xl gap-2 text-left">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            leadingIcon={<Search />}
            placeholder={copy.placeholder}
            aria-label={copy.placeholder}
            className="min-w-0 flex-1"
          />
          <Button type="submit" disabled={!draft.trim()}>{copy.submit}</Button>
        </form>
      </header>

      {query && (
        <div className="mt-10 border-y border-ds-border py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 text-ds-sm text-ds-fg-muted">
              {copy.resultsFor} <strong className="font-semibold text-ds-fg">“{query}”</strong>
            </p>
            <div className="w-full sm:hidden">
              <Select
                size="sm"
                value={activeTab}
                onChange={(event) => setActiveTab(event.target.value as SearchTab)}
                options={tabOptions.map((option) => ({ value: option.value, label: String(option.label) }))}
                aria-label={language === 'en' ? 'Filter search results' : '筛选搜索结果'}
              />
            </div>
            <div className="hidden sm:block">
              <Segmented
                tone="primary"
                value={activeTab}
                onChange={(value) => setActiveTab(value as SearchTab)}
                options={tabOptions}
                ariaLabel={language === 'en' ? 'Filter search results' : '筛选搜索结果'}
              />
            </div>
          </div>
        </div>
      )}

      <section className="mt-8" aria-live="polite" aria-busy={loadState === 'loading'}>
        {loadState === 'idle' && (
          <EmptyState icon={<Search />} title={copy.idleTitle} description={copy.idleBody} />
        )}

        {loadState === 'loading' && (
          <div aria-label={copy.loading} className="space-y-0 divide-y divide-ds-border border-y border-ds-border">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="grid grid-cols-[2.25rem_1fr] gap-3 py-5 sm:grid-cols-[2.5rem_1fr] sm:gap-4 sm:py-6">
                <Skeleton shape="circle" className="size-9" />
                <div className="space-y-2.5">
                  <Skeleton className="w-24" />
                  <Skeleton className="w-2/3" />
                  <Skeleton className="w-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {loadState === 'error' && (
          <Alert tone="error" title={copy.errorTitle}>
            <p>{copy.errorBody}</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setRetryKey((key) => key + 1)}>
              {copy.retry}
            </Button>
          </Alert>
        )}

        {loadState === 'ready' && response && response.partialFailures.length > 0 && (
          <Alert tone="warning" title={copy.partialTitle} className="mb-6">
            <p>{copy.partialBody}</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setRetryKey((key) => key + 1)}>
              {copy.retry}
            </Button>
          </Alert>
        )}

        {loadState === 'ready' && visibleGroups.length === 0 && (
          <EmptyState icon={<Search />} title={copy.emptyTitle} description={copy.emptyBody} />
        )}

        {loadState === 'ready' && visibleGroups.length > 0 && (
          <div className="space-y-10">
            {visibleGroups.map(({ kind, items }) => {
              const Icon = KIND_ICONS[kind];
              const label = copy[kind];
              return (
                <section key={kind} aria-labelledby={`search-${kind}`}>
                  <div className="flex items-center justify-between border-b border-ds-border pb-3">
                    <h2 id={`search-${kind}`} className="flex items-center gap-2 text-ds-sm font-semibold uppercase tracking-[0.08em] text-ds-fg-muted">
                      <Icon className="size-4" aria-hidden />
                      {label}
                    </h2>
                    <Badge appearance="soft" tone="neutral">{response?.counts[kind] ?? items.length}</Badge>
                  </div>
                  <ol>
                    {items.map((result, index) => (
                      <SearchResultRow key={`${kind}-${result.id}`} result={result} query={query} language={locale} index={index} />
                    ))}
                  </ol>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default SearchResults;
