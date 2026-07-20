import React, { useState } from 'react';
import { Send, Mail, User as UserIcon, Building2, Briefcase, Lock, Globe, LogIn } from 'lucide-react';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { useLanguage } from '../LanguageContext';
import { useAuth } from './AuthContext';
import { createContactMessage } from '../../api/contact/contactApi';
import { apiUrl } from '../../api/utils';
import { getClientFingerprint } from '../../utils/fingerprint';
import {
  Segmented,
  Field,
  Input,
  Textarea,
  Switch,
  Button,
  Spinner,
  useToast,
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
}

const EMPTY_JOB: JobFields = {
  recruiter_name: '',
  recruiter_title: '',
  company: '',
  company_email: '',
  position: '',
};

const ModernContactForm: React.FC<ModernContactFormProps> = ({ onSuccess, onMessageTypeChange, onMessageSent }) => {
  const [messageType, setMessageType] = useState<'general' | 'job'>('general');
  const [isPublic, setIsPublic] = useState(false);
  const [consentLogo, setConsentLogo] = useState(false);
  const [companyDomainAccepted, setCompanyDomainAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Controlled form fields.
  const [body, setBody] = useState('');
  const [job, setJob] = useState<JobFields>(EMPTY_JOB);
  // Per-field error map — keyed by field name.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { language } = useLanguage();
  const { user, isAuthenticated, loading: authLoading, loginWithGoogle } = useAuth();
  const toast = useToast();

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
      if (!companyDomainAccepted) next.company_email = t('Validate the company email domain', '请校验企业邮箱域名');
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
      await createContactMessage({
        type: messageType,
        author_name: messageType === 'job' ? job.recruiter_name : user?.username,
        author_email: messageType === 'job' ? job.company_email : user?.email,
        message: body.trim(),
        company: messageType === 'job' ? job.company : undefined,
        company_email: messageType === 'job' ? job.company_email : undefined,
        position: messageType === 'job' ? job.position : undefined,
        recruiter_name: messageType === 'job' ? job.recruiter_name : undefined,
        recruiter_title: messageType === 'job' ? job.recruiter_title : undefined,
        is_public: isPublic,
        consent_company_logo: messageType === 'job' ? consentLogo : false,
        fingerprint,
      });

      toast.success(t('Message sent', '留言已发送'));
      setBody('');
      setJob(EMPTY_JOB);
      setIsPublic(false);
      setConsentLogo(false);
      setCompanyDomainAccepted(false);
      setErrors({});
      onSuccess?.();
      onMessageSent?.();
    } catch (error) {
      toast.error(t('Message could not be sent', '留言发送失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const validateCompanyDomain = async () => {
    if (!job.company_email) {
      setErrors((p) => ({ ...p, company_email: t('Please enter company email', '请输入公司邮箱') }));
      return;
    }
    try {
      const response = await fetch(apiUrl('/api/v1/auth/verify-email'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: job.company_email }),
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.valid) {
        setCompanyDomainAccepted(true);
        setErrors((p) => ({ ...p, company_email: '' }));
        toast.success(t('Company domain accepted', '企业邮箱域名有效'));
      } else {
        setCompanyDomainAccepted(false);
        setErrors((p) => ({
          ...p,
          company_email: payload?.message || t('Use a valid company email', '请使用有效的公司邮箱'),
        }));
      }
    } catch (error) {
      setCompanyDomainAccepted(false);
      setErrors((p) => ({
        ...p,
        company_email: t('Email check is unavailable. Try again.', '邮箱检查暂不可用，请重试'),
      }));
    }
  };

  const handleGoogleLogin = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      toast.error(t('Sign-in failed', '登录失败'));
      return;
    }
    try {
      await loginWithGoogle(credentialResponse.credential);
      toast.success(t('Signed in', '登录成功'));
    } catch (error) {
      toast.error(t('Sign-in failed', '登录失败'));
    }
  };

  const handleGoogleError = () => {
    toast.error(t('Sign-in failed', '登录失败'));
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

      {/* Publication is always explicit and privacy-preserving by default. */}
      <div className="rounded-ds-lg border border-ds-border bg-ds-surface-2 p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`rounded-ds-md p-1.5 ${isPublic ? 'bg-ds-success-soft' : 'bg-ds-surface-3'}`}>
                  {isPublic ? <Globe size={16} className="text-ds-success" /> : <Lock size={16} className="text-ds-fg-subtle" />}
                </div>
                <div>
                  <div className="text-ds-sm font-medium text-ds-fg">
                    {t('Publish on the message wall', '发布到公开留言墙')}
                  </div>
                  <div className="text-ds-xs text-ds-fg-subtle">
                    {isPublic
                      ? t('Anyone can read this message', '任何人都可以阅读这条留言')
                      : t('Only Silan can read this message', '仅 Silan 可以阅读这条留言')}
                  </div>
                </div>
              </div>
              <Switch
                checked={isPublic}
                onChange={setIsPublic}
                ariaLabel={t('Publish on the public message wall', '发布到公开留言墙')}
              />
            </div>

            {messageType === 'job' && companyDomainAccepted && (
              <div className="flex items-center justify-between border-t border-ds-border pt-3">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-ds-md bg-ds-primary-soft p-1.5">
                    <Building2 size={16} className="text-ds-primary" />
                  </div>
                  <div>
                    <div className="text-ds-sm font-medium text-ds-fg">
                      {t('Display Company Name', '展示公司名称')}
                    </div>
                    <div className="text-ds-xs text-ds-fg-subtle">
                      {t('Show the company name on the public message', '允许在公开留言中展示公司名称')}
                    </div>
                  </div>
                </div>
                <Switch
                  checked={consentLogo}
                  onChange={setConsentLogo}
                  disabled={!isPublic}
                  ariaLabel={t('Display company name publicly', '公开展示公司名称')}
                />
              </div>
            )}
          </div>
      </div>

      {/* Login required for a general message. */}
      {authLoading && messageType === 'general' ? (
        <div className="flex min-h-48 items-center justify-center" aria-live="polite">
          <Spinner label={t('Checking sign-in session', '正在检查登录状态')} />
        </div>
      ) : !isAuthenticated && messageType === 'general' ? (
        <div className="space-y-4 py-8 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-ds-primary">
            <LogIn className="size-7 text-white" aria-hidden />
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
                      onChange={(e) => {
                        setJobField('company_email', e.target.value);
                        setCompanyDomainAccepted(false);
                      }}
                    />
                    <Button
                      type="button"
                      variant={companyDomainAccepted ? 'outline' : 'primary'}
                      onClick={validateCompanyDomain}
                      disabled={companyDomainAccepted}
                    >
                      {companyDomainAccepted ? `✓ ${t('Valid domain', '域名有效')}` : t('Validate domain', '校验域名')}
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
