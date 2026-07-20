import { BlogContent } from '../components/BlogStack/types/blog';

// Generate unique ID using browser's crypto API
const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'id-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
};

/**
 * Convert raw backend content to parsed BlogContent array
 */
export const processRawContent = (rawContent: any[]): BlogContent[] => {
  if (!Array.isArray(rawContent)) {
    return [];
  }

  const processedContent: BlogContent[] = [];

  rawContent.forEach((item: any) => {
    if (item.type === 'text' && item.content) {
      // Use the academic markdown parser for better structure parsing
      const parsed = parseAcademicMarkdown(item.content);
      processedContent.push(...parsed);
    } else {
      // Keep other content types as-is (already formatted)
      processedContent.push({
        type: item.type || 'text',
        content: item.content || '',
        caption: item.caption,
        language: item.language,
        annotation: item.annotation,
        id: item.id || generateId()
      });
    }
  });

  return processedContent;
};

/**
 * Enhanced markdown parser with support for mathematical expressions and academic formatting
 */
export const parseAcademicMarkdown = (markdownText: string): BlogContent[] => {
  if (!markdownText || typeof markdownText !== 'string') {
    return [];
  }

  const content: BlogContent[] = [];
  const lines = markdownText.split('\n');
  let currentParagraph = '';
  let inCodeBlock = false;
  let codeContent = '';
  let codeLanguage = '';
  let inQuote = false;
  let quoteContent = '';
  let listContent = '';

  const pushParagraph = () => {
    if (currentParagraph.trim()) {
      content.push({
        type: 'text',
        content: currentParagraph.trim(),
        id: generateId()
      });
      currentParagraph = '';
    }
  };

  const pushCodeBlock = () => {
    if (codeContent.trim()) {
      content.push({
        type: 'code',
        content: codeContent.trim(),
        language: codeLanguage || 'text',
        id: generateId()
      });
      codeContent = '';
      codeLanguage = '';
    }
  };

  const pushQuote = () => {
    if (quoteContent.trim()) {
      content.push({
        type: 'quote',
        content: quoteContent.trim(),
        id: generateId()
      });
      quoteContent = '';
    }
  };

  const pushList = () => {
    if (listContent.trim()) {
      content.push({
        type: 'text',
        content: listContent.trimEnd(),
        id: generateId()
      });
      listContent = '';
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Handle code blocks
    if (trimmedLine.startsWith('```')) {
      if (!inCodeBlock) {
        // Start of code block
        pushParagraph();
        pushQuote();
        inCodeBlock = true;
        inQuote = false;
        codeLanguage = trimmedLine.substring(3).trim();
      } else {
        // End of code block
        pushCodeBlock();
        inCodeBlock = false;
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent += line + '\n';
      continue;
    }

    // A Markdown list is one structural block. Keep its original line
    // boundaries—including indented continuation and nested-list lines—so
    // the renderer receives valid Markdown instead of a reconstructed
    // single-line approximation.
    const isListItem = /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line);
    const isListContinuation = Boolean(listContent) && /^\s{2,}\S/.test(line);
    if (listContent && trimmedLine === '') {
      pushList();
      continue;
    }
    if (isListItem || isListContinuation) {
      pushParagraph();
      pushQuote();
      inQuote = false;
      listContent += `${listContent ? '\n' : ''}${line}`;
      continue;
    }
    if (listContent) pushList();

    // Handle block quotes
    if (trimmedLine.startsWith('>')) {
      if (!inQuote) {
        pushParagraph();
        inQuote = true;
      }
      quoteContent += trimmedLine.substring(1).trim() + ' ';
      continue;
    } else if (inQuote && trimmedLine === '') {
      // Continue quote on empty line
      continue;
    } else if (inQuote) {
      // End of quote block
      pushQuote();
      inQuote = false;
    }

    // Handle images
    const imageMatch = line.match(/!\[(.*?)\]\((.*?)\)/);
    if (imageMatch) {
      pushParagraph();
      const [, alt, src] = imageMatch;
      content.push({
        type: 'image',
        content: src,
        caption: alt,
        id: generateId()
      });
      continue;
    }

    // Handle empty lines
    if (trimmedLine === '') {
      if (currentParagraph.trim()) {
        pushParagraph();
      }
      continue;
    }

    // Handle headers - convert to heading with proper level
    const headingMatch = trimmedLine.match(/^(#+)\s+(.*)$/);
    if (headingMatch) {
      pushParagraph();
      const [, hashes, headingText] = headingMatch;
      content.push({
        type: 'heading',
        content: headingText.trim(),
        level: Math.min(hashes.length, 6), // Limit to h6
        id: generateId()
      });
      continue;
    }

    // Handle mathematical expressions or formulas (wrapped in $$ or marked with "Formula:")
    if (trimmedLine.includes('$$') || trimmedLine.match(/^(Formula|Equation):/i)) {
      pushParagraph();
      content.push({
        type: 'text',
        content: trimmedLine,
        annotation: 'Mathematical content - may contain LaTeX expressions',
        id: generateId()
      });
      continue;
    }

    // Regular text lines
    if (currentParagraph) {
      currentParagraph += ' ' + line;
    } else {
      currentParagraph = line;
    }
  }

  // Push any remaining content
  pushParagraph();
  pushCodeBlock();
  pushQuote();
  pushList();

  return content;
};

/**
 * General Markdown parsing uses the same canonical state machine as article
 * parsing. Keeping one parser prevents block semantics from drifting between
 * callers.
 */
export const parseMarkdownToBlogContent = parseAcademicMarkdown;
