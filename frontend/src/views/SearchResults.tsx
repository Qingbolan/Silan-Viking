import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  Aperture,
  BookOpen,
  Briefcase,
  CalendarDays,
  FileText,
  Search,
  X,
} from 'lucide-react';
import { useLanguage } from '../components/LanguageContext';
import { useTheme } from '../components/ThemeContext';
import { GEO_TOPICS, SITE_NAME, SITE_URL, Seo } from '../components/Seo';
import { publicAssetUrl } from '../utils/publicAsset';
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
  Skeleton,
  type SegmentedOption,
} from '../components/ds';
import { dsRoot } from '../components/ds/dsAttr';

type SearchTab = 'all' | SearchResultKind;
type LoadState = 'idle' | 'loading' | 'ready' | 'error';

const KIND_ICONS = {
  blog: FileText,
  episode: BookOpen,
  project: Briefcase,
  moment: Aperture,
} as const;

const KIND_ORDER: SearchResultKind[] = ['blog', 'episode', 'project', 'moment'];
const SEARCH_HISTORY_KEY = 'silan.search.history.v1';
const MOBILE_TYPE = {
  meta: 'text-[0.75rem] leading-4',
  action: 'text-[0.8125rem] leading-[1.125rem]',
  body: 'text-[0.875rem] leading-5',
  input: 'text-[1rem] leading-5',
  title: 'text-[0.9375rem] leading-[1.375rem]',
  sectionTitle: 'text-[1rem] leading-6',
  suggestion: 'text-[0.875rem] leading-5',
} as const;
const MOBILE_SUGGESTIONS = {
  en: ['sumariki', '2026 KDD Cup', 'EasyNet Axon', 'Open-Sora 2.0', 'AAAI 2027 timeline', 'NUS graduation'],
  zh: ['sumariki', '2026 KDD Cup', 'EasyNet Axon', 'Open-Sora 2.0', 'AAAI 2027 时间线', 'NUS 毕业典礼'],
} as const;

const readSearchHistory = (): string[] => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 8)
      : [];
  } catch {
    return [];
  }
};

const persistSearchHistory = (items: string[]) => {
  try {
    window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(items.slice(0, 8)));
  } catch {
    // Browser storage is a convenience for the mobile search page, not a dependency.
  }
};

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
        className="grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)] gap-3 py-5 text-ds-fg outline-none transition-colors active:text-ds-primary focus-visible:rounded-ds-md focus-visible:shadow-ds-focus sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:gap-4 sm:py-6 sm:hover:text-ds-primary"
      >
        <span className="mt-0.5 flex size-9 items-center justify-center rounded-full border border-ds-border bg-ds-surface-1 text-ds-fg-muted transition-colors group-active:bg-ds-primary-soft sm:group-hover:border-ds-primary/30 sm:group-hover:bg-ds-primary-soft sm:group-hover:text-ds-primary">
          <Icon className="size-4" aria-hidden />
        </span>

        <span className="min-w-0">
          <span className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${MOBILE_TYPE.meta} text-ds-fg-subtle sm:text-ds-xs`}>
            {result.context && <span className="font-medium text-ds-fg-muted">{result.context}</span>}
            {formattedDate && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3" aria-hidden />
                {formattedDate}
              </span>
            )}
          </span>
          <span className={`mt-1 block text-balance ${MOBILE_TYPE.title} font-semibold text-ds-fg sm:text-ds-xl sm:leading-snug sm:tracking-[-0.015em] sm:group-hover:text-ds-primary`}>
            {result.title}
          </span>
          {result.description && (
            <span className={`mt-1.5 line-clamp-2 block ${MOBILE_TYPE.action} text-ds-fg-muted sm:text-ds-sm sm:leading-6`}>
              {result.description}
            </span>
          )}
          {result.tags.length > 0 && (
            <span className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
              {result.tags.slice(0, 4).map((tag) => (
                <span key={tag} className={`${MOBILE_TYPE.meta} font-mono text-ds-fg-subtle sm:text-ds-xs`}>#{tag}</span>
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
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { colors, isDarkMode } = useTheme();
  const locale = language as 'en' | 'zh';
  const [draft, setDraft] = useState(query);
  const [response, setResponse] = useState<GlobalSearchResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>(query ? 'loading' : 'idle');
  const [activeTab, setActiveTab] = useState<SearchTab>('all');
  const [retryKey, setRetryKey] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const copy = language === 'en'
    ? {
        eyebrow: 'Find anything',
        title: 'Search',
        description: 'Search every published article, episode, project, and moment.',
        placeholder: 'Search the knowledge base…',
        mobilePlaceholder: '',
        submit: 'Search',
        clearQuery: 'Clear search text',
        all: 'All',
        blog: 'Articles',
        episode: 'Episodes',
        project: 'Projects',
        moment: 'Moments',
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
        back: 'Back',
        history: 'History',
        clearHistory: 'Clear search history',
        clear: 'Clear',
        suggestions: 'Try searching',
        mobileIdleTitle: 'Start with a topic or phrase',
        mobileIdleBody: 'Search across articles, episodes, projects, and moments.',
        seoTitle: 'Silan Hu knowledge base search index',
        seoBody: 'Search Silan Hu authored articles, episodes, projects, moments, AI systems research notes, engineering work, and GEO-ready identity context.',
      }
    : {
        eyebrow: '查找内容',
        title: '搜索',
        description: '搜索所有已发布的文章、系列章节、项目和瞬间。',
        placeholder: '搜索知识库…',
        mobilePlaceholder: '',
        submit: '搜索',
        clearQuery: '清除搜索词',
        all: '全部',
        blog: '文章',
        episode: '章节',
        project: '项目',
        moment: '瞬间',
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
        back: '返回',
        history: '历史记录',
        clearHistory: '清空搜索历史',
        clear: '清空',
        suggestions: '猜你想搜',
        mobileIdleTitle: '输入主题或短语',
        mobileIdleBody: '搜索文章、系列章节、项目与瞬间。',
        seoTitle: 'Silan Hu 知识库搜索索引',
        seoBody: '搜索 Silan Hu 的文章、系列章节、项目、瞬间、AI 系统研究记录、工程实践与 GEO 身份上下文。',
      };

  useEffect(() => setDraft(query), [query]);

  useLayoutEffect(() => {
    setHistory(readSearchHistory());
    if (window.matchMedia('(max-width: 639px)').matches) {
      const browserWindow = document.getElementById('browser-window');
      inputRef.current?.focus({ preventScroll: true });
      browserWindow?.scrollTo({ top: 0, left: 0 });
      window.scrollTo({ top: 0, left: 0 });
    }
    return undefined;
  }, []);

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

  const commitSearch = useCallback((value: string) => {
    const next = value.trim();
    setActiveTab('all');
    if (next) {
      setHistory((current) => {
        const updated = [next, ...current.filter((item) => item.toLocaleLowerCase() !== next.toLocaleLowerCase())].slice(0, 8);
        persistSearchHistory(updated);
        return updated;
      });
    }
    setSearchParams(next ? { q: next } : {});
  }, [setSearchParams]);

  const submit = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    commitSearch(draft);
  }, [commitSearch, draft]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    persistSearchHistory([]);
  }, []);

  const goBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  }, [navigate]);

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
      option('moment', copy.moment, counts?.moment ?? 0),
    ];
  }, [copy.all, copy.blog, copy.episode, copy.moment, copy.project, response]);

  const visibleGroups = useMemo(() => {
    if (!response) return [];
    return KIND_ORDER
      .filter((kind) => activeTab === 'all' || activeTab === kind)
      .map((kind) => ({ kind, items: response.groups[kind] }))
      .filter((group) => group.items.length > 0);
  }, [activeTab, response]);

  const suggestions = MOBILE_SUGGESTIONS[locale];
  const mobileFilterOptions = tabOptions.filter((option) => option.value === 'all' || String(option.label).match(/\d+$/));
  const mobileTheme = useMemo(() => ({
    page: colors.dsCanvas,
    surface: colors.dsSurface1,
    surface2: colors.dsSurface2,
    surface3: colors.dsSurface3,
    border: colors.dsBorder,
    text: colors.textPrimary,
    muted: colors.textSecondary,
    subtle: colors.textTertiary,
    accent: colors.dsPrimary,
    accentSoft: colors.dsPrimarySoft,
    danger: colors.error,
    shadow: isDarkMode ? '0 18px 48px oklch(0 0 0 / 0.34)' : '0 18px 44px oklch(0 0 0 / 0.08)',
  }), [colors, isDarkMode]);
  const searchJsonLd = useMemo(
    () => [
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: SITE_NAME,
        url: SITE_URL,
        potentialAction: {
          '@type': 'SearchAction',
          target: `${SITE_URL}/search?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: copy.seoTitle,
        url: `${SITE_URL}/search`,
        description: copy.seoBody,
        about: GEO_TOPICS.map((topic) => ({ '@type': 'Thing', name: topic })),
        isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
      },
    ],
    [copy.seoBody, copy.seoTitle],
  );

  return (
    <div
      {...dsRoot}
      className="mx-auto min-h-[100svh] max-w-none px-3 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(0.375rem,env(safe-area-inset-top))] sm:min-h-screen sm:max-w-5xl sm:bg-transparent sm:px-8 sm:py-16 sm:text-ds-fg"
      style={{ backgroundColor: mobileTheme.page, color: mobileTheme.text }}
    >
      <Seo title={copy.title} description={copy.seoBody} path="/search" noindex={Boolean(query)} lang={locale} jsonLd={searchJsonLd} />

      <section className="sr-only">
        <h1>{copy.seoTitle}</h1>
        <p>{copy.seoBody}</p>
        <ul>
          <li>Content types: articles, episodes, projects, moments.</li>
          <li>Canonical identity: Silan Hu, 胡思蓝, AI systems researcher and full-stack engineer.</li>
          <li>Search topics: {GEO_TOPICS.join(', ')}.</li>
          <li>Search URL pattern: /search?q=search_term_string.</li>
        </ul>
      </section>

      <div className="sm:hidden">
        <form
          onSubmit={submit}
          role="search"
          className="sticky top-0 z-30 -mx-3 flex items-center gap-2 px-3 pb-2 pt-1 backdrop-blur-xl"
          style={{ backgroundColor: `${mobileTheme.page}f2` }}
        >
          <button
            {...dsRoot}
            type="button"
            aria-label={copy.back}
            onClick={goBack}
            className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full transition-transform active:scale-[0.96]"
          >
            <img
              src={publicAssetUrl('/image.png')}
              alt={SITE_NAME}
              className="size-full object-cover"
            />
          </button>

          <div
            className="flex h-10 min-w-0 flex-1 items-center rounded-full pl-4 pr-1"
            style={{
              backgroundColor: mobileTheme.surface,
              boxShadow: colors.shadowSm,
            }}
            onClick={() => inputRef.current?.focus({ preventScroll: true })}
          >
            <input
              {...dsRoot}
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={copy.mobilePlaceholder}
              aria-label={copy.placeholder}
              autoComplete="off"
              inputMode="search"
              enterKeyHint="search"
              spellCheck={false}
              className={`min-w-0 flex-1 appearance-none bg-transparent ${MOBILE_TYPE.input} font-semibold outline-none placeholder:text-ds-fg focus:outline-none`}
              style={{
                boxShadow: 'none',
                outline: 'none',
                color: mobileTheme.text,
                caretColor: mobileTheme.accent,
              }}
              onFocus={(event) => {
                event.currentTarget.style.boxShadow = 'none';
              }}
              onBlur={(event) => {
                event.currentTarget.style.boxShadow = 'none';
              }}
            />
            {draft && (
              <button
                {...dsRoot}
                type="button"
                aria-label={copy.clearQuery}
                onClick={() => setDraft('')}
                className="flex size-8 shrink-0 items-center justify-center rounded-full transition-colors"
                style={{ color: mobileTheme.subtle }}
              >
                <X className="size-[18px]" aria-hidden />
              </button>
            )}
            <button
              {...dsRoot}
              type="submit"
              disabled={!draft.trim()}
              aria-label={copy.submit}
              className="flex size-9 shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-70"
              style={{ color: draft.trim() ? mobileTheme.text : mobileTheme.subtle }}
            >
              <Search className="size-5" aria-hidden />
            </button>
          </div>
        </form>

        {!query && (
          <div className="space-y-7 px-1 pt-2">
            {history.length > 0 && (
              <section aria-labelledby="mobile-search-history">
                <div className="mb-3 flex items-center justify-between">
                  <h2 id="mobile-search-history" className={`${MOBILE_TYPE.sectionTitle} font-semibold`} style={{ color: mobileTheme.text }}>
                    {copy.history}
                  </h2>
                  <button
                    {...dsRoot}
                    type="button"
                    aria-label={copy.clearHistory}
                    onClick={clearHistory}
                    className={`rounded-full px-2.5 py-1 ${MOBILE_TYPE.meta} font-medium transition-colors`}
                    style={{ color: mobileTheme.subtle }}
                  >
                    {copy.clear}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {history.map((item) => (
                    <button
                      {...dsRoot}
                      key={item}
                      type="button"
                      onClick={() => commitSearch(item)}
                      className={`rounded-full border px-3.5 py-1.5 ${MOBILE_TYPE.body} font-medium transition-colors`}
                      style={{
                        backgroundColor: mobileTheme.surface,
                        borderColor: mobileTheme.border,
                        color: mobileTheme.muted,
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section aria-labelledby="mobile-search-suggestions">
              <div className="mb-4">
                <h2 id="mobile-search-suggestions" className={`${MOBILE_TYPE.sectionTitle} font-semibold`} style={{ color: mobileTheme.text }}>
                  {copy.suggestions}
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
                {suggestions.map((item) => (
                  <button
                    {...dsRoot}
                    key={item}
                    type="button"
                    onClick={() => commitSearch(item)}
                    className={`min-h-10 min-w-0 text-left ${MOBILE_TYPE.suggestion} transition-colors`}
                    style={{ color: mobileTheme.muted }}
                  >
                    <span className="block max-w-full break-words">{item}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      <header className="mx-auto hidden max-w-3xl text-center sm:block">
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
        <div className="mt-4 border-y py-3 sm:mt-10 sm:border-ds-border sm:py-4" style={{ borderColor: mobileTheme.border }}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className={`min-w-0 ${MOBILE_TYPE.body} sm:text-ds-sm sm:text-ds-fg-muted`} style={{ color: mobileTheme.muted }}>
              {copy.resultsFor} <strong className="font-semibold sm:text-ds-fg" style={{ color: mobileTheme.text }}>“{query}”</strong>
            </p>
            <div className="-mx-3.5 flex gap-2 overflow-x-auto px-3.5 pb-1 sm:hidden">
              {mobileFilterOptions.map((option) => (
                <button
                  {...dsRoot}
                  key={option.value}
                  type="button"
                  onClick={() => setActiveTab(option.value as SearchTab)}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 ${MOBILE_TYPE.action} font-medium transition-colors`}
                  style={{
                    borderColor: activeTab === option.value ? mobileTheme.accent : mobileTheme.border,
                    backgroundColor: activeTab === option.value ? mobileTheme.accentSoft : mobileTheme.surface,
                    color: activeTab === option.value ? mobileTheme.accent : mobileTheme.muted,
                  }}
                >
                  {option.label}
                </button>
              ))}
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

      <section className={query ? 'mt-5 sm:mt-8' : 'mt-8 hidden sm:block'} aria-live="polite" aria-busy={loadState === 'loading'}>
        {loadState === 'idle' && (
          <EmptyState icon={<Search />} title={copy.idleTitle} description={copy.idleBody} />
        )}

        {loadState === 'loading' && (
          <div aria-label={copy.loading} className="space-y-0 divide-y border-y sm:divide-ds-border sm:border-ds-border" style={{ borderColor: mobileTheme.border }}>
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
          <>
            <div
              className="rounded-[1rem] border p-4 sm:hidden"
              style={{ backgroundColor: colors.dsErrorSoft, borderColor: colors.error }}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: colors.error, color: colors.error }}>
                  <X className="size-4" aria-hidden />
                </span>
                <div>
                  <h2 className={`${MOBILE_TYPE.title} font-semibold`} style={{ color: mobileTheme.text }}>{copy.errorTitle}</h2>
                  <p className={`mt-2 ${MOBILE_TYPE.body}`} style={{ color: mobileTheme.muted }}>{copy.errorBody}</p>
                  <button
                    {...dsRoot}
                    type="button"
                    className={`mt-3 rounded-full px-3.5 py-1.5 ${MOBILE_TYPE.action} font-medium`}
                    style={{ backgroundColor: mobileTheme.surface, color: mobileTheme.text }}
                    onClick={() => setRetryKey((key) => key + 1)}
                  >
                    {copy.retry}
                  </button>
                </div>
              </div>
            </div>
            <Alert tone="error" title={copy.errorTitle} className="hidden sm:block">
              <p>{copy.errorBody}</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setRetryKey((key) => key + 1)}>
                {copy.retry}
              </Button>
            </Alert>
          </>
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
          <>
            <div className="mt-16 text-center sm:hidden">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full" style={{ backgroundColor: mobileTheme.surface, color: mobileTheme.subtle }}>
                <Search className="size-8" aria-hidden />
              </div>
              <h2 className={`mt-4 ${MOBILE_TYPE.sectionTitle} font-semibold`} style={{ color: mobileTheme.text }}>{copy.emptyTitle}</h2>
              <p className={`mt-2 ${MOBILE_TYPE.body}`} style={{ color: mobileTheme.muted }}>{copy.emptyBody}</p>
            </div>
            <div className="hidden sm:block">
              <EmptyState icon={<Search />} title={copy.emptyTitle} description={copy.emptyBody} />
            </div>
          </>
        )}

        {loadState === 'ready' && visibleGroups.length > 0 && (
          <div className="space-y-10">
            {visibleGroups.map(({ kind, items }) => {
              const Icon = KIND_ICONS[kind];
              const label = copy[kind];
              return (
                <section key={kind} aria-labelledby={`search-${kind}`}>
                  <div className="flex items-center justify-between border-b pb-3 sm:border-ds-border" style={{ borderColor: mobileTheme.border }}>
                    <h2 id={`search-${kind}`} className={`flex items-center gap-2 ${MOBILE_TYPE.meta} font-semibold uppercase tracking-[0.08em] sm:text-ds-sm sm:text-ds-fg-muted`} style={{ color: mobileTheme.subtle }}>
                      <Icon className="size-4" aria-hidden />
                      {label}
                    </h2>
                    <span className={`${MOBILE_TYPE.meta} rounded-full px-2.5 py-1 font-medium sm:hidden`} style={{ backgroundColor: mobileTheme.surface, color: mobileTheme.muted }}>
                      {response?.counts[kind] ?? items.length}
                    </span>
                    <Badge appearance="soft" tone="neutral" className="hidden sm:inline-flex">{response?.counts[kind] ?? items.length}</Badge>
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
