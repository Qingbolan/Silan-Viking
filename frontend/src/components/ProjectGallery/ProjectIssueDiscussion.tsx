import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, MessageSquare, Send, ThumbsUp, Trash2 } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { useAuth } from '../InteractiveContact';
import { getClientFingerprint } from '../../utils/fingerprint';
import { useCommenterIdentity } from '../../lib/useCommenterIdentity';
import {
  createProjectComment,
  deleteProjectComment,
  fetchProjectIssueThread,
  likeProjectComment,
  projectIssueFromComment,
  type ProjectCommentData,
  type ProjectIssueRecord,
} from '../../api/projects/projectApi';
import Markdown from '../ui/Markdown';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  EmptyState,
  Field,
  GuestIdentityEditor,
  Modal,
  Skeleton,
  Textarea,
  useToast,
} from '../ds';

interface ProjectIssueDiscussionProps {
  projectId: string;
  issueId: string;
}

type LoadState = 'loading' | 'ready' | 'error' | 'not-found';

const ProjectIssueDiscussion: React.FC<ProjectIssueDiscussionProps> = ({ projectId, issueId }) => {
  const { language } = useLanguage();
  const locale = language as 'en' | 'zh';
  const { user, isAuthenticated } = useAuth();
  const { commenter, setAuthorName } = useCommenterIdentity();
  const toast = useToast();
  const fingerprint = getClientFingerprint();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [issue, setIssue] = useState<ProjectIssueRecord | null>(null);
  const [comments, setComments] = useState<ProjectCommentData[]>([]);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [likingId, setLikingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectCommentData | null>(null);
  const [deleting, setDeleting] = useState(false);

  const copy = language === 'en'
    ? {
        loading: 'Loading feedback thread',
        loadError: 'This feedback thread could not be loaded',
        loadErrorBody: 'The discussion service did not respond. Try again.',
        notFound: 'Feedback thread not found',
        notFoundBody: 'It may have been removed by its author.',
        retry: 'Try again',
        by: 'by',
        replies: 'Replies',
        noReplies: 'No replies yet',
        noRepliesBody: 'Start the discussion with a concrete observation or answer.',
        reply: 'Reply',
        replyPlaceholder: 'Add a useful reply…',
        sent: 'Reply posted',
        sendError: 'Reply could not be posted',
        likeError: 'Reaction could not be saved',
        delete: 'Delete',
        cancel: 'Cancel',
        confirmDelete: 'Delete this reply?',
        confirmDeleteBody: 'This action cannot be undone.',
        deleted: 'Reply deleted',
        deleteError: 'Reply could not be deleted',
      }
    : {
        loading: '正在加载反馈讨论',
        loadError: '反馈讨论加载失败',
        loadErrorBody: '讨论服务没有响应，请重试。',
        notFound: '没有找到这条反馈',
        notFoundBody: '该反馈可能已被作者删除。',
        retry: '重试',
        by: '来自',
        replies: '回复',
        noReplies: '还没有回复',
        noRepliesBody: '可以用具体观察或答案开始讨论。',
        reply: '回复',
        replyPlaceholder: '添加有帮助的回复…',
        sent: '回复已发布',
        sendError: '回复发布失败',
        likeError: '点赞状态保存失败',
        delete: '删除',
        cancel: '取消',
        confirmDelete: '删除这条回复？',
        confirmDeleteBody: '此操作无法撤销。',
        deleted: '回复已删除',
        deleteError: '回复删除失败',
      };

  const loadThread = useCallback(async () => {
    setLoadState('loading');
    try {
      const thread = await fetchProjectIssueThread(projectId, issueId, {
        fingerprint,
        language: locale,
      });
      if (!thread) {
        setIssue(null);
        setComments([]);
        setLoadState('not-found');
        return;
      }
      setIssue(projectIssueFromComment(thread));
      setComments(thread.replies ?? []);
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, [fingerprint, issueId, locale, projectId]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  const submitReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    setSubmitting(true);
    try {
      await createProjectComment(projectId, draft.trim(), fingerprint, {
        type: 'issue',
        authorName: isAuthenticated && user ? user.username : commenter.authorName,
        parentId: issueId,
        language: locale,
      });
      setDraft('');
      toast.success(copy.sent);
      await loadThread();
    } catch {
      toast.error(copy.sendError);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleLike = async (commentId: string) => {
    setLikingId(commentId);
    try {
      await likeProjectComment(commentId, fingerprint, locale);
      await loadThread();
    } catch {
      toast.error(copy.likeError);
    } finally {
      setLikingId(null);
    }
  };

  const deleteReply = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProjectComment(deleteTarget.id, {
        fingerprint,
        language: locale,
      });
      setDeleteTarget(null);
      toast.success(copy.deleted);
      await loadThread();
    } catch {
      toast.error(copy.deleteError);
    } finally {
      setDeleting(false);
    }
  };

  if (loadState === 'loading') {
    return (
      <div aria-label={copy.loading} className="space-y-5">
        <Skeleton className="w-3/4" />
        <Skeleton className="w-full" />
        <Skeleton className="w-5/6" />
        <Skeleton shape="block" className="h-28" />
      </div>
    );
  }

  if (loadState === 'error') {
    return <Alert tone="error" title={copy.loadError}><p>{copy.loadErrorBody}</p><Button variant="ghost" size="sm" className="mt-2" onClick={() => void loadThread()}>{copy.retry}</Button></Alert>;
  }

  if (loadState === 'not-found' || !issue) {
    return <EmptyState icon={<MessageSquare />} title={copy.notFound} description={copy.notFoundBody} />;
  }

  const created = new Date(issue.created);
  const createdLabel = Number.isNaN(created.getTime())
    ? issue.created
    : created.toLocaleDateString(locale === 'en' ? 'en-SG' : 'zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <article className="space-y-8">
      <header className="border-b border-ds-border pb-5">
        <div className="flex flex-wrap items-center gap-2 text-ds-xs text-ds-fg-subtle">
          <Badge appearance="soft" tone="primary">{issue.type}</Badge>
          <span>{copy.by} {issue.author}</span>
          <span className="inline-flex items-center gap-1"><CalendarDays className="size-3" aria-hidden />{createdLabel}</span>
        </div>
        <h3 className="mt-2 text-balance text-ds-2xl font-semibold leading-tight tracking-[-0.02em] text-ds-fg">{issue.title}</h3>
        <Markdown className="mt-4 text-ds-sm leading-7 text-ds-fg-muted">{issue.description}</Markdown>
        {issue.labels.length > 0 && <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1">{issue.labels.map((label) => <span key={label} className="font-mono text-ds-xs text-ds-fg-subtle">#{label}</span>)}</div>}
      </header>

      <section aria-labelledby="feedback-replies-title">
        <div className="flex items-center justify-between border-b border-ds-border pb-3">
          <h4 id="feedback-replies-title" className="flex items-center gap-2 text-ds-base font-semibold text-ds-fg"><MessageSquare className="size-4" aria-hidden />{copy.replies}</h4>
          <Badge appearance="soft" tone="neutral">{comments.length}</Badge>
        </div>

        {comments.length === 0 ? (
          <EmptyState icon={<MessageSquare />} title={copy.noReplies} description={copy.noRepliesBody} />
        ) : (
          <ol className="divide-y divide-ds-border">
            {comments.map((comment, index) => {
              const date = new Date(comment.created_at);
              const dateLabel = Number.isNaN(date.getTime()) ? comment.created_at : date.toLocaleDateString(locale === 'en' ? 'en-SG' : 'zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
              const canDelete = comment.can_delete;
              return (
                <motion.li key={comment.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: Math.min(index * 0.04, 0.16) }} className="py-5">
                  <div className="flex gap-3">
                    <Avatar src={comment.author_avatar_url} name={comment.author_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div><span className="text-ds-sm font-medium text-ds-fg">{comment.author_name}</span><span className="ml-2 text-ds-xs text-ds-fg-subtle">{dateLabel}</span></div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" loading={likingId === comment.id} aria-label={`${comment.likes_count} ${language === 'en' ? 'likes' : '个赞'}`} onClick={() => void toggleLike(comment.id)} className={comment.is_liked_by_user ? 'text-ds-primary' : undefined}><ThumbsUp className={comment.is_liked_by_user ? 'fill-current' : undefined} />{comment.likes_count}</Button>
                          {canDelete && <Button variant="ghost" size="icon-sm" aria-label={`${copy.delete}: ${comment.author_name}`} onClick={() => setDeleteTarget(comment)}><Trash2 /></Button>}
                        </div>
                      </div>
                      <Markdown className="mt-2 text-ds-sm leading-6 text-ds-fg-muted">{comment.content}</Markdown>
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="border-t border-ds-border pt-5">
        <form onSubmit={submitReply} className="space-y-3">
          {!isAuthenticated && (
            <GuestIdentityEditor name={commenter.authorName} onChange={setAuthorName} />
          )}
          <Field
            label={`${copy.reply} · ${isAuthenticated && user ? user.username : commenter.authorName}`}
            htmlFor="feedback-reply"
          >
            <Textarea id="feedback-reply" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={copy.replyPlaceholder} rows={4} maxLength={2000} />
          </Field>
          <div className="flex justify-end"><Button type="submit" leadingIcon={<Send />} loading={submitting} disabled={!draft.trim()}>{copy.reply}</Button></div>
        </form>
      </section>

      <Modal open={Boolean(deleteTarget)} onClose={() => !deleting && setDeleteTarget(null)} title={copy.confirmDelete} description={copy.confirmDeleteBody} size="sm" closeLabel={copy.cancel} footer={<><Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>{copy.cancel}</Button><Button variant="danger" loading={deleting} onClick={() => void deleteReply()}>{copy.delete}</Button></>} />
    </article>
  );
};

export default ProjectIssueDiscussion;
