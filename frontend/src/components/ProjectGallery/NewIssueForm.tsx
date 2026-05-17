import React, { useState, useEffect } from 'react';
import {
  Bug,
  Lightbulb,
  HelpCircle,
  FileText,
  User
} from 'lucide-react';
import { 
  Button,
  Input,
  Select,
  Tag,
  message,
  Form,
  Radio,
  Space,
  Alert,
  Avatar
} from 'antd';
import { useLanguage } from '../LanguageContext';
import { getClientFingerprint } from '../../utils/fingerprint';
import {
  createProjectIssue,
  type ProjectIssueRecord
} from '../../api/projects/projectApi';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';

const { TextArea } = Input;
const { Option } = Select;

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface NewIssueFormProps {
  projectId: string;
  onIssueCreated: (issue: ProjectIssueRecord) => void;
  onSuccess?: () => void;
}

const NewIssueForm: React.FC<NewIssueFormProps> = ({
  projectId,
  onIssueCreated,
  onSuccess
}) => {
  const { language, t } = useLanguage();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [fingerprint, setFingerprint] = useState<string>('');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);

  // Initialize fingerprint and check existing auth
  useEffect(() => {
    const initFingerprint = async () => {
      const fp = await getClientFingerprint();
      setFingerprint(fp);
    };
    initFingerprint();

    // Check for existing authentication from localStorage
    const getCurrentUser = () => {
      try {
        const raw = localStorage.getItem('auth_user');
        if (!raw) return null;
        const rawUser = JSON.parse(raw);
        if (rawUser && (rawUser.id || rawUser.email || rawUser.name)) {
          // Ensure consistent mapping for existing users
          const user: User = {
            id: rawUser.id || rawUser.sub || rawUser.user_id,
            name: rawUser.name || rawUser.given_name || 'User',
            email: rawUser.email,
            avatar: rawUser.avatar || rawUser.picture || rawUser.avatar_url
          };
          return user;
        }
      } catch {}
      return null;
    };

    const existingUser = getCurrentUser();
    if (existingUser) {
      console.log('Loading existing user from localStorage:', existingUser);
      setUser(existingUser);
    }
  }, []);

  const issueTypes = [
    { value: 'bug', label: 'Bug Report', icon: Bug, color: 'red', description: 'Report a bug or issue' },
    { value: 'enhancement', label: 'Feature Request', icon: Lightbulb, color: 'blue', description: 'Suggest a new feature' },
    { value: 'question', label: 'Question', icon: HelpCircle, color: 'blue', description: 'Ask a question' },
    { value: 'documentation', label: 'Documentation', icon: FileText, color: 'green', description: 'Documentation improvement' }
  ];

  const availableLabels = [
    'bug', 'enhancement', 'documentation', 'question', 'high-priority', 'low-priority',
    'ui', 'api', 'authentication', 'performance', 'security', 'accessibility'
  ];

  const priorityOptions = [
    { value: 'low', label: 'Low Priority', color: 'cyan' },
    { value: 'medium', label: 'Medium Priority', color: 'orange' },
    { value: 'high', label: 'High Priority', color: 'volcano' }
  ];

  // Handle Google OAuth login with backend verification
  const handleGoogleLogin = async (credentialResponse: CredentialResponse) => {
    const idToken = credentialResponse?.credential;
    if (!idToken) {
      message.error(t('auth.loginFailed'));
      return;
    }

    try {
      const resp = await fetch(`/api/v1/auth/google/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(errorText || `HTTP ${resp.status}`);
      }

      const rawUser = await resp.json();
      console.log('Google login response user data:', rawUser);

      // Map the response to our User interface format
      const user: User = {
        id: rawUser.id || rawUser.sub || rawUser.user_id,
        name: rawUser.name || rawUser.given_name || 'User',
        email: rawUser.email,
        avatar: rawUser.avatar || rawUser.picture || rawUser.avatar_url
      };

      console.log('Mapped user data:', user);
      setUser(user);

      // Persist to localStorage for sharing across components
      try {
        localStorage.setItem('auth_user', JSON.stringify(user));
      } catch {}

      message.success(t('auth.loginSuccess'));
    } catch (error) {
      console.error('Google login failed:', error);
      message.error(t('auth.loginFailed'));
    }
  };

  const handleSubmit = async (values: any) => {
    console.log('Form values:', values);
    console.log('Project ID:', projectId);
    console.log('User data for issue creation:', user);
    console.log('Fingerprint:', fingerprint);

    if (!user) {
      message.error('Please sign in with Google to create an issue');
      return;
    }

    if (!fingerprint) {
      message.error('Please wait for initialization to complete');
      return;
    }

    setSubmitting(true);
    try {
      console.log('Creating issue with payload:', {
        projectId,
        title: values.title,
        description: values.description,
        issueType: values.issueType,
        priority: values.priority,
        labels: values.labels || [],
        fingerprint,
        authorName: user.name,
        authorEmail: user.email,
        userIdentityId: user.id,
        language: language as 'en' | 'zh'
      });

      const newIssue = await createProjectIssue({
        projectId,
        title: values.title,
        description: values.description,
        issueType: values.issueType,
        priority: values.priority,
        labels: values.labels || [],
        fingerprint,
        authorName: user.name,
        authorEmail: user.email,
        userIdentityId: user.id,
        language: language as 'en' | 'zh'
      });

      console.log('Issue created successfully:', newIssue);
      message.success('Issue created successfully!');
      onIssueCreated(newIssue);
      onSuccess?.();
    } catch (error) {
      console.error('Failed to create issue:', error);
      message.error(`Failed to create issue: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLabelToggle = (label: string) => {
    const newLabels = selectedLabels.includes(label)
      ? selectedLabels.filter(l => l !== label)
      : [...selectedLabels, label];
    setSelectedLabels(newLabels);
    form.setFieldValue('labels', newLabels);
  };

  return (
    <div className="space-y-6">

      {!user ? (
        // Authentication Required Section
        <div className="text-center">
            <div className="max-w-md mx-auto">
              <div className="mb-6">
                <Avatar size={64} icon={<User className="w-8 h-8" />} className="mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-theme-primary mb-2">
                  {t('auth.signInToCreateIssue')}
                </h3>
                <p className="text-theme-secondary">
                  {t('auth.pleaseSignInToCreateIssue')}
                </p>
              </div>

              <Alert
                message={t('auth.authenticationRequired')}
                description={t('auth.signInToParticipate')}
                type="info"
                showIcon
                className="mb-6 text-left"
              />

              <div className="space-y-4">
                <GoogleLogin
                  onSuccess={handleGoogleLogin}
                  onError={() => message.error(t('auth.loginFailed'))}
                  text="signin_with"
                  shape="rectangular"
                  size="large"
                  width="300"
                />

                <div className="text-xs text-theme-tertiary">
                  {t('auth.agreeToTerms')}
                </div>
              </div>
            </div>
          </div>
      ) : (
        // Issue Creation Form (only shown after login)
        <div>
            {/* User Welcome Section */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-3">
                <Avatar src={user.avatar} size={40}>
                  {user.name[0]?.toUpperCase()}
                </Avatar>
                <div>
                  <p className="font-medium text-green-800">
                    {language === 'zh' ? `欢迎，${user.name}！` : `Welcome, ${user.name}!`}
                  </p>
                  <p className="text-sm text-green-600">
                    {language === 'zh' ? '您现在可以为此项目创建和跟踪问题。' : 'You can now create and track issues for this project.'}
                    <Button
                      size="small"
                      className="ml-3"
                      onClick={() => {
                        try {
                          localStorage.removeItem('auth_user');
                        } catch {};
                        setUser(null);
                      }}
                    >
                      {t('auth.logout')}
                    </Button>
                  </p>
                </div>
              </div>
            </div>

            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              initialValues={{
                issueType: 'bug',
                priority: 'medium',
                labels: []
              }}
            >
          {/* Issue Type Selection */}
          <Form.Item
            name="issueType"
            label={<span className="text-theme-primary font-medium">Issue Type</span>}
            rules={[{ required: true, message: 'Please select an issue type' }]}
          >
            <Radio.Group className="w-full">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {issueTypes.map((issueType) => {
                  const IconComponent = issueType.icon;
                  return (
                    <Radio.Button
                      key={issueType.value}
                      value={issueType.value}
                      className="h-auto p-4 text-left"
                    >
                      <div className="flex items-start gap-3">
                        <IconComponent className={`w-5 h-5 text-${issueType.color}-500 flex-shrink-0 mt-0.5`} />
                        <div>
                          <h4 className="font-medium text-theme-primary">{issueType.label}</h4>
                          <p className="text-sm text-theme-secondary">{issueType.description}</p>
                        </div>
                      </div>
                    </Radio.Button>
                  );
                })}
              </div>
            </Radio.Group>
          </Form.Item>

          {/* Title */}
          <Form.Item
            name="title"
            label={<span className="text-theme-primary font-medium">Title</span>}
            rules={[
              { required: true, message: 'Please enter a title' },
              { min: 5, message: 'Title must be at least 5 characters' }
            ]}
          >
            <Input
              placeholder="Brief summary of the issue"
              size="large"
            />
          </Form.Item>

          {/* Description */}
          <Form.Item
            name="description"
            label={<span className="text-theme-primary font-medium">Description</span>}
            rules={[
              { required: true, message: 'Please enter a description' },
              { min: 10, message: 'Description must be at least 10 characters' }
            ]}
          >
            <TextArea
              placeholder="Detailed description of the issue. Include steps to reproduce for bugs, or detailed requirements for feature requests."
              rows={6}
              showCount
              maxLength={2000}
            />
          </Form.Item>

          {/* Priority */}
          <Form.Item
            name="priority"
            label={<span className="text-theme-primary font-medium">Priority</span>}
          >
            <Select size="large">
              {priorityOptions.map(option => (
                <Option key={option.value} value={option.value}>
                  <Space>
                    <Tag color={option.color}>{option.label}</Tag>
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>

          {/* Labels */}
          <Form.Item
            name="labels"
            label={<span className="text-theme-primary font-medium">Labels (Optional)</span>}
          >
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {availableLabels.map(label => (
                  <Tag.CheckableTag
                    key={label}
                    checked={selectedLabels.includes(label)}
                    onChange={() => handleLabelToggle(label)}
                  >
                    {label}
                  </Tag.CheckableTag>
                ))}
              </div>
              {selectedLabels.length > 0 && (
                <div className="text-sm text-theme-secondary">
                  Selected: {selectedLabels.join(', ')}
                </div>
              )}
            </div>
          </Form.Item>

          {/* Submit Button */}
          <Form.Item className="mb-0">
            <div className="flex justify-end gap-3 pt-4 border-t border-theme-border">
              <Button
                type="primary"
                htmlType="submit"
                loading={submitting}
                disabled={!fingerprint}
                size="large"
                className="bg-green-600 hover:bg-green-700"
              >
                {language === 'zh' ? '创建问题' : 'Create Issue'}
              </Button>
            </div>
          </Form.Item>

          </Form>
        </div>
      )}
    </div>
  );
};

export default NewIssueForm;
