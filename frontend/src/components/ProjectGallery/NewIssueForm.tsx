import React, { useState } from 'react';
import { Bug, FileText, HelpCircle, Lightbulb } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { useAuth } from '../InteractiveContact';
import { getClientFingerprint } from '../../utils/fingerprint';
import { createProjectIssue, type ProjectIssueRecord } from '../../api/projects/projectApi';
import { useCommenterIdentity } from '../../lib/useCommenterIdentity';
import {
  Alert,
  Button,
  Checkbox,
  Field,
  GuestIdentityEditor,
  Input,
  RadioGroup,
  Select,
  Textarea,
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
        title: 'Title',
        titlePlaceholder: 'A concise summary',
        description: 'Details',
        descriptionPlaceholder: 'Include the context, expected behavior, and what you observed.',
        priority: 'Priority',
        priorities: { low: 'Low', medium: 'Medium', high: 'High' },
        labels: 'Topics (optional)',
        submit: 'Submit feedback',
        submitted: 'Feedback submitted',
        submitError: 'Feedback could not be submitted',
        titleRequired: 'Use at least 5 characters',
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
        title: '标题',
        titlePlaceholder: '简洁概括反馈内容',
        description: '详细说明',
        descriptionPlaceholder: '请说明背景、预期行为和实际观察。',
        priority: '优先级',
        priorities: { low: '低', medium: '中', high: '高' },
        labels: '相关主题（可选）',
        submit: '提交反馈',
        submitted: '反馈已提交',
        submitError: '反馈提交失败',
        titleRequired: '标题至少需要 5 个字符',
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
    if (form.title.trim().length < 5) next.title = copy.titleRequired;
    if (form.description.trim().length < 10) next.description = copy.descriptionRequired;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const issue = await createProjectIssue({
        projectId,
        title: form.title.trim(),
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
    <form onSubmit={submit} className="space-y-6">
      {isAuthenticated && user ? (
        <Alert tone="success" title={`${copy.submittingAs} ${user.username}`} />
      ) : (
        <GuestIdentityEditor name={commenter.authorName} onChange={setAuthorName} />
      )}

      <Field label={copy.type} required>
        <RadioGroup value={form.type} onChange={(value) => setForm((current) => ({ ...current, type: value as IssueType }))} options={typeOptions} className="grid gap-3 sm:grid-cols-2" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <Field label={copy.title} htmlFor="feedback-title" required error={errors.title}>
          <Input id="feedback-title" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder={copy.titlePlaceholder} invalid={Boolean(errors.title)} maxLength={160} />
        </Field>
        <Field label={copy.priority} htmlFor="feedback-priority" required>
          <Select id="feedback-priority" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as Priority }))} options={(Object.keys(copy.priorities) as Priority[]).map((value) => ({ value, label: copy.priorities[value] }))} />
        </Field>
      </div>

      <Field label={copy.description} htmlFor="feedback-description" required error={errors.description}>
        <Textarea id="feedback-description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder={copy.descriptionPlaceholder} invalid={Boolean(errors.description)} rows={6} maxLength={3000} />
      </Field>

      <Field label={copy.labels}>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {topicLabels.map((label) => (
            <Checkbox key={label} checked={form.labels.includes(label)} onChange={(checked) => setForm((current) => ({ ...current, labels: checked ? [...current.labels, label] : current.labels.filter((item) => item !== label) }))} label={label} />
          ))}
        </div>
      </Field>

      <div className="flex justify-end border-t border-ds-border pt-4">
        <Button type="submit" loading={submitting}>{copy.submit}</Button>
      </div>
    </form>
  );
};

export default NewIssueForm;
