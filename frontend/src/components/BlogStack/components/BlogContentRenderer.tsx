import React, { useMemo } from 'react';
import { BlogContent, UserAnnotation, SelectedText } from '../types/blog';
import {
  TextContent,
  QuoteContent,
  ImageContent,
  VideoContent,
  CodeContent,
  HeadingContent,
} from './BlogContent';
import TableBlock from './BlogContent/TableBlock';
import Markdown from '../../ui/Markdown';

interface BlogContentRendererProps {
  content: BlogContent[];
  isWideScreen: boolean;
  readOnly?: boolean;
  documentTitle?: string;
  userAnnotations?: Record<string, UserAnnotation>;
  annotations?: Record<string, boolean>;
  showAnnotationForm?: string | null;
  newAnnotationText?: string;
  selectedText?: SelectedText | null;
  highlightedAnnotation?: string | null;
  onTextSelection?: () => void;
  onToggleAnnotation?: (contentId: string) => void;
  onSetShowAnnotationForm?: (contentId: string | null) => void;
  onSetNewAnnotationText?: (text: string) => void;
  onAddUserAnnotation?: (contentId: string) => void;
  onRemoveUserAnnotation?: (annotationId: string) => void;
  onHighlightAnnotation?: (annotationId: string) => void;
  onCancelAnnotation?: () => void;
}

const EMPTY_ANNOTATIONS = {};
const NOOP = () => {};

/** 更可靠地判断“像 Markdown 的文本块”，但避免 fenced code */
const looksLikeLooseMarkdown = (text: string): boolean => {
  if (!text) return false;
  if (/```/.test(text)) return false; // fenced code 优先
  const mdSignals =
    /^(#{1,6})\s/m.test(text) || // 标题
    /^[-*+]\s/m.test(text) || // 无序列表
    /^\d+\.\s/m.test(text) || // 有序列表
    /^>\s/m.test(text) || // 引用
    /\[[^\]]+\]\([^)]+\)/.test(text) || // 链接
    /^(-{3,}|\*{3,}|_{3,})$/m.test(text); // 分割线
  return mdSignals;
};

/** Detect GFM table (header row with pipes + alignment row) */
const hasGfmTable = (s: string = ''): boolean => {
  if (!s) return false;
  const lineHasPipes = /^\s*\|.*\|\s*$/m.test(s);
  const alignRow =
    /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/m.test(s);
  // Also consider collapsed tables where rows are separated by '||'
  const collapsedRowTight = /\|\|/.test(s);
  // Variant: rows separated by " | | " (spaces around the divider)
  const collapsedRowSpaced = /\s\|\s\|/.test(s);
  const collapsedRow = (collapsedRowTight || collapsedRowSpaced) && /\|/.test(s);
  return (lineHasPipes && alignRow) || collapsedRow;
};

/** Expand collapsed table rows delimited by '||' into real newlines */
const expandCollapsedTableRows = (s: string = ''): string => {
  if (!s) return s;
  if (/\|\|/.test(s)) {
    let after = s.replace(/\|\|\s*/g, '\n');
    // Also support the spaced variant: " | | "
    after = after.replace(/\s\|\s\|\s*/g, '\n');
    return after;
  }
  // If it doesn't contain tight "||", still try spaced variant alone
  if (/\s\|\s\|/.test(s)) {
    return s.replace(/\s\|\s\|\s*/g, '\n');
  }
  return s;
};

/** After expansion, coerce rows to valid GFM by adding missing leading/trailing pipes */
const coerceGfmTableFormat = (s: string = ''): string => {
  if (!s) return s;
  // Ensure a newline after alignment row if the next row starts immediately with a pipe
  let pre = s.replace(
    /(\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?)\s*\|\s*/g,
    '$1\n| '
  );
  const lines = pre.split(/\n/);
  const coerced = lines.map((raw) => {
    let line = raw.replace(/^\s+/, ''); // left trim spaces but keep leading '|'
    // Leave empty lines untouched
    if (!line) return line;
    // If alignment row, keep as is
    if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)) return line.trim();
    const hasPipe = /\|/.test(line);
    const looksLikeRow = hasPipe && /\|/.test(line.replace(/^\|/, ''));
    if (!looksLikeRow) return line;
    // Ensure starting and ending pipes for non-header/data rows
    if (!/^\|/.test(line)) line = `| ${line}`;
    if (!/\|\s*$/.test(line)) line = `${line} |`;
    return line;
  });
  return coerced.join('\n');
};

type CanonicalType = NonNullable<BlogContent['type']>;

const normalizeType = (t?: string): CanonicalType => {
  const type = (t || 'text').toLowerCase().trim();
  if (['blockquote', 'quote'].includes(type)) return 'quote';
  if (['img', 'image', 'picture', 'gif'].includes(type)) return 'image';
  if (['video', 'youtube', 'vimeo', 'bilibili'].includes(type)) return 'video';
  if (['code', 'codeblock', 'pre'].includes(type)) return 'code';
  if (['heading', 'title', 'h', 'h0', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(type)) return 'heading';
  if (['md', 'markdown'].includes(type)) return 'markdown';
  if (['text', 'paragraph', 'p'].includes(type)) return 'text';
  return 'text';
};

const coerceHeadingLevel = (rawType: string | undefined, level?: number): number => {
  // 如果传入了 hN 之类的
  if (rawType && /^h[1-6]$/i.test(rawType)) {
    const n = parseInt(rawType.slice(1), 10);
    return Math.min(6, Math.max(1, n));
  }
  // title 默认 H1
  if ((rawType || '').toLowerCase() === 'title' && !level) return 1;
  const n = typeof level === 'number' ? level : 2;
  return Math.min(6, Math.max(1, n));
};

/** 轻量清洗：把“看起来像列表/任务清单”的单行文本转成更正宗的 Markdown */
const normalizeInlineMarkdownHeuristics = (raw: string): string => {
  let s = raw ?? '';
  if (!s) return s;

  // 把行首的可视化圆点“• ”转成 "- "
  if (s.includes('\n') && /(^|\n)\s*•\s+/.test(s)) {
    s = s.replace(/(^|\n)\s*•\s+/g, '$1- ');
  }

  // 单行任务清单：" - [ ] a - [x] b" -> 多行
  if (!s.includes('\n') && /\s-\s(?=\[[ xX]\]\s)/.test(s)) {
    s = s.replace(/\s-\s(?=\[[ xX]\]\s)/g, '\n- ');
    if (!/^\s*[-*+]\s/.test(s)) s = `- ${s}`;
  }

  // 单行无序列表："A - B - C" -> 多行
  if (!s.includes('\n')) {
    const parts = s.split(/\s-\s(?!\[[ xX]\]\s)/);
    if (parts.length >= 3) {
      s = parts.map((p) => `- ${p.trim().replace(/^[•*+-]\s*/, '')}`).join('\n');
    }
  }

  // 单行有序列表："1. A 2. B" / "1) A 2) B" / "1、A 2、B" -> 多行
  // 修复原实现中的多余括号
  if (
    !s.includes('\n') &&
    /^\s*\d+[.)、]\s/.test(s) &&
    /\s(?=\d+[.)、]\s)/.test(s) === false // 如果原串没有清晰分隔，下面再尝试强制换行
  ) {
    s = s.replace(/\s(?=\d+[.)、]\s)/g, '\n');
  }

  return s;
};

type PreparedItem = BlogContent & {
  id: string;
  type: CanonicalType;
  level?: number;
  kindIndex: number; // 稳定的“同类内索引”，用于 drop cap / 布局
};

export const BlogContentRenderer: React.FC<BlogContentRendererProps> = (props) => {
  const {
    content,
    isWideScreen,
    readOnly = false,
    documentTitle,
    userAnnotations = EMPTY_ANNOTATIONS,
    annotations = EMPTY_ANNOTATIONS,
    showAnnotationForm = null,
    newAnnotationText = '',
    selectedText = null,
    highlightedAnnotation = null,
    onTextSelection = NOOP,
    onToggleAnnotation = NOOP,
    onSetShowAnnotationForm = NOOP,
    onSetNewAnnotationText = NOOP,
    onAddUserAnnotation = NOOP,
    onRemoveUserAnnotation = NOOP,
    onHighlightAnnotation = NOOP,
    onCancelAnnotation = NOOP,
  } = props;

  // 预处理：归一化 + 计算稳定 kindIndex
  const prepared = useMemo<PreparedItem[]>(() => {
    const counters: Record<CanonicalType, number> = {
      text: 0,
      quote: 0,
      image: 0,
      video: 0,
      code: 0,
      heading: 0,
      markdown: 0,
    };

    return (content || []).map((item, idx) => {
      const canonType = normalizeType(item.type as unknown as string);
      const id = item.id || `content-${idx}`;
      const base: PreparedItem = {
        ...(item as BlogContent),
        id,
        type: canonType,
        kindIndex: counters[canonType]++,
      };

      if (canonType === 'heading') {
        base.level = coerceHeadingLevel(item.type as string | undefined, item.level);
      }
      return base;
    });
  }, [content]);

  const renderMarkdown = (item: PreparedItem) => {
    const shouldTweak = item.content && !/```/.test(item.content);
    let md = shouldTweak ? normalizeInlineMarkdownHeuristics(item.content) : (item.content ?? '');
    if (hasGfmTable(md)) {
      md = expandCollapsedTableRows(md);
      md = coerceGfmTableFormat(md);
    }

    return (
      <Markdown
        key={item.id}
        className="max-w-none text-theme-text-primary"
        documentTitle={documentTitle}
      >
        {md}
      </Markdown>
    );
  };

  const renderContent = (item: PreparedItem) => {
    // Programmatic table support via metadata
    const tableMeta = (item.metadata as any)?.table;
    if (
      tableMeta &&
      Array.isArray(tableMeta.header) &&
      Array.isArray(tableMeta.rows)
    ) {
      return (
        <TableBlock
          key={item.id}
          header={tableMeta.header as string[]}
          rows={tableMeta.rows as string[][]}
        />
      );
    }

    switch (item.type) {
      case 'text':
        {
          const raw = item.content || '';
          if (hasGfmTable(raw)) {
            return renderMarkdown(item);
          }
        }
        return (
          <TextContent
            key={item.id}
            item={item}
            index={item.kindIndex}
            isWideScreen={isWideScreen}
            interactiveAnnotations={!readOnly}
            userAnnotations={userAnnotations}
            annotations={annotations}
            showAnnotationForm={showAnnotationForm}
            newAnnotationText={newAnnotationText}
            selectedText={selectedText}
            highlightedAnnotation={highlightedAnnotation}
            onTextSelection={onTextSelection}
            onToggleAnnotation={onToggleAnnotation}
            onSetShowAnnotationForm={onSetShowAnnotationForm}
            onSetNewAnnotationText={onSetNewAnnotationText}
            onAddUserAnnotation={onAddUserAnnotation}
            onRemoveUserAnnotation={onRemoveUserAnnotation}
            onHighlightAnnotation={onHighlightAnnotation}
            onCancelAnnotation={onCancelAnnotation}
          />
        );

      case 'quote':
        return <QuoteContent key={item.id} item={item} />;

      case 'image':
        return (
          <ImageContent
            key={item.id}
            item={item}
            index={item.kindIndex}
            isWideScreen={isWideScreen}
          />
        );

      case 'video':
        return (
          <VideoContent
            key={item.id}
            item={item}
            index={item.kindIndex}
            isWideScreen={isWideScreen}
          />
        );

      case 'code': {
        const lang = (item as any).language as string | undefined;
        // 若 language 为空且文本像 Markdown，则把高亮语言强制为 markdown
        const coerceToMd =
          (!lang || /^text$/i.test(lang)) &&
          looksLikeLooseMarkdown(item.content || '');
        const codeItem = coerceToMd ? { ...item, language: 'markdown' as const } : item;

        return (
          <CodeContent
            key={item.id}
            item={codeItem as any}
            index={item.kindIndex}
            isWideScreen={isWideScreen}
          />
        );
      }

      case 'heading':
        return (
          <HeadingContent
            key={item.id}
            item={item}
            index={item.kindIndex}
            isWideScreen={isWideScreen}
          />
        );

      case 'markdown':
        return renderMarkdown(item);

      default:
        return null;
    }
  };

  return <div className="mb-0">{prepared.map(renderContent)}</div>;
};
