import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Heart,
  Send,
  Calendar,
  User,
  MoreHorizontal,
  CheckCircle,
  AlertCircle,
  Github
} from 'lucide-react';
import { Button, Input, Avatar, Dropdown, Tag, Popconfirm, message } from 'antd';
import { useLanguage } from '../LanguageContext';
import { getClientFingerprint } from '../../utils/fingerprint';
import {
  createProjectComment,
  likeProjectComment,
  deleteProjectComment,
  fetchProjectIssueThread,
  projectIssueFromComment,
  type ProjectCommentData,
  type ProjectIssueRecord
} from '../../api/projects/projectApi';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';

const { TextArea } = Input;

interface ProjectIssueDiscussionProps {
  projectId: string;
  issueId?: string;
  issueTitle?: string;
  issueStatus?: 'open' | 'closed';
  issueAuthor?: string;
  issueCreated?: string;
  issueLabels?: string[];
}

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

const ProjectIssueDiscussion: React.FC<ProjectIssueDiscussionProps> = ({
  projectId,
  issueId = "sample-issue-1",
  issueTitle = "Sample Issue Title",
  issueStatus = "open",
  issueAuthor = "Developer",
  issueCreated = "2025-09-20",
  issueLabels = ["bug", "high-priority"]
}) => {
  const { language, t } = useLanguage();
  const [comments, setComments] = useState<ProjectCommentData[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [fingerprint, setFingerprint] = useState<string>('');
  const [issueDetails, setIssueDetails] = useState<ProjectIssueRecord | null>(null);

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
      console.log('Loading existing user from localStorage (Discussion):', existingUser);
      setUser(existingUser);
    }
  }, []);

  // Load comments for issue type
  const loadComments = async () => {
    setLoading(true);
    try {
      const thread = await fetchProjectIssueThread(projectId, issueId, {
        fingerprint,
        userIdentityId: user?.id,
        language: language as 'en' | 'zh'
      });

      if (thread) {
        setIssueDetails(projectIssueFromComment(thread));
        setComments(thread.replies ?? []);
      } else {
        setIssueDetails(null);
        setComments([]);
      }
    } catch (error) {
      console.error('Failed to load issue comments:', error);
      message.error(t('comments.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComments();
  }, [projectId, fingerprint, user?.id, language]);

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
      console.log('Google login response user data (Discussion):', rawUser);

      // Map the response to our User interface format
      const user: User = {
        id: rawUser.id || rawUser.sub || rawUser.user_id,
        name: rawUser.name || rawUser.given_name || 'User',
        email: rawUser.email,
        avatar: rawUser.avatar || rawUser.picture || rawUser.avatar_url
      };

      console.log('Mapped user data (Discussion):', user);
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

  // Submit new comment
  const handleSubmitComment = async () => {
    if (!newComment.trim() || !fingerprint) return;

    setSubmitting(true);
    try {
      await createProjectComment(
        projectId,
        newComment.trim(),
        fingerprint,
        {
          type: 'issue',
          authorName: user?.name,
          authorEmail: user?.email,
          userIdentityId: user?.id,
          parentId: issueId,
          language: language as 'en' | 'zh'
        }
      );

      setNewComment('');
      message.success(t('comments.submitted'));
      await loadComments();
    } catch (error) {
      console.error('Failed to submit comment:', error);
      message.error(t('comments.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  // Handle like/unlike comment
  const handleLikeComment = async (commentId: string) => {
    try {
      await likeProjectComment(commentId, fingerprint, user?.id, language as 'en' | 'zh');
      await loadComments();
    } catch (error) {
      console.error('Failed to like comment:', error);
      message.error(t('comments.likeFailed'));
    }
  };

  // Handle delete comment
  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteProjectComment(commentId, {
        fingerprint,
        userIdentityId: user?.id,
        language: language as 'en' | 'zh'
      });
      message.success(t('comments.deleted'));
      await loadComments();
    } catch (error) {
      console.error('Failed to delete comment:', error);
      message.error(t('comments.deleteFailed'));
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US');
  };

  const getStatusIcon = (status: string) => {
    return status === 'open' ? (
      <AlertCircle className="w-4 h-4 text-green-600" />
    ) : (
      <CheckCircle className="w-4 h-4 text-theme-accent" />
    );
  };

  const getStatusColor = (status: string) => {
    return status === 'open' ? 'green' : 'blue';
  };

  const getLabelColor = (label: string) => {
    const colors: Record<string, string> = {
      'bug': 'red',
      'enhancement': 'blue',
      'documentation': 'geekblue',
      'question': 'orange',
      'high-priority': 'volcano',
      'low-priority': 'cyan'
    };
    return colors[label] || 'default';
  };

  const displayTitle = issueDetails?.title ?? issueTitle;
  const displayStatus = issueDetails?.status ?? issueStatus;
  const displayAuthor = issueDetails?.author ?? issueAuthor;
  const displayCreated = issueDetails?.created ?? issueCreated;
  const displayLabels = issueDetails?.labels ?? issueLabels;

  const canDeleteComment = (comment: ProjectCommentData) => {
    return Boolean(user?.id && comment.user_identity_id === user.id);
  };

  return (
    <div className="space-y-6">
      {/* Issue Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <Avatar icon={<Github className="w-6 h-6" />} size={40} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-xl font-semibold text-gray-900">{displayTitle}</h1>
              <Tag
                icon={getStatusIcon(displayStatus)}
                color={getStatusColor(displayStatus)}
                className="capitalize"
              >
                {displayStatus}
              </Tag>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
              <span className="flex items-center gap-1">
                <User className="w-4 h-4" />
                {displayAuthor}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {formatDate(displayCreated)}
              </span>
              <span>#{issueId}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {displayLabels.map((label, index) => (
                <Tag key={index} color={getLabelColor(label)}>
                  {label}
                </Tag>
              ))}
              {issueDetails?.priority && (
                <Tag color="gold">
                  Priority: {issueDetails.priority}
                </Tag>
              )}
            </div>
          </div>
        </div>
        {issueDetails?.description && (
          <div className="mt-4 text-gray-700 whitespace-pre-line border-t border-gray-100 pt-4">
            {issueDetails.description}
          </div>
        )}
      </div>

      {/* Comments Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <MessageSquare className="w-5 h-5" />
          {t('projects.discussion')} ({comments.length})
        </div>

        {/* Comments List */}
        <AnimatePresence>
          {comments.map((comment, index) => (
            <motion.div
              key={comment.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white border border-gray-200 rounded-lg"
            >
              <div className="p-4 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar
                      src={comment.author_avatar_url}
                      size={32}
                      className="bg-gray-100"
                    >
                      {comment.author_name[0]?.toUpperCase()}
                    </Avatar>
                    <div>
                      <span className="font-medium text-gray-900">
                        {comment.author_name}
                      </span>
                      <span className="text-sm text-gray-500 ml-2">
                        {formatDate(comment.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="text"
                      size="small"
                      icon={<Heart className={`w-4 h-4 ${comment.is_liked_by_user ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />}
                      onClick={() => handleLikeComment(comment.id)}
                      className="flex items-center gap-1"
                    >
                      {comment.likes_count}
                    </Button>

                    {canDeleteComment(comment) && (
                      <Dropdown
                        menu={{
                          items: [
                            {
                              key: 'delete',
                              label: (
                                <Popconfirm
                                  title={t('comments.confirmDelete')}
                                  onConfirm={() => handleDeleteComment(comment.id)}
                                  okText={t('common.yes')}
                                  cancelText={t('common.no')}
                                >
                                  <span className="text-red-600">{t('common.delete')}</span>
                                </Popconfirm>
                              ),
                            }
                          ]
                        }}
                        trigger={['click']}
                      >
                        <Button type="text" size="small" icon={<MoreHorizontal className="w-4 h-4" />} />
                      </Dropdown>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4">
                <div className="prose prose-sm max-w-none text-gray-700">
                  {comment.content}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <div className="text-center py-8 text-gray-500">
            {t('common.loading')}...
          </div>
        )}

        {comments.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-500">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>{t('comments.noComments')}</p>
          </div>
        )}
      </div>

      {/* New Comment Form */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-start gap-4">
          <Avatar
            src={user?.avatar}
            size={40}
            className="bg-gray-100 flex-shrink-0"
          >
            {user?.name?.[0]?.toUpperCase() || '?'}
          </Avatar>
          <div className="flex-1 space-y-4">
            <TextArea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={t('comments.placeholder')}
              rows={4}
              className="resize-none"
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {!user && (
                  <GoogleLogin
                    onSuccess={handleGoogleLogin}
                    onError={() => message.error(t('auth.loginFailed'))}
                    text="signin_with"
                    shape="rectangular"
                    size="medium"
                  />
                )}
                {user && (
                  <span className="text-sm text-gray-600">
                    {t('auth.signedInAs')} <strong>{user.name}</strong>
                  </span>
                )}
              </div>

              <Button
                type="primary"
                icon={<Send className="w-4 h-4" />}
                onClick={handleSubmitComment}
                loading={submitting}
                disabled={!newComment.trim()}
                className="bg-green-600 hover:bg-green-700 border-green-600"
              >
                {t('comments.submit')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectIssueDiscussion;
