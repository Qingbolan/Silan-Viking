import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from 'react';

/** An in-page section the address bar can surface as a `#anchor` crumb. */
export interface PageSection {
  /** The DOM id of the section element. */
  id: string;
  /** Human-readable section name. */
  title: string;
}

/** One choice in an address-bar filter facet. */
export interface PageFilterOption {
  /** Stable value identifying the choice. */
  value: string;
  /** Label shown in the dropdown. */
  label: string;
  /** Optional count shown trailing the label. */
  count?: number;
  /** 0 = top-level, 1 = indented child (e.g. months under a year). */
  level?: number;
}

/**
 * A page-scoped filter the address bar renders as a `#facet` crumb with
 * a dropdown — selecting an option drives the page's own filtering.
 */
export interface PageFilter {
  /** Selectable options, in display order. */
  options: PageFilterOption[];
  /** Currently selected value, or null when nothing is filtered. */
  activeValue: string | null;
  /** Label shown when nothing is selected (e.g. "全部"). */
  allLabel: string;
  /** Called with a value to select it, or null to clear the filter. */
  onSelect: (value: string | null) => void;
}

/**
 * What the address bar knows about the current page beyond its route:
 * the title of a content detail page, and the in-page section the
 * reader is currently looking at.
 */
interface PageTitleValue {
  /** Current detail title, or null on list/section pages. */
  title: string | null;
  /** Detail pages register their title here; pass null to clear it. */
  setTitle: (title: string | null) => void;
  /** In-page sections, or [] when the page has none. */
  sections: PageSection[];
  setSections: (sections: PageSection[]) => void;
  /** The id of the section currently in view, or null. */
  activeSectionId: string | null;
  setActiveSectionId: (id: string | null) => void;
  /** Address-bar filter facet, or null when the page has none. */
  filter: PageFilter | null;
  setFilter: (filter: PageFilter | null) => void;
}

const PageTitleContext = createContext<PageTitleValue | undefined>(undefined);

export const PageTitleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [title, setTitle] = useState<string | null>(null);
  const [sections, setSections] = useState<PageSection[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [filter, setFilter] = useState<PageFilter | null>(null);

  const value = useMemo<PageTitleValue>(
    () => ({
      title,
      setTitle,
      sections,
      setSections,
      activeSectionId,
      setActiveSectionId,
      filter,
      setFilter,
    }),
    [title, sections, activeSectionId, filter],
  );
  return <PageTitleContext.Provider value={value}>{children}</PageTitleContext.Provider>;
};

const usePageTitleContext = (): PageTitleValue => {
  const ctx = useContext(PageTitleContext);
  if (!ctx) throw new Error('PageTitle hooks must be used within a PageTitleProvider');
  return ctx;
};

/** Read the current detail title — used by the address bar. */
export const usePageTitle = (): string | null => usePageTitleContext().title;

/** Read the in-page sections and which one is active — used by the address bar. */
export const usePageSectionState = (): {
  sections: PageSection[];
  activeSectionId: string | null;
} => {
  const { sections, activeSectionId } = usePageTitleContext();
  return { sections, activeSectionId };
};

/** Read the current address-bar filter facet — used by the address bar. */
export const usePageFilterState = (): PageFilter | null => usePageTitleContext().filter;

/**
 * Register an address-bar filter facet for the current page.
 *
 * The page passes its filter options, the active value, and a select
 * handler; the address bar renders this as a `#facet` crumb + dropdown.
 * The facet clears automatically when the page unmounts.
 */
export const usePageFilter = (filter: PageFilter | null): void => {
  const { setFilter } = usePageTitleContext();

  useEffect(() => {
    setFilter(filter);
    return () => setFilter(null);
  }, [filter, setFilter]);
};

/**
 * Register a detail page's title with the address bar.
 *
 * Call from a content detail page with the resolved title (it may be
 * null while the content is still loading). The title is cleared
 * automatically when the page unmounts, so list pages stay clean.
 */
export const useSetPageTitle = (title: string | null | undefined): void => {
  const { setTitle } = usePageTitleContext();
  const set = useCallback((t: string | null) => setTitle(t), [setTitle]);

  useEffect(() => {
    set(title ?? null);
    return () => set(null);
  }, [title, set]);
};

/**
 * Register a page's in-page sections with the address bar and track
 * which one is in view.
 *
 * The page passes its ordered sections (id + title); this hook wires an
 * IntersectionObserver over their DOM elements and feeds the active
 * section to the address bar, which renders it as a `#anchor` crumb.
 * Sections clear automatically on unmount.
 */
export const usePageSections = (sections: PageSection[]): void => {
  const { setSections, setActiveSectionId } = usePageTitleContext();

  // A stable key so the effect re-runs only when the section set changes.
  const key = useMemo(() => sections.map((s) => s.id).join('|'), [sections]);

  useEffect(() => {
    setSections(sections);

    if (sections.length === 0) {
      setActiveSectionId(null);
      return () => {
        setSections([]);
        setActiveSectionId(null);
      };
    }

    // Content scrolls inside the #browser-window container (see
    // MainLayout); the observer must watch against that, not the viewport.
    const root = document.getElementById('browser-window');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSectionId(entry.target.id);
        });
      },
      { root, rootMargin: '-20% 0% -70% 0%', threshold: 0.1 },
    );

    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => {
      observer.disconnect();
      setSections([]);
      setActiveSectionId(null);
    };
    // `key` captures changes to the section set; `sections` is intentionally
    // not a dep to avoid re-subscribing on every identity-changed array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setSections, setActiveSectionId]);
};
