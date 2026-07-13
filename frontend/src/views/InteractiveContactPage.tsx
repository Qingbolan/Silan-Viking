import React, { useCallback, useMemo, useState } from 'react';
import { Mail, Phone, MapPin, Lightbulb, Briefcase, Contact, ArrowRight, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../components/LanguageContext';
import { Seo } from '../components/Seo';
import {
  useAuth,
} from '../components/InteractiveContact';
import ModernContactForm from '../components/InteractiveContact/ModernContactForm';
import PublicMessagesWall from '../components/InteractiveContact/PublicMessagesWall';
import { fetchIdeas } from '../api/ideas/ideaApi';
import { fetchPersonalInfo, fetchExpectations, type ExpectationItem } from '../api/home/resumeApi';
import { resolveSocialLink } from '../utils/socialPlatform';
import { useRemoteResource } from '../hooks/useRemoteResource';
import {
  BlogHeader,
  Card,
  CardContent,
  Tabs,
  Button,
  Divider,
  Alert,
  EmptyState,
  Skeleton,
} from '../components/ds';

/** A single tappable list row — title + one-line description. */
const ListRow: React.FC<{
  title: string;
  description: string;
  onClick?: () => void;
}> = ({ title, description, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full rounded-ds-md border border-transparent px-3 py-2.5 text-left transition-colors duration-ds-fast hover:border-ds-border hover:bg-ds-surface-2"
  >
    <div className="text-ds-sm font-medium text-ds-fg">{title}</div>
    <div className="mt-0.5 text-ds-xs text-ds-fg-muted">{description}</div>
  </button>
);

const PanelLoading: React.FC<{ label: string }> = ({ label }) => (
  <div className="space-y-2 py-1" aria-label={label}>
    {[0, 1, 2].map((item) => <Skeleton key={item} shape="block" className="h-14" />)}
  </div>
);

const PanelError: React.FC<{ title: string; retryLabel: string; onRetry: () => void }> = ({
  title,
  retryLabel,
  onRetry,
}) => (
  <Alert tone="error" title={title}>
    <Button variant="ghost" size="sm" className="mt-2" onClick={onRetry}>
      {retryLabel}
    </Button>
  </Alert>
);

const InteractiveContactPageContent: React.FC = () => {
  const { language } = useLanguage();
  const { isAuthenticated, user } = useAuth();
  const [activeTab, setActiveTab] = useState('thoughts');
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();

  // The three tab bodies are independent resources. A failure in updates,
  // for example, must not erase the email/social facts from personal_info.
  const loadThoughts = useCallback(
    async () => (await fetchIdeas({ page: 1, size: 3 }, language)).slice(0, 3).map((idea) => ({
      id: idea.id,
      title: idea.title,
      description: idea.description || idea.abstract || '',
    })),
    [language],
  );
  const loadJobs = useCallback(() => fetchExpectations(language), [language]);
  const loadContactProfile = useCallback(() => fetchPersonalInfo(language), [language]);

  const thoughtsResource = useRemoteResource('recent-thoughts', loadThoughts);
  const jobsResource = useRemoteResource<ExpectationItem[]>('expected-jobs', loadJobs);
  const contactResource = useRemoteResource('contact-profile', loadContactProfile);

  const recentThoughts = thoughtsResource.data ?? [];
  const expectedJobs = jobsResource.data ?? [];

  const contactInfo = useMemo(() => {
    const profile = contactResource.data;
    if (!profile) return [];
    return [
      profile.email && { type: 'email', value: profile.email },
      profile.phone && { type: 'phone', value: profile.phone },
      profile.location && { type: 'location', value: profile.location },
    ].filter(Boolean).map((entry) => {
      const { type, value } = entry as { type: string; value: string };
      return {
        icon: type === 'email' ? <Mail size={18} /> : type === 'phone' ? <Phone size={18} /> : <MapPin size={18} />,
        title: type === 'email' ? (language === 'en' ? 'Email' : '邮箱') : type === 'phone' ? (language === 'en' ? 'Phone' : '电话') : (language === 'en' ? 'Location' : '位置'),
        value,
        href: type === 'email' ? `mailto:${value}` : type === 'phone' ? `tel:${value.replace(/\s+/g, '')}` : `https://maps.google.com/?q=${encodeURIComponent(value)}`,
      };
    });
  }, [contactResource.data, language]);

  const socialLinks = useMemo(
    () => (contactResource.data?.social_links ?? []).map((social) => {
      const { icon, label } = resolveSocialLink(social.url, social.platform);
      return { icon, label, href: social.url };
    }),
    [contactResource.data],
  );

  return (
    <div className="min-h-screen py-20">
      <Seo
        title={language === 'en' ? 'Contact' : '联系'}
        description={
          language === 'en'
            ? 'Get in touch with Silan Hu — email, social links and a public message board.'
            : '联系胡思蓝 —— 邮箱、社交链接与公开留言板。'
        }
        path="/contact"
        lang={language as 'en' | 'zh'}
      />
      <div className="max-w-6xl mx-auto px-4">
        {/* Hero header — same BlogHeader hero used by blog/ideas/projects,
            but hero-only (no search / filter toolbar). */}
        <BlogHeader
          className="mb-12"
          eyebrow={language === 'en' ? 'Contact' : '联系'}
          title={
            isAuthenticated
              ? (language === 'en' ? `Hi, ${user?.username}!` : `你好，${user?.username}！`)
              : (language === 'en' ? "Let's Connect" : '联系我')
          }
          description={
            language === 'en'
              ? 'Open to collaborations, job opportunities, and interesting conversations'
              : '开放合作、工作机会和有趣的对话'
          }
        />

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Left — contact form. */}
          <Card>
            <CardContent>
              <ModernContactForm
                onMessageTypeChange={(type) => {
                  setActiveTab(type === 'general' ? 'thoughts' : 'jobs');
                }}
                onMessageSent={() => {
                  setRefreshKey((prev) => prev + 1);
                }}
              />
            </CardContent>
          </Card>

          {/* Right — tabbed content. */}
          <Card>
            <CardContent>
              <Tabs
                value={activeTab}
                onChange={setActiveTab}
                items={[
                  {
                    value: 'thoughts',
                    icon: <Lightbulb />,
                    label: language === 'en' ? 'Recent Thoughts' : '最新想法',
                  },
                  {
                    value: 'jobs',
                    icon: <Briefcase />,
                    label: language === 'en' ? 'Expected Jobs' : '期待职位',
                  },
                  {
                    value: 'contact',
                    icon: <Contact />,
                    label: language === 'en' ? 'Quick Contact' : '快速联系',
                  },
                ]}
              />

              {/* Recent thoughts. */}
              {activeTab === 'thoughts' && (
                <div className="mt-4 space-y-1.5">
                  {thoughtsResource.status === 'loading' ? (
                    <PanelLoading label={language === 'en' ? 'Loading recent thoughts' : '正在加载最新想法'} />
                  ) : thoughtsResource.status === 'error' ? (
                    <PanelError
                      title={language === 'en' ? 'Recent thoughts could not be loaded' : '最新想法加载失败'}
                      retryLabel={language === 'en' ? 'Try again' : '重试'}
                      onRetry={thoughtsResource.reload}
                    />
                  ) : recentThoughts.length === 0 ? (
                    <EmptyState
                      icon={<Lightbulb />}
                      title={language === 'en' ? 'No public thoughts yet' : '还没有公开想法'}
                      description={language === 'en' ? 'Published research ideas will appear here.' : '公开后的研究想法会显示在这里。'}
                    />
                  ) : (
                    recentThoughts.map((thought) => (
                      <ListRow
                        key={thought.id}
                        title={thought.title}
                        description={thought.description}
                        onClick={() => navigate(`/ideas/${thought.id}`)}
                      />
                    ))
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    block
                    className="mt-2"
                    trailingIcon={<ArrowRight />}
                    onClick={() => navigate('/ideas')}
                  >
                    {language === 'en' ? 'Show More Ideas' : '查看更多想法'}
                  </Button>
                </div>
              )}

              {/* Expected jobs. */}
              {activeTab === 'jobs' && (
                <div className="mt-4 space-y-1.5">
                  {jobsResource.status === 'loading' ? (
                    <PanelLoading label={language === 'en' ? 'Loading preferred roles' : '正在加载期待职位'} />
                  ) : jobsResource.status === 'error' ? (
                    <PanelError
                      title={language === 'en' ? 'Preferred roles could not be loaded' : '期待职位加载失败'}
                      retryLabel={language === 'en' ? 'Try again' : '重试'}
                      onRetry={jobsResource.reload}
                    />
                  ) : expectedJobs.length === 0 ? (
                    <EmptyState
                      icon={<Briefcase />}
                      title={language === 'en' ? 'No role preferences published' : '尚未发布职位偏好'}
                      description={language === 'en' ? 'Current role preferences are maintained in the résumé.' : '当前职位偏好由简历内容维护。'}
                    />
                  ) : (
                    expectedJobs.map((job) => (
                      <ListRow
                        key={job.id}
                        title={job.title}
                        description={job.description}
                        onClick={() => navigate('/')}
                      />
                    ))
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    block
                    className="mt-2"
                    leadingIcon={<User />}
                    trailingIcon={<ArrowRight />}
                    onClick={() => navigate('/')}
                  >
                    {language === 'en' ? 'Who Am I' : '关于我'}
                  </Button>
                </div>
              )}

              {/* Quick contact. */}
              {activeTab === 'contact' && (
                <div className="mt-4 space-y-3">
                  {contactResource.status === 'loading' ? (
                    <PanelLoading label={language === 'en' ? 'Loading contact information' : '正在加载联系信息'} />
                  ) : contactResource.status === 'error' ? (
                    <PanelError
                      title={language === 'en' ? 'Contact information could not be loaded' : '联系信息加载失败'}
                      retryLabel={language === 'en' ? 'Try again' : '重试'}
                      onRetry={contactResource.reload}
                    />
                  ) : contactInfo.length === 0 && socialLinks.length === 0 ? (
                    <EmptyState
                      icon={<Contact />}
                      title={language === 'en' ? 'No public contact details' : '暂无公开联系信息'}
                      description={language === 'en' ? 'Use the message form to get in touch.' : '可以使用留言表单与我联系。'}
                    />
                  ) : (
                    <>
                  {/* Contact info rows. */}
                  <div className="space-y-1">
                    {contactInfo.map((item, index) => (
                      <a
                        key={index}
                        href={item.href}
                        target={item.href.startsWith('http') ? '_blank' : undefined}
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-ds-md px-3 py-2.5 transition-colors duration-ds-fast hover:bg-ds-surface-2"
                      >
                        <span className="text-ds-primary [&_svg]:size-[18px]">
                          {item.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-ds-2xs text-ds-fg-subtle">
                            {item.title}
                          </span>
                          <span className="block truncate text-ds-sm font-medium text-ds-fg">
                            {item.value}
                          </span>
                        </span>
                      </a>
                    ))}
                  </div>

                  {/* Social links. */}
                  {socialLinks.length > 0 && <Divider />}
                  {socialLinks.length > 0 && <div>
                    <h4 className="mb-2 text-ds-2xs font-medium uppercase tracking-[0.08em] text-ds-fg-subtle">
                      {language === 'en' ? 'Social Media' : '社交媒体'}
                    </h4>
                    <div className="grid grid-cols-3 gap-2">
                      {socialLinks.map((social, index) => (
                        <a
                          key={index}
                          href={social.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex flex-col items-center gap-1.5 rounded-ds-md border border-ds-border bg-ds-surface-1 px-2.5 py-3 text-ds-fg-muted transition-colors duration-ds-fast hover:border-ds-primary/30 hover:bg-ds-primary-soft hover:text-ds-primary [&_svg]:size-[18px]"
                        >
                          {social.icon}
                          <span className="text-ds-2xs font-medium">{social.label}</span>
                        </a>
                      ))}
                    </div>
                  </div>}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Public messages wall — full width. */}
        <div className="mt-16">
          <PublicMessagesWall key={refreshKey} />
        </div>
      </div>
    </div>
  );
};

const InteractiveContactPage: React.FC = () => {
  return <InteractiveContactPageContent />;
};

export default InteractiveContactPage;
