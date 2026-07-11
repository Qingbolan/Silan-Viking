import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../../lib/utils';
import Avatar from './Avatar';
import CommentItem from './CommentItem';
import type { MockComment } from '../__mocks__/articleFooterMock';

interface CommentsSectionProps {
  comments: MockComment[];
  currentUser?: { name: string; avatar?: string };
  onSubmit?: (text: string) => void;
}

// Count comments recursively (top-level + all nested replies).
const countAll = (comments: MockComment[]): number =>
  comments.reduce(
    (acc, c) => acc + 1 + (c.replies ? countAll(c.replies) : 0),
    0,
  );

const CommentsSection: React.FC<CommentsSectionProps> = ({
  comments,
  currentUser = { name: 'You' },
  onSubmit,
}) => {
  const [draft, setDraft] = useState('');
  const total = countAll(comments);

  const handleSubmit = () => {
    const text = draft.trim();
    if (!text) return;
    onSubmit?.(text);
    setDraft('');
  };

  return (
    <section className="mt-10">
      {/* Header — All comments (N) · filter */}
      <div className="flex items-center justify-between border-b border-ds-border">
        <button
          type="button"
          className="border-b-2 border-ds-fg pb-3 text-ds-base font-medium text-ds-fg"
        >
          All comments ({total})
        </button>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1 pb-3 text-ds-sm',
            'text-ds-fg-muted transition-colors hover:text-ds-fg',
          )}
        >
          All members
          <ChevronDown size={14} />
        </button>
      </div>

      {/* Composer */}
      <div className="flex gap-3 py-6">
        <Avatar name={currentUser.name} src={currentUser.avatar} size="md" />
        <div className="flex-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Say something..."
            className={cn(
              'min-h-[80px] w-full resize-y rounded-ds-md p-3 text-ds-sm',
              'bg-ds-surface-2 text-ds-fg placeholder:text-ds-fg-subtle',
              'border border-transparent transition-colors',
              'focus:border-ds-primary/40 focus:bg-ds-surface-1 focus:outline-none',
            )}
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!draft.trim()}
              className={cn(
                'rounded-ds-sm px-4 py-1.5 text-ds-sm font-medium transition-colors',
                draft.trim()
                  ? 'bg-ds-primary text-white hover:bg-ds-primary/90'
                  : 'cursor-not-allowed bg-ds-surface-2 text-ds-fg-subtle',
              )}
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Comment list */}
      <div className="space-y-0">
        {comments.map((c) => (
          <CommentItem key={c.id} comment={c} topLevel />
        ))}
      </div>
    </section>
  );
};

export default CommentsSection;
