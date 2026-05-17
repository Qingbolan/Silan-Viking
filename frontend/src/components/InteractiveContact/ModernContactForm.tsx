import React, { useState } from 'react';
import { message } from 'antd';
import { Send, Mail, User as UserIcon, Building2, Briefcase, Lock, Globe } from 'lucide-react';
import { LoginOutlined } from '@ant-design/icons';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { useLanguage } from '../LanguageContext';
import { useAuth } from './AuthContext';
import { createIdeaComment } from '../../api/ideas/ideaApi';
import { getClientFingerprint } from '../../utils/fingerprint';
import {
  Segmented,
  Field,
  Input,
  Textarea,
  Switch,
  Button,
} from '../../components/ds';

interface ModernContactFormProps {
  onSuccess?: () => void;
  onMessageTypeChange?: (type: 'general' | 'job') => void;
  onMessageSent?: () => void;
}

/** Controlled form state for the job-opportunity fields. */
interface JobFields {
  recruiter_name: string;
  recruiter_title: string;
  company: string;
  company_email: string;
  position: string;
  send_resume: boolean;
}

const EMPTY_JOB: JobFields = {
  recruiter_name: '',
  recruiter_title: '',
  company: '',
  company_email: '',
  position: '',
  send_resume: false,
};

const ModernContactForm: React.FC<ModernContactFormProps> = ({ onSuccess, onMessageTypeChange, onMessageSent }) => {
  const [messageType, setMessageType] = useState<'general' | 'job'>('general');
  const [isPublic, setIsPublic] = useState(true);
  const [consentLogo, setConsentLogo] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Controlled form fields.
  const [body, setBody] = useState('');
  const [job, setJob] = useState<JobFields>(EMPTY_JOB);
  // Per-field error map — keyed by field name.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { language } = useLanguage();
  const { user, isAuthenticated, loginWithGoogle } = useAuth();

  const setJobField = <K extends keyof JobFields>(key: K, value: JobFields[K]) =>
    setJob((prev) => ({ ...prev, [key]: value }));

  const t = (en: string, zh: string) => (language === 'en' ? en : zh);

  /** Validate the active form; returns true when it may be submitted. */
  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!body.trim()) next.message = t('Message required', '请输入内容');
    if (messageType === 'job') {
      if (!job.recruiter_name.trim()) next.recruiter_name = t('Name required', '请输入您的姓名');
      if (!job.recruiter_title.trim()) next.recruiter_title = t('Title required', '请输入您的职位');
      if (!job.company.trim()) next.company = t('Company required', '请输入公司名称');
      if (!job.company_email.trim()) next.company_email = t('Company email required', '请输入公司邮箱');
      if (!job.position.trim()) next.position = t('Position required', '请输入职位名称');
      if (!emailVerified) next.company_email = t('Please verify your company email', '请验证您的公司邮箱');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const fingerprint = getClientFingerprint();
      let content = body;

      if (messageType === 'job') {
        const jobMetadata = {
          recruiter_name: job.recruiter_name,
          recruiter_title: job.recruiter_title,
          company: job.company,
          position: job.position,
          company_email: job.company_email,
          send_resume: job.send_resume,
          isPublic,
          consentCompanyLogo: consentLogo,
        };
        content = `${body}\n\n__METADATA__${JSON.stringify(jobMetadata)}`;
      }

      await createIdeaComment(
        'contact-page',
        content,
        fingerprint,
        {
          type: messageType,
          authorName: messageType === 'job' ? job.recruiter_name : (user?.username || 'Anonymous'),
          authorEmail: messageType === 'job' ? job.company_email : (user?.email || 'anonymous@example.com'),
          userIdentityId: user?.id,
          language: language as 'en' | 'zh',
        }
      );

      message.success(t('Message sent successfully!', '留言发送成功！'));
      setBody('');
      setJob(EMPTY_JOB);
      setEmailVerified(false);
      setErrors({});
      onSuccess?.();
      onMessageSent?.();
    } catch (error) {
      message.error(t('Failed to send message', '发送失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const verifyEmail = async () => {
    if (!job.company_email) {
      setErrors((p) => ({ ...p, company_email: t('Please enter company email', '请输入公司邮箱') }));
      return;
    }
    try {
      const response = await fetch('/api/v1/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: job.company_email }),
      });
      if (response.ok) {
        setEmailVerified(true);
        setErrors((p) => ({ ...p, company_email: '' }));
        message.success(t('Email verified!', '邮箱验证成功！'));
      } else {
        message.error(t('Verification failed', '验证失败'));
      }
    } catch (error) {
      message.error(t('Verification failed', '验证失败'));
    }
  };

  const handleGoogleLogin = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      message.error(t('Login failed', '登录失败'));
      return;
    }
    try {
      await loginWithGoogle(credentialResponse.credential);
      message.success(t('Login successful!', '登录成功！'));
    } catch (error) {
      message.error(t('Login failed', '登录失败'));
    }
  };

  const handleGoogleError = () => {
    message.error(t('Login failed', '登录失败'));
  };

  return (
    <div className="space-y-4">
      {/* Message Type Selector — ds Segmented, NUS-orange active state. */}
      <Segmented
        tone="primary"
        className="w-full [&>button]:flex-1"
        value={messageType}
        onChange={(v) => {
          const type = v as 'general' | 'job';
          setMessageType(type);
          setErrors({});
          onMessageTypeChange?.(type);
        }}
        options={[
          {
            value: 'general',
            icon: <Mail />,
            label: t('General Message', '一般留言'),
          },
          {
            value: 'job',
            icon: <Briefcase />,
            label: t('Job Opportunity', '工作机会'),
          },
        ]}
      />

      {/* Privacy Settings — only for job type. */}
      {messageType === 'job' && (
        <div className="rounded-ds-lg border border-ds-border bg-ds-surface-2 p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`rounded-ds-md p-1.5 ${isPublic ? 'bg-ds-success-soft' : 'bg-ds-surface-3'}`}>
                  {isPublic ? <Globe size={16} className="text-ds-success" /> : <Lock size={16} className="text-ds-fg-subtle" />}
                </div>
                <div>
                  <div className="text-ds-sm font-medium text-ds-fg">
                    {t('Display Publicly', '公开展示')}
                  </div>
                  <div className="text-ds-xs text-ds-fg-subtle">
                    {t('Show on public board after review', '审核后在公开留言板显示')}
                  </div>
                </div>
              </div>
              <Switch checked={isPublic} onChange={setIsPublic} />
            </div>

            {emailVerified && (
              <div className="flex items-center justify-between border-t border-ds-border pt-3">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-ds-md bg-ds-primary-soft p-1.5">
                    <Building2 size={16} className="text-ds-primary" />
                  </div>
                  <div>
                    <div className="text-ds-sm font-medium text-ds-fg">
                      {t('Display Company Logo', '展示公司标识')}
                    </div>
                    <div className="text-ds-xs text-ds-fg-subtle">
                      {t('Show company name and logo', '允许展示公司名称和 Logo')}
                    </div>
                  </div>
                </div>
                <Switch checked={consentLogo} onChange={setConsentLogo} disabled={!isPublic} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Login required for a general message. */}
      {!isAuthenticated && messageType === 'general' ? (
        <div className="space-y-4 py-8 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-ds-primary">
            <LoginOutlined className="text-2xl text-white" />
          </div>
          <div>
            <h3 className="mb-2 text-ds-lg font-semibold text-ds-fg">
              {t('Sign In', '登录')}
            </h3>
            <p className="mb-4 text-ds-sm text-ds-fg-muted">
              {t('Login to send messages and share your thoughts', '登录以发送留言和分享想法')}
            </p>
          </div>
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={handleGoogleLogin}
              onError={handleGoogleError}
              useOneTap
              theme="outline"
              size="large"
            />
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Job-specific fields. */}
          {messageType === 'job' && (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field error={errors.recruiter_name}>
                  <Input
                    leadingIcon={<UserIcon />}
                    placeholder={t('Your Name', '您的姓名')}
                    invalid={!!errors.recruiter_name}
                    value={job.recruiter_name}
                    onChange={(e) => setJobField('recruiter_name', e.target.value)}
                  />
                </Field>
                <Field error={errors.recruiter_title}>
                  <Input
                    leadingIcon={<UserIcon />}
                    placeholder={t('Your Title', '您的职位')}
                    invalid={!!errors.recruiter_title}
                    value={job.recruiter_title}
                    onChange={(e) => setJobField('recruiter_title', e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field error={errors.company}>
                  <Input
                    leadingIcon={<Building2 />}
                    placeholder={t('Company Name', '公司名称')}
                    invalid={!!errors.company}
                    value={job.company}
                    onChange={(e) => setJobField('company', e.target.value)}
                  />
                </Field>
                <Field error={errors.company_email}>
                  <div className="flex gap-2">
                    <Input
                      className="flex-1"
                      leadingIcon={<Mail />}
                      placeholder={t('Company Email', '公司邮箱')}
                      invalid={!!errors.company_email}
                      value={job.company_email}
                      onChange={(e) => setJobField('company_email', e.target.value)}
                    />
                    <Button
                      type="button"
                      variant={emailVerified ? 'outline' : 'primary'}
                      onClick={verifyEmail}
                      disabled={emailVerified}
                    >
                      {emailVerified ? `✓ ${t('Verified', '已验证')}` : t('Verify', '验证')}
                    </Button>
                  </div>
                </Field>
              </div>

              <Field error={errors.position}>
                <Input
                  leadingIcon={<Briefcase />}
                  placeholder={t('Position Title', '职位名称')}
                  invalid={!!errors.position}
                  value={job.position}
                  onChange={(e) => setJobField('position', e.target.value)}
                />
              </Field>

              <Switch
                checked={job.send_resume}
                onChange={(v) => setJobField('send_resume', v)}
                disabled={!emailVerified}
                label={t('Send my resume to this email', '向此邮箱发送我的简历')}
              />
            </>
          )}

          {/* Message body. */}
          <Field error={errors.message}>
            <Textarea
              rows={6}
              invalid={!!errors.message}
              placeholder={
                messageType === 'job'
                  ? t('Job description and responsibilities…', '职位描述及职责要求…')
                  : t('Your message…', '您的留言…')
              }
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>

          {/* Submit. */}
          <Button
            type="submit"
            block
            size="lg"
            loading={submitting}
            leadingIcon={<Send />}
          >
            {t('Send Message', '发送留言')}
          </Button>
        </form>
      )}
    </div>
  );
};

export default ModernContactForm;
