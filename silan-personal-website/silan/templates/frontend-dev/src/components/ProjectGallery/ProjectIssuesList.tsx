import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bug,
  CalendarDays,
  FileText,
  HelpCircle,
  Lightbulb,
  MessageSquare,
  Plus,
  Search,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import ProjectIssueDiscussion from './ProjectIssueDiscussion';
import NewIssueForm from './NewIssueForm';
import {
  deleteProjectIssue,
  fetchProjectIssues,
  type ProjectIssueRecord,
} from '../../api/projects/projectApi';
import { getClientFingerprint } from '../../utils/fingerprint';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
  useToast,
} from '../ds';

interface ProjectIssuesListProps {
  projectId: string;
}

type FeedbackType = 'all' | ProjectIssueRecord['type'];
type LoadState = 'loading' | 'ready' | 'error';

const TYPE_ICONS = {
  bug: Bug,
  enhancement: Lightbulb,
  question: HelpCircle,
  documentation: FileText,
} as const;

const ProjectIssuesList: React.FC<ProjectIssuesListProps> = ({ projectId }) => {
  const { language } = useLanguage();
  const locale = language as 'en' | 'zh';
  const toast = useToast();
  const [issues, setIssues] = useState<ProjectIssueRecord[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [typeFilter, setTypeFilter] = useState<FeedbackType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIssue, setSelectedIssue] = useState<ProjectIssueRecord | null>(null);
  const [showNewIssueForm, setShowNewIssueForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectIssueRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const copy = language === 'en'
    ? {
        title: 'Project feedback',
        description: 'Questions, bug reports, documentation notes, and feature suggestions from readers.',
        newFeedback: 'New feedback',
        search: 'Search feedback…',
        allTypes: 'All types',
        types: { bug: 'Bug report', enhancement: 'Feature suggestion', question: 'Question', documentation: 'Documentation' },
        loading: 'Loading project feedback',
        errorTitle: 'Feedback could not be loaded',
        errorBody: 'The discussion service did not respond. Try again without losing your filters.',
        retry: 'Try again',
        emptyTitle: 'No feedback yet',
        emptyBody: 'Start a concrete question, report, or suggestion for this project.',
        filteredEmptyTitle: 'No feedback matched',
        filteredEmptyBody: 'Change the type or search phrase to see other threads.',
        replies: 'replies',
        likes: 'likes',
        by: 'by',
        delete: 'Delete',
        cancel: 'Cancel',
        confirmDelete: 'Delete this feedback thread?',
        confirmDeleteBody: 'Its replies will also be removed. This action cannot be undone.',
        deleteSuccess: 'Feedback deleted',
        deleteError: 'Feedback could not be deleted',
        modalTitle: 'New project feedback',
        detailTitle: 'Feedback thread',
      }
    : {
        title: '项目反馈',
        description: '读者提交的问题、错误报告、文档建议与功能想法。',
        newFeedback: '提交反馈',
        search: '搜索反馈…',
        allTypes: '全部类型',
        types: { bug: '错误报告', enhancement: '功能建议', question: '问题', documentation: '文档' },
        loading: '正在加载项目反馈',
        errorTitle: '反馈加载失败',
        errorBody: '讨论服务没有响应，重试不会丢失当前筛选。',
        retry: '重试',
        emptyTitle: '还没有反馈',
        emptyBody: '可以提交一个具体问题、错误报告或功能建议。',
        filteredEmptyTitle: '没有匹配的反馈',
        filteredEmptyBody: '更改类型或搜索词以查看其他讨论。',
        replies: '条回复',
        likes: '个赞',
        by: '来自',
        delete: '删除',
        cancel: '取消',
        confirmDelete: '删除这条反馈？',
        confirmDeleteBody: '其回复也会一并删除，此操作无法撤销。',
        deleteSuccess: '反馈已删除',
        deleteError: '反馈删除失败',
        modalTitle: '提交项目反馈',
        detailTitle: '反馈讨论',
      };

  const loadIssues = useCallback(async () => {
    setLoadState('loading');
    try {
      setIssues(await fetchProjectIssues(projectId, locale));
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, [locale, projectId]);

  useEffect(() => {
    void loadIssues();
  }, [loadIssues]);

  const filteredIssues = useMemo(() => {
    const needle = searchQuery.trim().toLocaleLowerCase(locale === 'zh' ? 'zh-CN' : 'en-US');
    return issues.filter((issue) => {
      if (typeFilter !== 'all' && issue.type !== typeFilter) return false;
      if (!needle) return true;
      return `${issue.title}\n${issue.description}`.toLocaleLowerCase().includes(needle);
    });
  }, [issues, locale, searchQuery, typeFilter]);

  const totalReplies = issues.reduce((sum, issue) => sum + issue.comments, 0);

  const canDeleteIssue = (issue: ProjectIssueRecord) => issue.comment.can_delete;

  const deleteIssue = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProjectIssue(deleteTarget.id, {
        fingerprint: getClientFingerprint(),
        language: locale,
      });
      setDeleteTarget(null);
      toast.success(copy.deleteSuccess);
      await loadIssues();
    } catch {
      toast.error(copy.deleteError);
    } finally {
      setDeleting(false);
    }
  };

  const typeOptions = [
    { value: 'all', label: copy.allTypes },
    ...Object.entries(copy.types).map(([value, label]) => ({ value, label })),
  ];

  return (
    <section aria-labelledby="project-feedback-title" className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-ds-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 id="project-feedback-title" className="text-ds-2xl font-semibold tracking-[-0.02em] text-ds-fg">{copy.title}</h2>
            <Badge appearance="soft" tone="neutral">{issues.length}</Badge>
            {totalReplies > 0 && <span className="text-ds-xs text-ds-fg-subtle">{totalReplies} {copy.replies}</span>}
          </div>
          <p className="mt-1 max-w-2xl text-ds-sm leading-6 text-ds-fg-muted">{copy.description}</p>
        </div>
        <Button leadingIcon={<Plus />} onClick={() => setShowNewIssueForm(true)}>{copy.newFeedback}</Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <Select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as FeedbackType)}
          options={typeOptions}
          aria-label={copy.allTypes}
        />
        <Input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          leadingIcon={<Search />}
          placeholder={copy.search}
          aria-label={copy.search}
        />
      </div>

      {loadState === 'loading' && (
        <div aria-label={copy.loading} className="divide-y divide-ds-border border-y border-ds-border">
          {[0, 1, 2].map((item) => (
            <div key={item} className="grid grid-cols-[2.25rem_1fr] gap-3 py-5">
              <Skeleton shape="circle" className="size-9" />
              <div className="space-y-2.5"><Skeleton className="w-2/3" /><Skeleton className="w-full" /><Skeleton className="w-40" /></div>
            </div>
          ))}
        </div>
      )}

      {loadState === 'error' && (
        <Alert tone="error" title={copy.errorTitle}>
          <p>{copy.errorBody}</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => void loadIssues()}>{copy.retry}</Button>
        </Alert>
      )}

      {loadState === 'ready' && filteredIssues.length === 0 && (
        <EmptyState
          icon={<MessageSquare />}
          title={issues.length === 0 ? copy.emptyTitle : copy.filteredEmptyTitle}
          description={issues.length === 0 ? copy.emptyBody : copy.filteredEmptyBody}
          action={issues.length === 0 ? <Button variant="outline" size="sm" onClick={() => setShowNewIssueForm(true)}>{copy.newFeedback}</Button> : undefined}
        />
      )}

      {loadState === 'ready' && filteredIssues.length > 0 && (
        <ol className="divide-y divide-ds-border border-y border-ds-border">
          {filteredIssues.map((issue, index) => {
            const TypeIcon = TYPE_ICONS[issue.type];
            const date = new Date(issue.created);
            const formattedDate = Number.isNaN(date.getTime()) ? issue.created : date.toLocaleDateString(locale === 'en' ? 'en-SG' : 'zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
            return (
              <motion.li key={issue.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: Math.min(index * 0.04, 0.16) }} className="group relative">
                <button type="button" onClick={() => setSelectedIssue(issue)} className="grid w-full grid-cols-[2.25rem_minmax(0,1fr)] gap-3 py-5 text-left outline-none focus-visible:rounded-ds-md focus-visible:shadow-ds-focus sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:gap-4">
                  <span className="mt-0.5 flex size-9 items-center justify-center rounded-full border border-ds-border text-ds-fg-muted transition-colors group-hover:border-ds-primary/30 group-hover:bg-ds-primary-soft group-hover:text-ds-primary"><TypeIcon className="size-4" aria-hidden /></span>
                  <span className="min-w-0">
                    <span className="block text-ds-lg font-semibold leading-snug text-ds-fg group-hover:text-ds-primary">{issue.title}</span>
                    <span className="mt-1 line-clamp-2 block text-ds-sm leading-6 text-ds-fg-muted">{issue.description}</span>
                    <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-ds-xs text-ds-fg-subtle">
                      <span>{copy.types[issue.type]}</span>
                      <span className="inline-flex items-center gap-1"><CalendarDays className="size-3" aria-hidden />{formattedDate}</span>
                      <span>{copy.by} {issue.author}</span>
                      {issue.labels.slice(0, 3).map((label) => <span key={label} className="font-mono">#{label}</span>)}
                    </span>
                  </span>
                  <span className="col-start-2 flex items-center gap-3 text-ds-xs text-ds-fg-subtle sm:col-start-auto sm:row-start-1 sm:items-start sm:pt-1">
                    <span className="inline-flex items-center gap-1"><MessageSquare className="size-3.5" aria-hidden />{issue.comments}</span>
                    <span className="inline-flex items-center gap-1"><ThumbsUp className="size-3.5" aria-hidden />{issue.likes}</span>
                  </span>
                </button>
                {canDeleteIssue(issue) && (
                  <Button variant="ghost" size="icon-sm" aria-label={`${copy.delete}: ${issue.title}`} className="absolute bottom-3 right-0 sm:bottom-auto sm:right-16 sm:top-3" onClick={() => setDeleteTarget(issue)}><Trash2 /></Button>
                )}
              </motion.li>
            );
          })}
        </ol>
      )}

      <Modal open={showNewIssueForm} onClose={() => setShowNewIssueForm(false)} title={copy.modalTitle} size="lg" closeLabel={copy.cancel}>
        <NewIssueForm projectId={projectId} onIssueCreated={async () => { setShowNewIssueForm(false); await loadIssues(); }} />
      </Modal>

      <Modal open={Boolean(selectedIssue)} onClose={() => setSelectedIssue(null)} title={copy.detailTitle} size="lg" closeLabel={copy.cancel}>
        {selectedIssue && <ProjectIssueDiscussion projectId={projectId} issueId={selectedIssue.id} />}
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        title={copy.confirmDelete}
        description={copy.confirmDeleteBody}
        size="sm"
        closeLabel={copy.cancel}
        footer={<><Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>{copy.cancel}</Button><Button variant="danger" onClick={() => void deleteIssue()} loading={deleting}>{copy.delete}</Button></>}
      />
    </section>
  );
};

export default ProjectIssuesList;
