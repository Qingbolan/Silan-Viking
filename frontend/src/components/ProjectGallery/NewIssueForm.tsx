import Avatar from '../ds/article-footer/Avatar';
import { FeedbackEditor } from '../ui/FeedbackEditor';
import React, { useState } from 'react';
import { Bug, FileText, HelpCircle, Lightbulb } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { useAuth } from '../InteractiveContact';
import { getClientFingerprint } from '../../utils/fingerprint';
import { createProjectIssue, type ProjectIssueRecord } from '../../api/projects/projectApi';
import { buildDefaultGuestName } from '../../lib/commenterIdentity';
import { publicDisplayName } from '../../lib/publicIdentity';
import { useCommenterIdentity } from '../../lib/useCommenterIdentity';
import {
  Button,
  Checkbox,
  Field,
  GuestIdentityEditor,
  useToast,
} from '../ds';

interface NewIssueFormProps {
  projectId: string;
  onIssueCreated: (issue: ProjectIssueRecord) => void | Promise<void>;
}

type IssueType = ProjectIssueRecord['type'];
type Priority = ProjectIssueRecord['priority'];

interface FormState {
  type: IssueType;
  priority: Priority;
  title: string;
  description: string;
  labels: string[];
}

const EMPTY_FORM: FormState = {
  type: 'bug',
  priority: 'medium',
  title: '',
  description: '',
  labels: [],
};

const NewIssueForm: React.FC<NewIssueFormProps> = ({ projectId, onIssueCreated }) => {
  const { language } = useLanguage();
  const locale = language as 'en' | 'zh';
  const { user, isAuthenticated } = useAuth();
  const { commenter, setAuthorName } = useCommenterIdentity();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const copy = language === 'en'
    ? {
        submittingAs: 'Submitting as',
        type: 'Feedback type',
        types: {
          bug: ['Bug report', 'Describe behavior that does not work as expected.'],
          enhancement: ['Feature suggestion', 'Propose a concrete improvement or use case.'],
          question: ['Question', 'Ask about setup, behavior, or design.'],
          documentation: ['Documentation', 'Point out missing or unclear documentation.'],
        },
        title: 'Untitle（Optional）',
        untitled: 'Untitle',
        titlePlaceholder: 'A concise summary',
        description: 'Details',
        descriptionPlaceholder: 'Include the context, expected behavior, and what you observed.',
        priority: 'Priority',
        priorities: { low: 'Low', medium: 'Medium', high: 'High' },
        labels: 'Topics (optional)',
        submit: 'Submit feedback',
        submitted: 'Feedback submitted',
        submitError: 'Feedback could not be submitted',
        descriptionRequired: 'Use at least 10 characters',
      }
    : {
        submittingAs: '提交身份',
        type: '反馈类型',
        types: {
          bug: ['错误报告', '描述与预期不符的行为。'],
          enhancement: ['功能建议', '提出具体的改进或使用场景。'],
          question: ['问题', '询问安装、行为或设计。'],
          documentation: ['文档', '指出缺失或不清晰的说明。'],
        },
        title: '未命名（选填）',
        untitled: '未命名',
        titlePlaceholder: '简洁概括反馈内容',
        description: '详细说明',
        descriptionPlaceholder: '请说明背景、预期行为和实际观察。',
        priority: '优先级',
        priorities: { low: '低', medium: '中', high: '高' },
        labels: '相关主题（可选）',
        submit: '提交反馈',
        submitted: '反馈已提交',
        submitError: '反馈提交失败',
        descriptionRequired: '详细说明至少需要 10 个字符',
      };

  const typeIcons = { bug: Bug, enhancement: Lightbulb, question: HelpCircle, documentation: FileText } as const;
  const typeOptions = (Object.keys(copy.types) as IssueType[]).map((type) => {
    const Icon = typeIcons[type];
    return {
      value: type,
      label: <span className="inline-flex items-center gap-1.5"><Icon className="size-3.5" aria-hidden />{copy.types[type][0]}</span>,
      description: copy.types[type][1],
    };
  });
  const topicLabels = ['ui', 'api', 'performance', 'security', 'accessibility'];

  const validate = () => {
    const next: Record<string, string> = {};
    if (form.description.trim().length < 10) next.description = copy.descriptionRequired;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (uploading || submitting || !validate()) return;
    setSubmitting(true);
    try {
      const issue = await createProjectIssue({
        projectId,
        title: form.title.trim() || copy.untitled,
        description: form.description.trim(),
        issueType: form.type,
        priority: form.priority,
        labels: form.labels,
        fingerprint: getClientFingerprint(),
        authorName: isAuthenticated && user ? user.username : commenter.authorName,
        language: locale,
      });
      toast.success(copy.submitted);
      setForm(EMPTY_FORM);
      setErrors({});
      await onIssueCreated(issue);
    } catch {
      toast.error(copy.submitError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="feedback-letter space-y-5">
      <div className="pr-8">
        <input id="feedback-title" aria-label={copy.title} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? 'feedback-title-error' : undefined}
          value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          placeholder={copy.title} maxLength={160}
          className="w-full bg-transparent py-1 text-ds-xl font-semibold text-ds-fg outline-none placeholder:text-ds-fg-muted" />
        {errors.title && <p id="feedback-title-error" role="alert" className="text-ds-xs text-red-500">{errors.title}</p>}
      </div>
      <div className="flex items-center gap-3">
        <Avatar countryCode={!isAuthenticated && commenter.countryCode !== 'XX' ? commenter.countryCode : undefined} src={isAuthenticated ? user?.avatar : undefined} name={isAuthenticated && user ? user.username : publicDisplayName(commenter.authorName, undefined, locale)} size="md" />
        <div className="min-w-0">
          {isAuthenticated && user ? <p className="text-ds-sm font-medium">{user.username}</p> : <GuestIdentityEditor name={commenter.authorName} onChange={setAuthorName} />}
          <p className="break-all text-ds-xs text-ds-fg-muted">ID: {isAuthenticated && user ? user.id : buildDefaultGuestName(commenter.countryCode, commenter.regionCode, getClientFingerprint()).split('/').pop()?.replace('>', '')}</p>
        </div>
      </div>

      <Field label={copy.type} required>
        <div role="radiogroup" aria-label={copy.type} className="flex flex-nowrap gap-3 overflow-x-auto overscroll-x-contain p-1">
          {typeOptions.map((option) => (
            <button key={option.value} type="button" role="radio" aria-checked={form.type === option.value}
              className="feedback-type shrink-0 whitespace-nowrap text-left rounded-ds-md p-3"
              onClick={() => setForm((current) => ({ ...current, type: option.value as IssueType }))}>
              <span className="flex items-center gap-2 text-ds-sm font-medium"><span className="feedback-type-dot" aria-hidden />{option.label}</span>
              <span className="mt-1 block text-ds-xs text-ds-fg-muted">{option.description}</span>
            </button>
          ))}
        </div>
      </Field>

      <Field label={copy.description} htmlFor="feedback-description" required error={errors.description}>
        <FeedbackEditor value={form.description} onChange={(description) => setForm((current) => ({ ...current, description }))} label={copy.description} onUploadingChange={setUploading} />
      </Field>

      <Field label={copy.labels}>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {topicLabels.map((label) => (
            <Checkbox key={label} checked={form.labels.includes(label)} onChange={(checked) => setForm((current) => ({ ...current, labels: checked ? [...current.labels, label] : current.labels.filter((item) => item !== label) }))} label={label} />
          ))}
        </div>
      </Field>

      <div className="flex justify-end border-t border-ds-border pt-4">
        <Button type="submit" disabled={uploading} loading={submitting}>{copy.submit}</Button>
      </div>
    </form>
  );
};

export default NewIssueForm;
