import React from 'react';
import { Link as RouterLink } from 'react-router-dom';

/* =========================
   Utilities
   ========================= */

const isAbsoluteUrl = (url: string) => /^https?:\/\//i.test(url);
const isWwwUrl = (url: string) => /^www\./i.test(url);
const isMailto = (url: string) => /^mailto:/i.test(url);
const isTel = (url: string) => /^tel:/i.test(url);
const isHash = (url: string) => /^#/.test(url);
const isRelativePath = (url: string) => /^(\.|\.{2}|\/)/.test(url);

const normalizeBareUrl = (url: string) =>
  isWwwUrl(url) ? `https://${url}` : url;

/** 安全链接：站内走 RouterLink，外链走 a 标签 */
const SafeLink: React.FC<{
  to: string;
  children: React.ReactNode;
  className?: string;
}> = ({ to, children, className }) => {
  const baseClass =
    className ??
    'text-[var(--color-primary,#0066FF)] underline underline-offset-2 hover:opacity-90 focus-visible:outline-none';

  // 外链 / 邮件 / 电话
  if (isAbsoluteUrl(to) || isWwwUrl(to) || isMailto(to) || isTel(to)) {
    const href = normalizeBareUrl(to);
    return (
      <a
        href={href}
        target={isMailto(to) || isTel(to) ? undefined : '_blank'}
        rel={isMailto(to) || isTel(to) ? undefined : 'noopener noreferrer'}
        className={baseClass}
      >
        {children}
      </a>
    );
  }

  // 站内路由或 hash
  if (isRelativePath(to) || isHash(to)) {
    return (
      <RouterLink to={to} className={baseClass}>
        {children}
      </RouterLink>
    );
  }

  // 兜底：按外链处理
  return (
    <a
      href={to}
      target="_blank"
      rel="noopener noreferrer"
      className={baseClass}
    >
      {children}
    </a>
  );
};

/* =========================
   File Tree Detector & Renderer
   ========================= */

export const isFileTreeStructure = (text: string): boolean => {
  if (!text) return false;
  const treeChars = ['├─', '├──', '└─', '└──', '│', '┌─', '┐', '┘', '└', '├', '┤'];
  return (
    treeChars.some((c) => text.includes(c)) ||
    text.split('\n').some((line) => /^[\s]*[├└│┌┐┘┤]/.test(line))
  );
};

/** 使用 <pre><code><span>，避免在 <pre> 内部塞块级元素 */
export const FileTreeRenderer: React.FC<{ content: string }> = ({ content }) => {
  const lines = (content ?? '').split('\n');
  return (
    <div className="my-8 relative">
      <div className="bg-theme-surface-elevated rounded-xl overflow-hidden shadow-medium border border-theme-card-border">
        <div className="flex items-center gap-3 px-6 py-4 bg-theme-surface-secondary border-b border-theme-card-border">
          <div className="inline-flex items-center px-3 py-1 bg-theme-primary/10 rounded-full">
            <span className="text-xs font-semibold text-theme-primary uppercase tracking-wider font-mono">
              FILE STRUCTURE
            </span>
          </div>
        </div>

        <div className="p-6">
          <pre
            className="font-mono text-sm leading-relaxed text-theme-primary overflow-x-auto"
            style={{
              fontFamily:
                'JetBrains Mono, Monaco, Menlo, "Ubuntu Mono", Consolas, monospace',
              lineHeight: '1.6',
              whiteSpace: 'pre',
              margin: 0,
            }}
          >
            <code>
              {lines.map((line, i) => (
                <span
                  key={i}
                  className="block px-2 py-1 -mx-2 rounded hover:bg-theme-surface/20"
                >
                  {line || '\u00A0'}
                </span>
              ))}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
};

/* =========================
   Markdown Blocks (简易块级解析)
   ========================= */

interface MarkdownBlock {
  type: 'paragraph' | 'list' | 'divider' | 'blockquote' | 'header';
  content: string | string[];
  level?: number;
  ordered?: boolean;
}

export const parseMarkdownBlocks = (text: string): MarkdownBlock[] => {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split('\n');
  const blocks: MarkdownBlock[] = [];
  let current: MarkdownBlock | null = null;
  let listItems: string[] = [];

  const flushList = () => {
    if (current?.type === 'list' && listItems.length) {
      blocks.push({ ...current, content: [...listItems] });
    }
    current = null;
    listItems = [];
  };

  for (const raw of lines) {
    const line = raw ?? '';
    const t = line.trim();

    // 空行：结束列表
    if (!t) {
      flushList();
      continue;
    }

    // Divider
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flushList();
      blocks.push({ type: 'divider', content: '' });
      continue;
    }

    // Header
    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushList();
      blocks.push({ type: 'header', content: h[2], level: h[1].length });
      continue;
    }

    // Blockquote
    const q = t.match(/^>\s?(.*)$/);
    if (q) {
      flushList();
      blocks.push({ type: 'blockquote', content: q[1] });
      continue;
    }

    // Unordered list
    const ul = t.match(/^[-*+]\s+(.*)$/);
    if (ul) {
      if (!current || current.type !== 'list' || current.ordered) {
        flushList();
        current = { type: 'list', content: [], ordered: false };
      }
      listItems.push(ul[1]);
      continue;
    }

    // Ordered list
    const ol = t.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      if (!current || current.type !== 'list' || !current.ordered) {
        flushList();
        current = { type: 'list', content: [], ordered: true };
      }
      listItems.push(ol[1]);
      continue;
    }

    // 普通段落
    flushList();
    blocks.push({ type: 'paragraph', content: t });
  }

  flushList();
  return blocks;
};

/* =========================
   Inline Markdown Renderer
   - 先解析 [text](url)，再解析裸链接
   - 处理 **bold** *italic* `code` ~~del~~ 与换行
   ========================= */

type Token =
  | { type: 'text'; value: string }
  | { type: 'link'; text: string; href: string }
  | { type: 'br' }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'strike'; value: string }
  | { type: 'code'; value: string }
  | { type: 'autolink'; href: string; label: string };

const splitByLineBreaks = (s: string): (string | '\n')[] =>
  s.split(/\n/).flatMap((part, i, arr) =>
    i < arr.length - 1 ? [part, '\n' as const] : [part]
  );

/** 基础 tokenizer：链接优先，避免被其它样式截断 */
const tokenize = (input: string): Token[] => {
  if (!input) return [];

  const tokens: Token[] = [];

  // 先把换行拆开，保持顺序
  const parts = splitByLineBreaks(input);

  for (const part of parts) {
    if (part === '\n') {
      tokens.push({ type: 'br' });
      continue;
    }

    let text = part as string;
    if (!text) continue;

    // 1) 先匹配 [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let last = 0;
    let match: RegExpExecArray | null;

    const interim: (string | Token)[] = [];
    while ((match = linkRegex.exec(text)) !== null) {
      if (match.index > last) interim.push(text.slice(last, match.index));
      interim.push({ type: 'link', text: match[1], href: match[2] });
      last = match.index + match[0].length;
    }
    if (last < text.length) interim.push(text.slice(last));

    // 2) 在“非链接”文本里做裸链接自动识别
    const autoUrl = /(https?:\/\/[^\s<]+|www\.[^\s<]+|mailto:[^\s<]+|tel:[^\s<]+)/g;

    const expandAuto = (chunk: string | Token) => {
      if (typeof chunk !== 'string') return [chunk];

      const out: (string | Token)[] = [];
      let l = 0;
      let m: RegExpExecArray | null;
      while ((m = autoUrl.exec(chunk)) !== null) {
        if (m.index > l) out.push(chunk.slice(l, m.index));
        const href = normalizeBareUrl(m[0]);
        out.push({ type: 'autolink', href, label: m[0] });
        l = m.index + m[0].length;
      }
      if (l < chunk.length) out.push(chunk.slice(l));
      return out;
    };

    const withAuto = interim.flatMap(expandAuto);

    // 3) 解析强调/代码/删除线（对 string 片段）
    const pushStyled = (frag: string | Token) => {
      if (typeof frag !== 'string') {
        tokens.push(frag);
        return;
      }
      if (!frag) return;

      // 顺序：代码块优先，避免内部星号被吃
      const patterns: Array<{
        re: RegExp;
        type: Token['type'];
      }> = [
        { re: /`([^`]+)`/g, type: 'code' },
        { re: /\*\*([^*]+)\*\*/g, type: 'bold' },
        { re: /\*([^*]+)\*/g, type: 'italic' },
        { re: /~~([^~]+)~~/g, type: 'strike' },
      ];

      let buffer = frag;
      for (const { re, type } of patterns) {
        const parts: (string | Token)[] = [];
        let i = 0;
        let mm: RegExpExecArray | null;
        while ((mm = re.exec(buffer)) !== null) {
          if (mm.index > i) parts.push(buffer.slice(i, mm.index));
          parts.push({ type: type as any, value: mm[1] });
          i = mm.index + mm[0].length;
        }
        if (i < buffer.length) parts.push(buffer.slice(i));
        buffer = parts
          .map((p) => (typeof p === 'string' ? p : '\0')) // 标记 Token 占位，下一轮仍要处理字符串
          .join('');
        // 立即把 Token 与字符串重新合并为数组，供下一轮继续解析
        const merged: (string | Token)[] = [];
        for (const p of parts) {
          if (typeof p === 'string') {
            merged.push(p);
          } else {
            merged.push(p);
          }
        }
        // 下一轮解析只作用在 string；这里直接把 merged 再拼回字符串与 Token 的混合结构是复杂的
        // 简化：如果还没到最后一个 pattern，就把 Token 替换成不可分割的标记字符拼回，再下一轮统一再分
        // 为了避免复杂性，这里采取“逐 pattern 输出”的方式：
        if (type !== 'strike') {
          // 非最后一轮：把 merged 重新折叠为字符串（Token 用特殊符号占位），继续下一个 pattern
          const rebuilt: string[] = [];
          for (const item of parts) {
            if (typeof item === 'string') rebuilt.push(item);
            else rebuilt.push('\0'); // 次轮保留 Token 占位
          }
          buffer = rebuilt.join('');
        } else {
          // 最后一轮：不再继续嵌套解析，改用一次性拆分写入 tokens
          // 重新跑一遍 patterns，但这次直接落 tokens，避免额外复杂度
          const finalParts: (string | Token)[] = [];
          let s = frag;
          // 用固定顺序再次切一次（终局切分）
          const finalRe =
            /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|~~([^~]+)~~/g;
          let lastIdx = 0;
          let mm2: RegExpExecArray | null;
          while ((mm2 = finalRe.exec(s)) !== null) {
            if (mm2.index > lastIdx) finalParts.push(s.slice(lastIdx, mm2.index));
            if (mm2[1]) finalParts.push({ type: 'code', value: mm2[1] });
            else if (mm2[2]) finalParts.push({ type: 'bold', value: mm2[2] });
            else if (mm2[3]) finalParts.push({ type: 'italic', value: mm2[3] });
            else if (mm2[4]) finalParts.push({ type: 'strike', value: mm2[4] });
            lastIdx = mm2.index + mm2[0].length;
          }
          if (lastIdx < s.length) finalParts.push(s.slice(lastIdx));
          finalParts.forEach((pp) => {
            if (typeof pp === 'string') tokens.push({ type: 'text', value: pp });
            else tokens.push(pp as Token);
          });
          return;
        }
      }

      // 如果走不到“最后一轮输出”，说明没有命中任何样式，按文本输出
      tokens.push({ type: 'text', value: frag });
    };

    withAuto.forEach(pushStyled);
  }

  return tokens;
};

export const renderInlineMarkdown = (text: string): React.ReactNode => {
  const tokens = tokenize(text);
  if (tokens.length === 0) return text;

  return tokens.map((tk, i) => {
    switch (tk.type) {
      case 'br':
        return <br key={`br-${i}`} />;
      case 'link':
        return (
          <SafeLink key={`lnk-${i}`} to={tk.href}>
            {tk.text}
          </SafeLink>
        );
      case 'autolink':
        return (
          <SafeLink key={`auto-${i}`} to={tk.href}>
            {tk.label}
          </SafeLink>
        );
      case 'bold':
        return <strong key={`b-${i}`} className="font-semibold">{tk.value}</strong>;
      case 'italic':
        return <em key={`i-${i}`}>{tk.value}</em>;
      case 'strike':
        return <del key={`s-${i}`}>{tk.value}</del>;
      case 'code':
        return (
          <code
            key={`c-${i}`}
            className="rounded-ds-sm bg-ds-surface-2 px-1.5 py-0.5 font-mono text-[0.9em] text-ds-primary"
          >
            {tk.value}
          </code>
        );
      case 'text':
      default:
        return <span key={`t-${i}`}>{tk.value}</span>;
    }
  });
};

/* =========================
   Block Renderer
   ========================= */

export const renderMarkdownBlock = (
  block: MarkdownBlock,
  index: number
): React.ReactNode => {
  const key = `block-${index}`;

  switch (block.type) {
    case 'header': {
      const lvl = Math.min(block.level || 1, 6);
      const HeaderTag = `h${lvl}` as keyof JSX.IntrinsicElements;
      const size =
        {
          1: '2rem',
          2: '1.5rem',
          3: '1.25rem',
          4: '1.125rem',
          5: '1rem',
          6: '0.875rem',
        }[lvl] || '1rem';

      return React.createElement(
        HeaderTag,
        {
          key,
          className:
            'mt-6 mb-4 leading-snug text-[var(--color-textPrimary,#1f2937)]',
          style: { fontSize: size, fontWeight: lvl === 1 ? 700 : lvl === 2 ? 600 : 500 },
        },
        renderInlineMarkdown(block.content as string)
      );
    }

    case 'divider':
      return <hr key={key} className="my-8 border-0 border-t border-ds-border" />;

    case 'blockquote':
      return (
        <blockquote
          key={key}
          className="my-4 rounded-lg"
          style={{
            borderLeft: '4px solid var(--color-primary, #0066FF)',
            background: 'var(--color-surface, #f9fafb)',
            padding: '1rem',
          }}
        >
          <span className="italic text-ds-fg-muted">
            {renderInlineMarkdown(block.content as string)}
          </span>
        </blockquote>
      );

    case 'list': {
      const items = (block.content as string[]).map((item, idx) => (
        <li key={`li-${idx}`} className="mb-1">
          {renderInlineMarkdown(item)}
        </li>
      ));

      const baseListClass =
        'my-4 pl-6 text-[var(--color-textPrimary,#1f2937)]';
      if (block.ordered) {
        return (
          <ol key={key} className={`${baseListClass} list-decimal`}>
            {items}
          </ol>
        );
      }
      return (
        <ul
          key={key}
          className={`${baseListClass} list-disc`}
          // 让项目点在深色下也有对比
          style={{ '--tw-prose-bullets': 'currentColor' } as React.CSSProperties}
        >
          {items}
        </ul>
      );
    }

    case 'paragraph':
    default:
      return (
        <p
          key={key}
          className="my-4 leading-7"
          style={{ color: 'var(--color-textPrimary,#1f2937)' }}
        >
          {renderInlineMarkdown(block.content as string)}
        </p>
      );
  }
};

/* =========================
   Full Markdown Renderer
   ========================= */

export const renderFullMarkdown = (text: string): React.ReactNode => {
  if (!text || typeof text !== 'string') return text;
  const blocks = parseMarkdownBlocks(text);
  if (blocks.length === 0) return renderInlineMarkdown(text);
  return <div>{blocks.map((b, i) => renderMarkdownBlock(b, i))}</div>;
};

/* =========================
   Plain text line breaks
   ========================= */

export const processPlainTextWithBreaks = (text: string): React.ReactNode => {
  if (!text || typeof text !== 'string') return text;
  const parts = text.split('\n');
  if (parts.length === 1) return text;
  return parts.flatMap((p, i) => (i === 0 ? [p] : [<br key={`br-${i}`} />, p]));
};

/* =========================
   Markdown quick check
   ========================= */

export const hasCompleteMarkdownFormatting = (text: string): boolean => {
  if (!text || typeof text !== 'string') return false;
  const patterns = [
    /\*\*.*?\*\*/,
    /\*.*?\*/,
    /`[^`]+`/,
    /\[.*?\]\(.*?\)/,
    /^#{1,6}\s+/m,
    /^[-*+]\s+/m,
    /^\d+\.\s+/m,
    /^>\s+/m,
    /^(-{3,}|\*{3,}|_{3,})$/m,
    /~~.*?~~/,
  ];
  return patterns.some((re) => re.test(text));
};
