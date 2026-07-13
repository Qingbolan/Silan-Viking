import React, { useState } from 'react';
import { AlertCircle, LoaderCircle, MessageSquareText, RotateCcw } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useLanguage } from '../../LanguageContext';
import { Input, Textarea } from '../Input';
import { Button } from '../Button';
import { Modal } from '../Modal';
import Avatar from './Avatar';
import CommentItem from './CommentItem';
import type { ArticleComment, CommentDraft, CommentLoadState } from './types';

interface CommentsSectionProps {
  comments: ArticleComment[];
  state: CommentLoadState;
  error?: string;
  submitting?: boolean;
  onRetry: () => void | Promise<void>;
  onSubmit: (draft: CommentDraft) => void | Promise<void>;
  onCommentLike: (commentId: string) => void | Promise<void>;
  isCommentLikePending: (commentId: string) => boolean;
  onCommentDelete?: (commentId: string) => void | Promise<void>;
  isCommentDeletePending?: (commentId: string) => boolean;
}

interface StoredCommenter {
  authorName: string;
  authorEmail: string;
}

const COMMENTER_KEY = 'article-commenter-v1';

const readCommenter = (): StoredCommenter => {
  try {
    const stored = JSON.parse(localStorage.getItem(COMMENTER_KEY) ?? '{}');
    return {
      authorName: typeof stored.authorName === 'string' ? stored.authorName : '',
      authorEmail: typeof stored.authorEmail === 'string' ? stored.authorEmail : '',
    };
  } catch {
    return { authorName: '', authorEmail: '' };
  }
};

const persistCommenter = (commenter: StoredCommenter) => {
  try {
    localStorage.setItem(COMMENTER_KEY, JSON.stringify(commenter));
  } catch {
    // A blocked storage API must not prevent commenting.
  }
};

const countAll = (comments: ArticleComment[]): number =>
  comments.reduce(
    (total, comment) => total + 1 + countAll(comment.replies),
    0,
  );

const CommentsSkeleton = () => (
  <div className="space-y-6 py-6" aria-hidden>
    {[0, 1].map((item) => (
      <div key={item} className="flex animate-pulse gap-3">
        <div className="size-9 shrink-0 rounded-full bg-ds-surface-2" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-28 rounded bg-ds-surface-2" />
          <div className="h-3 w-full rounded bg-ds-surface-2" />
          <div className="h-3 w-3/5 rounded bg-ds-surface-2" />
        </div>
      </div>
    ))}
  </div>
);

const CommentsSection: React.FC<CommentsSectionProps> = ({
  comments,
  state,
  error,
  submitting = false,
  onRetry,
  onSubmit,
  onCommentLike,
  isCommentLikePending,
  onCommentDelete,
  isCommentDeletePending = () => false,
}) => {
  const { language } = useLanguage();
  const [identity, setIdentity] = useState<StoredCommenter>(readCommenter);
  const [content, setContent] = useState('');
  const [formError, setFormError] = useState<string>();
  const [deleteTarget, setDeleteTarget] = useState<ArticleComment | null>(null);
  const [deleteError, setDeleteError] = useState<string>();
  const total = countAll(comments);
  const deleting = deleteTarget ? isCommentDeletePending(deleteTarget.id) : false;

  const confirmDelete = async () => {
    if (!deleteTarget || !onCommentDelete) return;
    setDeleteError(undefined);
    try {
      await onCommentDelete(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      setDeleteError(language === 'zh' ? '评论未能删除，请重试。' : 'The comment could not be deleted. Please retry.');
    }
  };

  const handleSubmit = async () => {
    const authorName = identity.authorName.trim();
    const authorEmail = identity.authorEmail.trim();
    const comment = content.trim();
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authorEmail);

    if (!authorName || !authorEmail || !comment) {
      setFormError(language === 'zh' ? '请填写姓名、邮箱和评论内容。' : 'Name, email, and comment are required.');
      return;
    }
    if (!validEmail) {
      setFormError(language === 'zh' ? '请输入有效的邮箱地址。' : 'Enter a valid email address.');
      return;
    }

    setFormError(undefined);
    try {
      await onSubmit({ authorName, authorEmail, content: comment });
      persistCommenter({ authorName, authorEmail });
      setContent('');
    } catch {
      setFormError(language === 'zh' ? '评论未能发布，请重试。' : 'The comment was not published. Please retry.');
    }
  };

  return (
    <section className="mt-10" aria-labelledby="comments-heading">
      <div className="flex items-center border-b border-ds-border">
        <h2
          id="comments-heading"
          className="border-b-2 border-ds-fg pb-3 text-ds-base font-medium text-ds-fg"
        >
          {language === 'zh' ? `全部评论（${total}）` : `All comments (${total})`}
        </h2>
      </div>

      <form
        className="flex gap-3 py-6"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <Avatar name={identity.authorName || (language === 'zh' ? '访客' : 'Guest')} size="md" />
        <div className="min-w-0 flex-1">
          <div className="grid gap-2 sm:grid-cols-2">
            <label>
              <span className="sr-only">{language === 'zh' ? '姓名' : 'Name'}</span>
              <Input
                value={identity.authorName}
                onChange={(event) => setIdentity((current) => ({ ...current, authorName: event.target.value }))}
                autoComplete="name"
                maxLength={80}
                size="lg"
                placeholder={language === 'zh' ? '姓名' : 'Name'}
              />
            </label>
            <label>
              <span className="sr-only">{language === 'zh' ? '邮箱（不会公开）' : 'Email (not published)'}</span>
              <Input
                type="email"
                value={identity.authorEmail}
                onChange={(event) => setIdentity((current) => ({ ...current, authorEmail: event.target.value }))}
                autoComplete="email"
                maxLength={160}
                size="lg"
                placeholder={language === 'zh' ? '邮箱（不会公开）' : 'Email (not published)'}
              />
            </label>
          </div>
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                void handleSubmit();
              }
            }}
            maxLength={4000}
            placeholder={language === 'zh' ? '写下你的想法…' : 'Add to the discussion…'}
            className={cn(
              'mt-2 min-h-[104px] w-full p-3 text-ds-sm',
            )}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-ds-xs text-ds-fg-subtle">
              {language === 'zh' ? '⌘/Ctrl + Enter 发布' : '⌘/Ctrl + Enter to publish'}
            </span>
            <button
              type="submit"
              disabled={submitting || !content.trim()}
              className={cn(
                'inline-flex min-h-10 items-center justify-center gap-2 rounded-ds-sm px-4 text-ds-sm font-medium transition',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary/50',
                submitting || !content.trim()
                  ? 'cursor-not-allowed bg-ds-surface-2 text-ds-fg-subtle'
                  : 'bg-ds-primary text-white hover:bg-ds-primary/90',
              )}
            >
              {submitting && <LoaderCircle className="size-4 animate-spin" />}
              {submitting
                ? language === 'zh' ? '发布中' : 'Publishing'
                : language === 'zh' ? '发布评论' : 'Publish comment'}
            </button>
          </div>
          {formError && (
            <p className="mt-2 flex items-center gap-1.5 text-ds-xs text-red-600" role="alert">
              <AlertCircle className="size-3.5" />
              {formError}
            </p>
          )}
        </div>
      </form>

      {state === 'loading' && <CommentsSkeleton />}

      {state === 'error' && (
        <div className="flex flex-col items-center rounded-ds-md border border-ds-border bg-ds-surface-2/60 px-5 py-8 text-center" role="alert">
          <AlertCircle className="size-5 text-ds-fg-muted" />
          <p className="mt-2 text-ds-sm text-ds-fg-muted">{error}</p>
          <button
            type="button"
            onClick={() => void onRetry()}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-ds-border px-4 text-ds-sm text-ds-fg transition hover:bg-ds-surface-1"
          >
            <RotateCcw className="size-3.5" />
            {language === 'zh' ? '重新加载' : 'Retry'}
          </button>
        </div>
      )}

      {state === 'ready' && comments.length === 0 && (
        <div className="flex flex-col items-center px-5 py-10 text-center">
          <MessageSquareText className="size-6 text-ds-fg-subtle" />
          <p className="mt-3 text-ds-sm font-medium text-ds-fg">
            {language === 'zh' ? '还没有评论' : 'No comments yet'}
          </p>
          <p className="mt-1 text-ds-xs text-ds-fg-subtle">
            {language === 'zh' ? '提出问题或分享你的观察。' : 'Ask a question or share an observation.'}
          </p>
        </div>
      )}

      {state === 'ready' && comments.length > 0 && (
        <div className="space-y-0">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              topLevel
              onLike={onCommentLike}
              isLikePending={isCommentLikePending}
              onDelete={onCommentDelete ? setDeleteTarget : undefined}
              isDeletePending={isCommentDeletePending}
            />
          ))}
        </div>
      )}

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (!deleting) {
            setDeleteTarget(null);
            setDeleteError(undefined);
          }
        }}
        title={language === 'zh' ? '删除这条评论？' : 'Delete this comment?'}
        description={language === 'zh' ? '回复也会一并删除，此操作无法撤销。' : 'Its replies will also be removed. This cannot be undone.'}
        size="sm"
        closeLabel={language === 'zh' ? '取消' : 'Cancel'}
        footer={(
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            {deleteError && <span className="mr-auto text-ds-xs text-ds-error" role="alert">{deleteError}</span>}
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              {language === 'zh' ? '取消' : 'Cancel'}
            </Button>
            <Button variant="danger" onClick={() => void confirmDelete()} loading={deleting}>
              {language === 'zh' ? '删除' : 'Delete'}
            </Button>
          </div>
        )}
      />
    </section>
  );
};

export default CommentsSection;
