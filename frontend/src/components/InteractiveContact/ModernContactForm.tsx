import React, { useState } from 'react';
import { Form, Input, Button, Switch, message, Card } from 'antd';
import { Send, Mail, User as UserIcon, Building2, Briefcase, Lock, Globe } from 'lucide-react';
import { LoginOutlined } from '@ant-design/icons';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { useLanguage } from '../LanguageContext';
import { useAuth } from './AuthContext';
import { createIdeaComment } from '../../api/ideas/ideaApi';
import { getClientFingerprint } from '../../utils/fingerprint';

const { TextArea } = Input;

interface ModernContactFormProps {
  onSuccess?: () => void;
  onMessageTypeChange?: (type: 'general' | 'job') => void;
  onMessageSent?: () => void;
}

const ModernContactForm: React.FC<ModernContactFormProps> = ({ onSuccess, onMessageTypeChange, onMessageSent }) => {
  const [form] = Form.useForm();
  const [messageType, setMessageType] = useState<'general' | 'job'>('general');
  const [isPublic, setIsPublic] = useState(true);
  const [consentLogo, setConsentLogo] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { language } = useLanguage();
  const { user, isAuthenticated, loginWithGoogle } = useAuth();

  const handleSubmit = async (values: any) => {
    if (messageType === 'job' && !emailVerified) {
      message.error(language === 'en' ? 'Please verify your company email' : '请验证您的公司邮箱');
      return;
    }

    setSubmitting(true);
    try {
      const fingerprint = getClientFingerprint();

      // Build the message content based on message type
      let content = values.message;

      // For job type, include additional metadata in content
      if (messageType === 'job') {
        const jobMetadata = {
          recruiter_name: values.recruiter_name,
          recruiter_title: values.recruiter_title,
          company: values.company,
          position: values.position,
          company_email: values.company_email,
          send_resume: values.send_resume,
          isPublic,
          consentCompanyLogo: consentLogo,
        };
        content = `${values.message}\n\n__METADATA__${JSON.stringify(jobMetadata)}`;
      }

      // Use unified Idea Comments API with virtual idea ID "contact-page"
      await createIdeaComment(
        'contact-page',
        content,
        fingerprint,
        {
          type: messageType,
          authorName: messageType === 'job' ? values.recruiter_name : (user?.username || 'Anonymous'),
          authorEmail: messageType === 'job' ? values.company_email : (user?.email || 'anonymous@example.com'),
          userIdentityId: user?.id,
          language: language as 'en' | 'zh',
        }
      );

      message.success(language === 'en' ? 'Message sent successfully!' : '留言发送成功！');
      form.resetFields();
      setEmailVerified(false);
      onSuccess?.();
      onMessageSent?.();
    } catch (error) {
      message.error(language === 'en' ? 'Failed to send message' : '发送失败');
    } finally {
      setSubmitting(false);
    }
  };

  const verifyEmail = async () => {
    const email = form.getFieldValue('company_email');
    if (!email) {
      message.error(language === 'en' ? 'Please enter company email' : '请输入公司邮箱');
      return;
    }

    try {
      const response = await fetch('/api/v1/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        setEmailVerified(true);
        message.success(language === 'en' ? 'Email verified!' : '邮箱验证成功！');
      } else {
        message.error(language === 'en' ? 'Verification failed' : '验证失败');
      }
    } catch (error) {
      message.error(language === 'en' ? 'Verification failed' : '验证失败');
    }
  };

  const handleGoogleLogin = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      message.error(language === 'en' ? 'Login failed' : '登录失败');
      return;
    }

    try {
      await loginWithGoogle(credentialResponse.credential);
      message.success(language === 'en' ? 'Login successful!' : '登录成功！');
    } catch (error) {
      message.error(language === 'en' ? 'Login failed' : '登录失败');
    }
  };

  const handleGoogleError = () => {
    message.error(language === 'en' ? 'Login failed' : '登录失败');
  };

  return (
    <div className="space-y-4">
      {/* Message Type Selector */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setMessageType('general');
            onMessageTypeChange?.('general');
          }}
          className={`flex-1 py-3 px-4 rounded-xl font-medium text-sm transition-all duration-300 ${
            messageType === 'general'
              ? 'bg-theme-primary text-white shadow-md'
              : 'bg-theme-surface-elevated text-theme-secondary hover:bg-theme-hover'
          }`}
        >
          <Mail className="inline-block mr-1.5" size={16} />
          {language === 'en' ? 'General Message' : '一般留言'}
        </button>
        <button
          type="button"
          onClick={() => {
            setMessageType('job');
            onMessageTypeChange?.('job');
          }}
          className={`flex-1 py-3 px-4 rounded-xl font-medium text-sm transition-all duration-300 ${
            messageType === 'job'
              ? 'bg-theme-primary text-white shadow-md'
              : 'bg-theme-surface-elevated text-theme-secondary hover:bg-theme-hover'
          }`}
        >
          <Briefcase className="inline-block mr-1.5" size={16} />
          {language === 'en' ? 'Job Opportunity' : '工作机会'}
        </button>
      </div>

      {/* Privacy Settings - Only for job type */}
      {messageType === 'job' && (
        <Card className="bg-theme-surface-elevated border-0 rounded-xl" styles={{ body: { padding: '16px' } }}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`p-1.5 rounded-lg ${isPublic ? 'bg-theme-success-20' : 'bg-theme-surface'}`}>
                  {isPublic ? <Globe size={16} className="text-theme-success" /> : <Lock size={16} className="text-theme-tertiary" />}
                </div>
                <div>
                  <div className="font-medium text-theme-primary text-sm">
                    {language === 'en' ? 'Display Publicly' : '公开展示'}
                  </div>
                  <div className="text-xs text-theme-tertiary">
                    {language === 'en'
                      ? 'Show on public board after review'
                      : '审核后在公开留言板显示'}
                  </div>
                </div>
              </div>
              <Switch checked={isPublic} onChange={setIsPublic} />
            </div>

            {emailVerified && (
              <div className="flex items-center justify-between pt-3 border-t border-theme-card">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-theme-primary-20">
                    <Building2 size={16} className="text-theme-accent" />
                  </div>
                  <div>
                    <div className="font-medium text-theme-primary text-sm">
                      {language === 'en' ? 'Display Company Logo' : '展示公司标识'}
                    </div>
                    <div className="text-xs text-theme-tertiary">
                      {language === 'en'
                        ? 'Show company name and logo'
                        : '允许展示公司名称和 Logo'}
                    </div>
                  </div>
                </div>
                <Switch checked={consentLogo} onChange={setConsentLogo} disabled={!isPublic} />
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Login Required for General Message */}
      {!isAuthenticated && messageType === 'general' ? (
        <div className="text-center py-8 space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-gradient-primary flex items-center justify-center">
            <LoginOutlined className="text-white text-2xl" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-theme-primary mb-2">
              {language === 'en' ? 'Sign In' : '登录'}
            </h3>
            <p className="text-sm text-theme-secondary mb-4">
              {language === 'en'
                ? 'Login to send messages and share your thoughts'
                : '登录以发送留言和分享想法'}
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
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          className="space-y-4"
        >

        {/* Job-specific fields */}
        {messageType === 'job' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Form.Item
                name="recruiter_name"
                rules={[{ required: true, message: language === 'en' ? 'Name required' : '请输入您的姓名' }]}
              >
                <Input
                  prefix={<UserIcon size={18} className="text-theme-tertiary" />}
                  placeholder={language === 'en' ? 'Your Name' : '您的姓名'}
                  size="large"
                  className="rounded-xl"
                />
              </Form.Item>

              <Form.Item
                name="recruiter_title"
                rules={[{ required: true, message: language === 'en' ? 'Title required' : '请输入您的职位' }]}
              >
                <Input
                  prefix={<UserIcon size={18} className="text-theme-tertiary" />}
                  placeholder={language === 'en' ? 'Your Title' : '您的职位'}
                  size="large"
                  className="rounded-xl"
                />
              </Form.Item>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Form.Item
                name="company"
                rules={[{ required: true, message: language === 'en' ? 'Company required' : '请输入公司名称' }]}
              >
                <Input
                  prefix={<Building2 size={18} className="text-theme-tertiary" />}
                  placeholder={language === 'en' ? 'Company Name' : '公司名称'}
                  size="large"
                  className="rounded-xl"
                />
              </Form.Item>

              <Form.Item
                name="company_email"
                rules={[
                  { required: true, message: language === 'en' ? 'Company email required' : '请输入公司邮箱' },
                  { type: 'email' },
                ]}
              >
                <div className="flex gap-2">
                  <Input
                    prefix={<Mail size={18} className="text-theme-tertiary" />}
                    placeholder={language === 'en' ? 'Company Email' : '公司邮箱'}
                    size="large"
                    className="rounded-xl flex-1"
                  />
                  <Button
                    type={emailVerified ? 'default' : 'primary'}
                    size="large"
                    onClick={verifyEmail}
                    disabled={emailVerified}
                    className="rounded-xl px-6"
                  >
                    {emailVerified ? '✓ Verified' : 'Verify'}
                  </Button>
                </div>
              </Form.Item>
            </div>

            <Form.Item
              name="position"
              rules={[{ required: true, message: language === 'en' ? 'Position required' : '请输入职位名称' }]}
            >
              <Input
                prefix={<Briefcase size={18} className="text-theme-tertiary" />}
                placeholder={language === 'en' ? 'Position Title' : '职位名称'}
                size="large"
                className="rounded-xl"
              />
            </Form.Item>

            <Form.Item name="send_resume" valuePropName="checked">
              <div className="flex items-center gap-2 text-theme-secondary">
                <Switch disabled={!emailVerified} />
                <span>{language === 'en' ? 'Send my resume to this email' : '向此邮箱发送我的简历'}</span>
              </div>
            </Form.Item>
          </>
        )}

        {/* Message */}
        <Form.Item
          name="message"
          rules={[{ required: true, message: language === 'en' ? 'Message required' : '请输入内容' }]}
        >
          <TextArea
            placeholder={
              messageType === 'job'
                ? (language === 'en' ? 'Job description and responsibilities...' : '职位描述及职责要求...')
                : (language === 'en' ? 'Your message...' : '您的留言...')
            }
            rows={6}
            className="rounded-xl"
          />
        </Form.Item>

          {/* Submit */}
          <Button
            type="primary"
            htmlType="submit"
            loading={submitting}
            size="large"
            icon={<Send size={20} />}
            className="w-full h-14 rounded-xl font-semibold text-lg"
            style={{
              background: 'var(--color-gradientPrimary)',
              border: 'none',
            }}
          >
            {language === 'en' ? 'Send Message' : '发送留言'}
          </Button>
        </Form>
      )}
    </div>
  );
};

export default ModernContactForm;
