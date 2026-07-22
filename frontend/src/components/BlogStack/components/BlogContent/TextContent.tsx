import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Quote, X, MessageCircle } from 'lucide-react';
import { BlogContent, UserAnnotation, SelectedText } from '../../types/blog';
import { useTheme } from '../../../ThemeContext';
import { useLanguage } from '../../../LanguageContext';
import { processPlainTextWithBreaks, isFileTreeStructure, FileTreeRenderer } from '../../../../utils/fullMarkdownRenderer';
import Markdown from '../../../ui/Markdown';

interface TextContentProps {
  item: BlogContent;
  index: number;
  isWideScreen: boolean;
  interactiveAnnotations: boolean;
  userAnnotations: Record<string, UserAnnotation>;
  annotations: Record<string, boolean>;
  showAnnotationForm: string | null;
  newAnnotationText: string;
  selectedText: SelectedText | null;
  highlightedAnnotation: string | null;
  onTextSelection: () => void;
  onToggleAnnotation: (contentId: string) => void;
  onSetShowAnnotationForm: (contentId: string | null) => void;
  onSetNewAnnotationText: (text: string) => void;
  onAddUserAnnotation: (contentId: string) => void;
  onRemoveUserAnnotation: (annotationId: string) => void;
  onHighlightAnnotation: (annotationId: string) => void;
  onCancelAnnotation: () => void;
}

export const TextContent: React.FC<TextContentProps> = ({
  item,
  index,
  isWideScreen,
  interactiveAnnotations,
  userAnnotations,
  annotations,
  showAnnotationForm,
  newAnnotationText,
  selectedText,
  highlightedAnnotation,
  onTextSelection,
  onToggleAnnotation,
  onSetNewAnnotationText,
  onAddUserAnnotation,
  onRemoveUserAnnotation,
  onHighlightAnnotation,
  onCancelAnnotation
}) => {
  const { colors } = useTheme();
  const { language } = useLanguage();
  
  // State for managing clicked annotation (persistent display)
  const [clickedAnnotation, setClickedAnnotation] = React.useState<string | null>(null);
  const [hoveredAnnotation, setHoveredAnnotation] = React.useState<string | null>(null);

  // Check if this is the first text content (index 0)
  const isFirstParagraph = index === 0;

  // Get annotations for this content
  const contentAnnotations = Object.entries(userAnnotations).filter(
    ([annotationId]) => annotationId.startsWith(item.id)
  );

  // Function to render text with annotations highlighted
  const renderTextWithAnnotations = (text: string, contentId: string) => {
    const relevantAnnotations = Object.entries(userAnnotations).filter(
      ([annotationId]) => annotationId.startsWith(contentId)
    );

    // Process markdown formatting first
    let processedText = processMarkdownText(text);
    
    // Treat any React element (including Vditor output) as block content
    const hasBlockElements = React.isValidElement(processedText);

    if (relevantAnnotations.length === 0) {
      const result = isFirstParagraph && (typeof processedText === 'string' || React.isValidElement(processedText))
        ? renderFirstLetterDropCap(processedText)
        : processedText;
      return { content: result, hasBlockElements };
    }

    // Sort annotations by start offset to avoid overlap issues
    const sortedAnnotations = relevantAnnotations.sort(
      ([, a], [, b]) => a.startOffset - b.startOffset
    );

    // Remove overlapping annotations (keep first one in case of overlap)
    const nonOverlappingAnnotations: typeof sortedAnnotations = [];
    let lastEndOffset = -1;

    sortedAnnotations.forEach(([annotationId, annotation]) => {
      if (annotation.startOffset >= lastEndOffset) {
        nonOverlappingAnnotations.push([annotationId, annotation]);
        lastEndOffset = annotation.endOffset;
      }
    });

    let lastIndex = 0;
    const parts: (string | JSX.Element)[] = [];

    nonOverlappingAnnotations.forEach(([annotationId, annotation], annotationIndex) => {
      const { startOffset, endOffset } = annotation;
      
      // Validate annotation boundaries
      if (startOffset < 0 || endOffset > text.length || startOffset >= endOffset) {
        console.warn(`Invalid annotation boundaries for ${annotationId}:`, { startOffset, endOffset, textLength: text.length });
        return;
      }
      
      // Add text before annotation
      if (startOffset > lastIndex) {
        const beforeText = text.slice(lastIndex, startOffset);
        const processedBeforeText = processMarkdownText(beforeText);
        if (processedBeforeText !== undefined && processedBeforeText !== null) {
          if (isFirstParagraph && lastIndex === 0) {
            if (typeof processedBeforeText === 'string' || React.isValidElement(processedBeforeText)) {
              const dropCapResult = renderFirstLetterDropCap(processedBeforeText);
              if (typeof dropCapResult === 'string' || React.isValidElement(dropCapResult)) {
                parts.push(dropCapResult as string | JSX.Element);
              } else {
                parts.push(processedBeforeText as string | JSX.Element);
              }
            }
          } else if (typeof processedBeforeText === 'string' || React.isValidElement(processedBeforeText)) {
            parts.push(processedBeforeText as string | JSX.Element);
          }
        }
      }
      
      // Get the actual text from the content (more reliable than stored selectedText)
      const actualSelectedText = text.slice(startOffset, endOffset);
      
      // Add highlighted annotation with inline compact indicator
      const isHighlighted = highlightedAnnotation === annotationId;
      const annotationNumber = annotationIndex + 1;
      
      parts.push(
        <span
          key={annotationId}
          className="relative inline-block group cursor-pointer"
        >
          <span
            className={`relative transition-all duration-300 ease-out ${
              isHighlighted ? 'bg-theme-accent/20' : 'bg-theme-accent/5'
            } hover:bg-theme-accent/15`}
            style={{
              borderBottom: `2px dotted ${colors.accent}`,
              paddingBottom: '2px',
              textDecoration: 'underline',
              textDecorationLine: 'underline',
              textDecorationStyle: 'dotted',
              textDecorationColor: colors.accent,
              textDecorationThickness: '2px',
              textUnderlineOffset: '3px'
            }}
            onClick={() => onHighlightAnnotation(annotationId)}
            title={annotation.text}
          >
            {processMarkdownText(actualSelectedText)}
          </span>
          
          {/* Compact inline annotation indicator */}
          <span
            className="absolute -top-2 -right-1 w-4 h-4 rounded-full text-xs flex items-center justify-center 
                       bg-theme-accent text-white shadow-sm opacity-90 hover:opacity-100 
                       transition-all duration-200 hover:scale-110 cursor-pointer z-10"
            style={{ 
              fontSize: '9px',
              fontWeight: '600',
              lineHeight: '1'
            }}
            onClick={(e) => {
              e.stopPropagation();
              // Toggle clicked state for persistent display
              setClickedAnnotation(clickedAnnotation === annotationId ? null : annotationId);
            }}
            onMouseEnter={() => setHoveredAnnotation(annotationId)}
            onMouseLeave={() => setHoveredAnnotation(null)}
            title={`${language === 'en' ? 'Click to pin annotation' : '点击固定批注'}`}
          >
            {annotationNumber}
          </span>
          
          {/* Annotation popup - show on hover or when clicked */}
          {(hoveredAnnotation === annotationId || clickedAnnotation === annotationId) && (
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 z-20 annotation-popup">
              <div className="bg-theme-surface-elevated border border-theme-card-border 
                              rounded-lg p-3 shadow-xl w-72 max-w-sm relative">
                {/* Original quoted text */}
                <p className="text-xs text-theme-primary leading-relaxed italic text-left mb-2 px-2 py-1 
                             bg-theme-accent/8 rounded border-l-2 border-theme-accent/30"
                   style={{ 
                     fontFamily: 'Georgia, "Times New Roman", Charter, serif'
                   }}>
                  "{actualSelectedText}"
                </p>
                
                {/* Annotation content */}
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-theme-secondary leading-relaxed flex-1 text-left"
                     style={{ 
                       fontFamily: 'Georgia, "Times New Roman", Charter, serif'
                     }}>
                    {annotation.text}
                  </p>
                    {clickedAnnotation === annotationId && userAnnotations[annotationId]?.fingerprint === (typeof window !== 'undefined' ? (localStorage.getItem('client_fingerprint_v1') || '') : '') && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveUserAnnotation(annotationId);
                        setClickedAnnotation(null);
                      }}
                      className="p-1 rounded-full text-theme-tertiary hover:text-error-500 
                                 hover:bg-error-50 dark:hover:bg-error-900/20 transition-all duration-200 
                                 flex-shrink-0"
                      title={language === 'en' ? 'Remove annotation' : '删除批注'}
                    >
                      <X size={10} className="stroke-2" />
                    </button>
                  )}
                </div>
                {/* Arrow pointing upward */}
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 
                                w-0 h-0 border-l-4 border-r-4 border-b-4 
                                border-transparent border-b-theme-card-border"></div>
              </div>
            </div>
          )}
        </span>
      );
      
      lastIndex = endOffset;
    });

    // Add remaining text
    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex);
      const processedRemainingText = processMarkdownText(remainingText);
      if (processedRemainingText !== undefined && processedRemainingText !== null) {
        if (typeof processedRemainingText === 'string' || React.isValidElement(processedRemainingText)) {
          parts.push(processedRemainingText as string | JSX.Element);
        }
      }
    }

    // Add keys to parts array elements
    const partsWithKeys = parts.map((part, index) => 
      React.isValidElement(part) ? React.cloneElement(part, { key: `part-${index}` }) : 
      typeof part === 'string' ? <span key={`text-${index}`}>{part}</span> : part
    );
    return { content: partsWithKeys, hasBlockElements };
  };

  // Function to render first letter as drop cap
  const renderFirstLetterDropCap = (content: string | React.ReactElement): React.ReactNode => {
    // If content is a string, process as before
    if (typeof content === 'string') {
      if (!content || content.length === 0) return content;
      
      const firstChar = content.charAt(0);
      const restOfText = content.slice(1);
      
      return (
        <>
          <span className="sm:hidden">{firstChar}</span>
          <span
            key="drop-cap"
            className="font-display hidden sm:block float-left text-4xl lg:text-5xl leading-none
                       text-theme-accent font-semibold mr-2.5 mt-1"
            style={{
              lineHeight: '0.86',
              paddingTop: '3px'
            }}
          >
            {firstChar}
          </span>
          <span key="rest-text">{restOfText}</span>
        </>
      );
    }
    
    // If content is already a React node, return as is
    return content;
  };

  const hasMarkdownFormatting = (text: string): boolean => {
    const patterns = [
      /\*\*.*?\*\*/,
      /\*.*?\*/,
      /`[^`]+`/,
      /\[[^\]]+\]\([^)]+\)/,
      /^#{1,6}\s+/m,
      /^[-*+]\s+/m,
      /^\d+\.\s+/m,
      /^>\s+/m,
      /^(-{3,}|\*{3,}|_{3,})$/m,
      /~~.*?~~/,
      /\|.*\|/,
    ];
    return patterns.some((pattern) => pattern.test(text));
  };

  const renderMarkdownText = (markdown: string, inline = false) => (
    <Markdown
      inline={inline}
      className="text-theme-text-primary selection:bg-theme-accent/20"
    >
      {markdown}
    </Markdown>
  );

  const processMarkdownText = (text: string): React.ReactNode => {
    if (!text) return text;

    if (isFileTreeStructure(text)) {
      return <FileTreeRenderer content={text} />;
    }

    if (!text.includes('\n') && /\s-\s(?=\[[ xX]\]\s)/.test(text)) {
      let normalized = text.replace(/\s-\s(?=\[[ xX]\]\s)/g, '\n- ');
      if (!/^\s*[-*+]\s/.test(normalized)) {
        normalized = `- ${normalized}`;
      }
      return renderMarkdownText(normalized);
    }

    if (text.includes('\n') && /(\n|^)\s*•\s+/.test(text)) {
      text = text.replace(/(^|\n)\s*•\s+/g, '$1- ');
    }

    if (!text.includes('\n')) {
      const parts = text.split(/\s-\s(?!\[[ xX]\]\s)/);
      if (parts.length >= 3) {
        return renderMarkdownText(parts.map((s) => `- ${s.trim().replace(/^[•*+-]\s*/, '')}`).join('\n'));
      }
    }

    if (!text.includes('\n') && /^\s*\d+[.)、]\s/.test(text) && /\s(?=\d+[.)、]\s)/.test(text)) {
      return renderMarkdownText(text.replace(/\s(?:-\s)?(?=\d+[.)、]\s)/g, '\n'));
    }

    const listPatterns = [/^[-*+]\s+/m, /^\d+\.\s+/m, /^•\s+/m, /^\s*[-*+]\s+/m];
    const hasListPattern = listPatterns.some((pattern) => pattern.test(text));

    if (text.includes('\n') || hasListPattern || text.match(/^[#>]/m) || text.includes('---')) {
      return renderMarkdownText(text);
    }

    if (hasMarkdownFormatting(text)) {
      return renderMarkdownText(text, true);
    }

    const hasUrl = /https?:\/\//i.test(text) || /\[[^\]]+\]\([^)]+\)/.test(text);
    const looksLikeSingleBullet = /^[-•]\s+.+$/.test(text) && !/\n/.test(text);
    if (!hasUrl && !looksLikeSingleBullet) {
      const inlineListPattern = / - [A-Z][^-:]*:/g;
      const matches = text.match(inlineListPattern);
      if (matches && matches.length >= 3) {
        const parts = text.split(/ - (?=[A-Z][^-:]*:)/);
        const items = parts.map((part) => part.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
        return renderMarkdownText(items.map((item) => `- ${item}`).join('\n'));
      }
    }

    if (text.includes('\n')) {
      return processPlainTextWithBreaks(text);
    }

    return text;
  };

  // Handle clicks outside to unpin annotations
  const handleOutsideClick = (e: React.MouseEvent) => {
    if (clickedAnnotation && !(e.target as Element).closest('.annotation-popup')) {
      setClickedAnnotation(null);
    }
  };

  // Check if the content is a header
  const isHeader = item.content.match(/^#+\s/);

  return (
    <article className="mb-8 break-inside-avoid group relative" onClick={handleOutsideClick}>
      {/* Main Text Content */}
      <div 
        id={item.id}
        className="relative"
        onMouseUp={interactiveAnnotations ? onTextSelection : undefined}
      >
        <div className="prose prose-lg max-w-none">
          {(() => {
            const annotatedContent = renderTextWithAnnotations(item.content, item.id);
            
            if (isHeader || annotatedContent.hasBlockElements) {
              // Render headers or content with block elements without <p> wrapper
              return (
                <div className="text-theme-text-primary selection:bg-theme-accent/20">
                  {annotatedContent.content}
                </div>
              );
            } else {
              // Render regular text with <p> wrapper
              return (
                <p className={`font-article text-theme-text-primary/85 leading-[1.74] font-normal
                               selection:bg-theme-accent/20
                               ${
                                 isFirstParagraph ? 'first-letter:text-theme-accent first-letter:font-bold' : ''
                               }`}
                   style={{
                     fontSize: isWideScreen ? '18px' : '16px',
                     color: 'color-mix(in oklch, var(--color-textPrimary) 76%, var(--color-textSecondary))',
                     textRendering: 'optimizeLegibility',
                     WebkitFontSmoothing: 'antialiased',
                     MozOsxFontSmoothing: 'grayscale'
                   }}>
                  {annotatedContent.content}
                </p>
              );
            }
          })()}
        </div>

        {/* Annotation Count Badge - Right Side Indicator */}
        {interactiveAnnotations && contentAnnotations.length > 0 && (
          <div className="absolute -right-16 top-0 hidden lg:flex flex-col items-center">
            <div className="flex items-center justify-center w-8 h-8 rounded-full 
                            bg-theme-accent/10 border border-theme-accent/30 
                            backdrop-blur-sm hover:bg-theme-accent/20 transition-all duration-200"
                 title={`${contentAnnotations.length} ${language === 'en' ? 'annotation(s)' : '条批注'}`}>
              <MessageCircle size={14} className="text-theme-accent" />
            </div>
            <span className="text-xs font-medium text-theme-accent mt-1 bg-theme-accent/10 
                             px-2 py-0.5 rounded-full border border-theme-accent/30">
              {contentAnnotations.length}
            </span>
          </div>
        )}
      </div>

      {/* Author's Original Annotation */}
      {item.annotation && interactiveAnnotations && (
        <div className="mt-8 border-l-2 border-theme-accent/30 pl-6">
          <button
            type="button"
            onClick={() => onToggleAnnotation(item.id)}
            className="inline-flex items-center gap-2 text-sm font-medium text-theme-accent 
                       hover:text-theme-accent-hover transition-colors duration-200 
                       underline decoration-dotted underline-offset-4 hover:decoration-solid"
          >
            <Quote size={14} className="stroke-2" />
            <span className="font-sans tracking-wide">
              {language === 'en' ? 'Author\'s Note' : '作者批注'}
            </span>
          </button>
          <AnimatePresence>
            {annotations[item.id] && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: 'auto', marginTop: '0.75rem' }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className=" -secondary rounded-lg p-4 border border-theme-card">
                  <p className="text-sm text-theme-secondary leading-relaxed italic font-light"
                     style={{ 
                       fontFamily: 'Georgia, "Times New Roman", Charter, serif'
                     }}>
                    {item.annotation}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {item.annotation && !interactiveAnnotations && (
        <aside className="mt-8 border-l-2 border-theme-accent/30 pl-6">
          <div className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-theme-accent">
            <Quote size={14} className="stroke-2" />
            <span>{language === 'en' ? 'Author\'s Note' : '作者批注'}</span>
          </div>
          <p className="text-sm italic leading-relaxed text-theme-secondary">
            {item.annotation}
          </p>
        </aside>
      )}



      {/* Annotation Form - Modal Popup */}
      <AnimatePresence>
        {interactiveAnnotations && showAnnotationForm === item.id && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
              onClick={onCancelAnnotation}
            />
            
            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
                         w-full max-w-md mx-4 z-50"
            >
              <div className="bg-theme-surface-elevated rounded-xl p-5 shadow-xl border border-theme-card-border">
                {selectedText && selectedText.contentId === item.id && (
                  <div className="mb-4 p-3 bg-theme-accent/5 rounded-lg border border-theme-accent/20">
                    <p className="text-xs text-theme-tertiary mb-1 font-sans uppercase tracking-wider">
                      {language === 'en' ? 'Selected Text' : '选中文本'}
                    </p>
                    <p className="text-sm text-theme-secondary italic leading-relaxed"
                       style={{ fontFamily: 'Georgia, "Times New Roman", Charter, serif' }}>
                      "{selectedText.text.substring(0, 80)}{selectedText.text.length > 80 ? '...' : ''}"
                    </p>
                  </div>
                )}
                
                <textarea
                  value={newAnnotationText}
                  onChange={(e) => onSetNewAnnotationText(e.target.value)}
                  placeholder={language === 'en' ? 'Write your note...' : '写下你的批注...'}
                  className="w-full p-3   border border-theme-card rounded-lg
                             text-theme-primary placeholder-theme-tertiary resize-none
                             focus:outline-none focus:ring-2 ring-theme-primary 
                             focus:border-transparent transition-all duration-200 leading-relaxed text-sm"
                  style={{
                    fontFamily: 'Georgia, "Times New Roman", Charter, serif'
                  }}
                  rows={4}
                  autoFocus
                  maxLength={500}
                />
                
                <div className="flex items-center justify-between mt-4">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onAddUserAnnotation(item.id)}
                      disabled={!newAnnotationText.trim()}
                      className="px-4 py-2 bg-theme-accent text-white rounded-lg 
                                 font-medium text-sm hover:bg-theme-accent-hover 
                                 disabled:opacity-50 disabled:cursor-not-allowed 
                                 transition-all duration-200 focus:outline-none focus:ring-2 
                                 ring-theme-primary font-sans"
                    >
                      {language === 'en' ? 'Save' : '保存'}
                    </button>
                    <button
                      type="button"
                      onClick={onCancelAnnotation}
                      className="px-4 py-2 text-theme-secondary hover:text-theme-primary 
                                 hover:bg-theme-hover rounded-lg transition-all duration-200
                                 focus:outline-none focus:ring-2 ring-theme-primary 
                                 font-sans text-sm"
                    >
                      {language === 'en' ? 'Cancel' : '取消'}
                    </button>
                  </div>
                  <p className="text-xs text-theme-tertiary font-mono opacity-70">
                    {newAnnotationText.length}
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </article>
  );
}; 
