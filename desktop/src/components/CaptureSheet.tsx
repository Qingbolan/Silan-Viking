import React from 'react';
import { AlertCircle, ArrowUp, ImagePlus, LoaderCircle, Sparkles, X } from 'lucide-react';
import type { CapturePhase, CaptureTarget, IdeaCategory } from '../types';

type CaptureCategoryOption = { value: IdeaCategory; label: string; Icon: typeof Sparkles };

type CaptureSheetProps = {
  phase: CapturePhase;
  target: CaptureTarget;
  onTargetChange: (target: CaptureTarget) => void;
  category: IdeaCategory;
  onCategoryChange: (category: IdeaCategory) => void;
  categories: CaptureCategoryOption[];
  note: string;
  onNoteChange: (note: string) => void;
  error: string | null;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  onRequestClose: () => void;
  onDiscard: () => void;
  onKeepWriting: () => void;
  onSubmit: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onTransitionEnd: (event: React.TransitionEvent<HTMLElement>) => void;
};

export function CaptureSheet({
  phase,
  target,
  onTargetChange,
  category,
  onCategoryChange,
  categories,
  note,
  onNoteChange,
  error,
  inputRef,
  onRequestClose,
  onDiscard,
  onKeepWriting,
  onSubmit,
  onKeyDown,
  onTransitionEnd,
}: CaptureSheetProps) {
  return (
    <section
      className="idea-capture"
      data-phase={phase}
      data-target={target}
      aria-hidden={phase === 'closed'}
      onTransitionEnd={onTransitionEnd}
    >
      <header className="capture-header">
        <nav className="capture-mode-tabs" role="tablist" aria-label="快速书写模式">
          <button
            type="button"
            role="tab"
            aria-selected={target === 'blog'}
            className={target === 'blog' ? 'active' : ''}
            onClick={() => onTargetChange('blog')}
            disabled={phase === 'submitting'}
          >
            快速写文章
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={target === 'idea'}
            className={target === 'idea' ? 'active' : ''}
            onClick={() => onTargetChange('idea')}
            disabled={phase === 'submitting'}
          >
            记录想法
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={target === 'update'}
            className={target === 'update' ? 'active' : ''}
            onClick={() => onTargetChange('update')}
            disabled={phase === 'submitting'}
          >
            记录事件
          </button>
        </nav>
        <button
          type="button"
          className="capture-close"
          onClick={onRequestClose}
          disabled={phase === 'submitting'}
          title="Close capture"
          aria-label="Close capture"
        >
          <X size={18} />
        </button>
      </header>

      <div className="capture-workspace">
        {target !== 'update' && (
          <div className="capture-categories" role="radiogroup" aria-label="Idea category">
            {categories.map(({ value, label, Icon }) => (
              <button
                type="button"
                role="radio"
                aria-checked={category === value}
                className={category === value ? 'active' : ''}
                key={value}
                onClick={() => onCategoryChange(value)}
                disabled={phase === 'submitting'}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="capture-sheet">
          <textarea
            ref={inputRef}
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={phase === 'submitting'}
            placeholder={target === 'update'
              ? '记录刚发生的进展、事件或状态变化...'
              : target === 'idea'
                ? '把你现在想到的先说清楚...'
                : '先把文章草稿写下来...'}
            aria-label={target === 'update' ? '事件内容' : target === 'idea' ? '想法内容' : '文章草稿'}
          />
          <div className="capture-sheet-footer">
            <button
              type="button"
              className="capture-attachment"
              disabled
              title="保存草稿后可在编辑器中添加图片"
              aria-label="保存草稿后添加图片"
            >
              <ImagePlus size={19} />
            </button>
            <button
              type="button"
              className="capture-submit"
              disabled={!note.trim() || phase === 'submitting'}
              onClick={onSubmit}
              title={target === 'update' ? '记录事件' : target === 'idea' ? '记录想法' : '保存文章草稿'}
              aria-label={target === 'update' ? '记录事件' : target === 'idea' ? '记录想法' : '保存文章草稿'}
            >
              {phase === 'submitting' ? <LoaderCircle size={19} /> : <ArrowUp size={19} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="capture-error" role="alert">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {phase === 'confirming-close' && (
        <div className="capture-discard" role="alertdialog" aria-modal="true">
          <div>
            <strong>Discard this thought?</strong>
            <span>Nothing has been written to content/ yet.</span>
          </div>
          <button type="button" onClick={onKeepWriting}>Keep writing</button>
          <button type="button" className="destructive" onClick={onDiscard}>Discard</button>
        </div>
      )}
    </section>
  );
}
