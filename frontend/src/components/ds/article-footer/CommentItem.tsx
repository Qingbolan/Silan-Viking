import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../../lib/utils';
import Avatar from './Avatar';
import ReactionPill from './ReactionPill';
import type { MockComment } from '../__mocks__/articleFooterMock';

interface CommentItemProps {
  comment: MockComment;
  isReply?: boolean;
  topLevel?: boolean;  // top-level comments get a border-top divider
}

const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  isReply = false,
  topLevel = false,
}) => {
  const avatarSize = isReply ? 'sm' : 'md';
  return (
    <div className={cn(
      'flex gap-3',
      topLevel && 'border-t border-ds-border pt-6 first:border-t-0 first:pt-0',
      isReply ? 'pt-4' : 'pb-6',
    )}>
      <Avatar name={comment.username} src={comment.avatar} size={avatarSize} />
      <div className="min-w-0 flex-1">
        {/* Header — username · (optional ▶ replyTo) · timestamp · ipRegion */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={cn(
            'font-medium text-ds-fg',
            isReply ? 'text-ds-sm' : 'text-ds-sm',
          )}>
            {comment.username}
          </span>
          {comment.replyTo && (
            <>
              <ChevronRight
                size={12}
                className="text-ds-fg-subtle"
                aria-hidden
              />
              <span className="text-ds-sm font-medium text-ds-fg">
                {comment.replyTo}
              </span>
            </>
          )}
          <span className="text-ds-xs text-ds-fg-subtle">
            {comment.createdAt}
          </span>
          {comment.ipRegion && (
            <span className="text-ds-xs text-ds-fg-subtle">
              IP region {comment.ipRegion}
            </span>
          )}
        </div>

        {/* Body */}
        <div className={cn(
          'mt-2 leading-[1.75] text-ds-fg',
          isReply ? 'text-ds-sm' : 'text-ds-base',
        )}>
          {comment.content}
        </div>

        {/* Reactions */}
        {comment.reactions && comment.reactions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {comment.reactions.map((r) => (
              <ReactionPill
                key={r.label}
                icon={r.icon}
                label={r.label}
                count={r.count}
                active={r.mine}
              />
            ))}
          </div>
        )}

        {/* Nested replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-2 space-y-0">
            {comment.replies.map((reply) => (
              <CommentItem key={reply.id} comment={reply} isReply />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CommentItem;
