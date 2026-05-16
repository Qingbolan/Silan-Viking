import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Bug,
  Lightbulb,
  HelpCircle,
  AlertCircle,
  CheckCircle,
  Plus,
  MessageSquare,
  Calendar,
  Eye,
  FileText,
  MoreHorizontal,
  Trash2
} from 'lucide-react';
import { Button, Input, Select, Tag, Modal, message, Avatar, Dropdown, Popconfirm } from 'antd';
import { useLanguage } from '../LanguageContext';
import ProjectIssueDiscussion from './ProjectIssueDiscussion';
import NewIssueForm from './NewIssueForm';
import {
  fetchProjectIssues,
  deleteProjectIssue,
  type ProjectIssueRecord
} from '../../api/projects/projectApi';
import { getClientFingerprint } from '../../utils/fingerprint';

const { Search } = Input;
const { Option } = Select;

interface ProjectIssuesListProps {
  projectId: string;
}

const ProjectIssuesList: React.FC<ProjectIssuesListProps> = ({ projectId }) => {
  const { language, t } = useLanguage();
  const [issues, setIssues] = useState<ProjectIssueRecord[]>([]);
  const [filteredIssues, setFilteredIssues] = useState<ProjectIssueRecord[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<ProjectIssueRecord | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('open');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewIssueForm, setShowNewIssueForm] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id?: string; name?: string; email?: string } | null>(null);
  const [deletingIssueId, setDeletingIssueId] = useState<string | null>(null);

  // Get current user from localStorage
  const getCurrentUser = (): { id?: string; name?: string; email?: string } | null => {
    try {
      const raw = localStorage.getItem('auth_user');
      if (!raw) return null;
      const u = JSON.parse(raw);
      if (u && (u.id || u.email || u.name)) return u;
    } catch {}
    return null;
  };

  // Check if current user can delete an issue
  const canDeleteIssue = (issue: ProjectIssueRecord): boolean => {
    const user = currentUser || getCurrentUser();
    if (!user || !user.id) return false;
    return issue.author === user.name || issue.author === user.email;
  };

  // Handle delete issue
  const handleDeleteIssue = async (issue: ProjectIssueRecord) => {
    try {
      setDeletingIssueId(issue.id);
      const fingerprint = getClientFingerprint();
      const user = getCurrentUser();

      await deleteProjectIssue(issue.id, {
        fingerprint,
        userIdentityId: user?.id,
        language: language as 'en' | 'zh'
      });

      message.success(t('issues.deleteSuccess') || 'Issue deleted successfully');
      await loadIssues(); // Reload issues
    } catch (error) {
      console.error('Failed to delete issue:', error);
      message.error(t('issues.deleteFailed') || 'Failed to delete issue');
    } finally {
      setDeletingIssueId(null);
    }
  };

  // Load issues from API
  const loadIssues = async () => {
    try {
      setLoading(true);
      const issuesFromBackend = await fetchProjectIssues(projectId, language as 'en' | 'zh');
      setIssues(issuesFromBackend);
    } catch (error) {
      console.error('Failed to load issues:', error);
      message.error(t('issues.loadFailed'));
      setIssues([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      loadIssues();
    }
  }, [projectId, language]);

  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  useEffect(() => {
    let filtered = issues;

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(issue => issue.status === statusFilter);
    }

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(issue => issue.type === typeFilter);
    }

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(issue =>
        issue.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        issue.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredIssues(filtered);
  }, [issues, statusFilter, typeFilter, searchQuery]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'bug': return <Bug className="w-4 h-4 text-red-500" />;
      case 'enhancement': return <Lightbulb className="w-4 h-4 text-blue-500" />;
      case 'question': return <HelpCircle className="w-4 h-4 text-theme-accent" />;
      case 'documentation': return <FileText className="w-4 h-4 text-green-500" />;
      default: return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusIcon = (status: string) => {
    return status === 'open' ? (
      <AlertCircle className="w-4 h-4 text-green-600" />
    ) : (
      <CheckCircle className="w-4 h-4 text-theme-accent" />
    );
  };

  const getLabelColor = (label: string) => {
    const colors: Record<string, string> = {
      'bug': 'red',
      'enhancement': 'blue',
      'documentation': 'geekblue',
      'question': 'blue',
      'high-priority': 'volcano',
      'low-priority': 'cyan',
      'ui': 'orange',
      'api': 'green',
      'authentication': 'magenta'
    };
    return colors[label] || 'default';
  };

  const getRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 1) {
      return language === 'zh' ? '刚刚' : 'just now';
    }
    if (diffInHours < 24) {
      return language === 'zh'
        ? `${diffInHours} 小时前`
        : `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    }
    const diffInDays = Math.floor(diffInHours / 24);
    return language === 'zh'
      ? `${diffInDays} 天前`
      : `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  };

  const openCounts = issues.filter(issue => issue.status === 'open').length;
  const closedCounts = issues.filter(issue => issue.status === 'closed').length;

  const handleNewIssueCreated = async (_newIssue?: ProjectIssueRecord) => {
    setShowNewIssueForm(false);
    // Reload issues to get the latest data from backend
    await loadIssues();
  };

  const handleIssueClick = (issue: ProjectIssueRecord) => {
    setSelectedIssue(issue);
    setShowIssueModal(true);
  };

  const handleCloseIssueModal = () => {
    setShowIssueModal(false);
    setSelectedIssue(null);
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-theme-primary flex items-center gap-2">
            <Bug className="w-5 h-5" />
            Issues
          </h2>
          <div className="flex items-center gap-2">
            <Tag color="green" className="flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {openCounts} Open
            </Tag>
            <Tag color="default" className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              {closedCounts} Closed
            </Tag>
          </div>
        </div>
        <Button
          type="primary"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => setShowNewIssueForm(true)}
          className="bg-green-600 hover:bg-green-700"
        >
          New Issue
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="flex gap-2 flex-wrap">
          <Select
            value={statusFilter}
            onChange={(value: 'all' | 'open' | 'closed') => setStatusFilter(value)}
            className="w-32"
          >
            <Option value="all">All Status</Option>
            <Option value="open">Open</Option>
            <Option value="closed">Closed</Option>
          </Select>

          <Select
            value={typeFilter}
            onChange={(value: string) => setTypeFilter(value)}
            className="w-32"
          >
            <Option value="all">All Types</Option>
            <Option value="bug">Bug</Option>
            <Option value="enhancement">Enhancement</Option>
            <Option value="question">Question</Option>
            <Option value="documentation">Documentation</Option>
          </Select>
        </div>

        <Search
          placeholder="Search issues..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 max-w-md"
        />
      </div>

      {/* Issues List */}
      <div className="border border-theme-border rounded-lg bg-theme-surface">
        {loading ? (
          <div className="p-8 text-center text-theme-secondary">
            <div className="animate-spin w-8 h-8 mx-auto mb-4 border-2 border-theme-primary border-t-transparent rounded-full"></div>
            <p>{t('common.loading')}...</p>
          </div>
        ) : filteredIssues.length === 0 ? (
          <div className="p-8 text-center text-theme-secondary">
            <Bug className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="font-medium mb-2">No issues found</p>
            <p className="text-sm">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-theme-border">
            {filteredIssues.map((issue, index) => (
              <motion.div
                key={issue.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="p-4 hover:bg-theme-hover cursor-pointer transition-colors"
                onClick={() => handleIssueClick(issue)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {getStatusIcon(issue.status)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 pr-4">
                        <h3 className="font-medium text-theme-primary hover:text-theme-accent transition-colors">
                          {issue.title}
                          <span className="text-theme-secondary ml-2 text-sm">#{issue.number}</span>
                        </h3>

                        <p className="text-theme-secondary mt-1 text-sm line-clamp-2">
                          {issue.description}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-theme-tertiary">
                          <span className="flex items-center gap-1">
                            {getTypeIcon(issue.type)}
                            {issue.type}
                          </span>
                          <span className="flex items-center gap-2">
                            <Avatar
                              src={issue.author_avatar}
                              size={16}
                              className="flex-shrink-0"
                            >
                              {issue.author[0]?.toUpperCase()}
                            </Avatar>
                            <span className="text-xs">{issue.author}</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            opened {getRelativeTime(issue.created)}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1 mt-2">
                          {issue.labels.map((label, labelIndex) => (
                            <Tag key={labelIndex} color={getLabelColor(label)}>
                              {label}
                            </Tag>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-theme-tertiary">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {issue.comments}
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {issue.likes}
                        </span>
                        {canDeleteIssue(issue) && (
                          <Dropdown
                            menu={{
                              items: [
                                {
                                  key: 'delete',
                                  icon: <Trash2 className="w-3 h-3" />,
                                  label: (
                                    <Popconfirm
                                      title={language === 'zh' ? '确认删除' : 'Confirm Delete'}
                                      description={language === 'zh' ? '确定要删除这个问题吗？' : 'Are you sure you want to delete this issue?'}
                                      onConfirm={(e) => {
                                        e?.stopPropagation();
                                        handleDeleteIssue(issue);
                                      }}
                                      onCancel={(e) => e?.stopPropagation()}
                                      okText={language === 'zh' ? '删除' : 'Delete'}
                                      cancelText={language === 'zh' ? '取消' : 'Cancel'}
                                      okButtonProps={{ danger: true }}
                                    >
                                      <span onClick={(e) => e.stopPropagation()}>
                                        {language === 'zh' ? '删除' : 'Delete'}
                                      </span>
                                    </Popconfirm>
                                  ),
                                  danger: true,
                                }
                              ]
                            }}
                            trigger={['click']}
                            placement="bottomRight"
                          >
                            <Button
                              type="text"
                              size="small"
                              icon={<MoreHorizontal className="w-3 h-3" />}
                              onClick={(e) => e.stopPropagation()}
                              loading={deletingIssueId === issue.id}
                              className="hover:bg-theme-hover"
                            />
                          </Dropdown>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* New Issue Form Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <Bug className="w-5 h-5" />
            {language === 'zh' ? '新建问题' : 'New Issue'}
          </div>
        }
        open={showNewIssueForm}
        onCancel={() => setShowNewIssueForm(false)}
        footer={null}
        width="90%"
        style={{ maxWidth: '1000px' }}
        destroyOnHidden
      >
        <NewIssueForm
          projectId={projectId}
          onIssueCreated={handleNewIssueCreated}
          onSuccess={() => setShowNewIssueForm(false)}
        />
      </Modal>

      {/* Issue Detail Modal */}
      <Modal
        title={null}
        open={showIssueModal}
        onCancel={handleCloseIssueModal}
        footer={null}
        width="90%"
        style={{ maxWidth: '1200px' }}
        className="issue-detail-modal"
        destroyOnHidden
      >
        {selectedIssue && (
          <ProjectIssueDiscussion
            projectId={projectId}
            issueId={selectedIssue.id}
            issueTitle={selectedIssue.title}
            issueStatus={selectedIssue.status}
            issueAuthor={selectedIssue.author}
            issueCreated={selectedIssue.created}
            issueLabels={selectedIssue.labels}
          />
        )}
      </Modal>
    </div>
  );
};

export default ProjectIssuesList;
