import React, { useEffect, useState } from 'react';
import { Mail, Phone, MapPin, Lightbulb, Briefcase, Contact, ArrowRight, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../components/LanguageContext';
import { Seo } from '../components/Seo';
import {
  AuthProvider,
  useAuth,
} from '../components/InteractiveContact';
import ModernContactForm from '../components/InteractiveContact/ModernContactForm';
import PublicMessagesWall from '../components/InteractiveContact/PublicMessagesWall';
import { fetchIdeas } from '../api/ideas/ideaApi';
import { fetchResumeData, fetchExpectations, type ExpectationItem } from '../api/home/resumeApi';
import { resolveSocialLink } from '../utils/socialPlatform';
import {
  BlogHeader,
  Card,
  CardContent,
  Tabs,
  Button,
  Divider,
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

const InteractiveContactPageContent: React.FC = () => {
  const { language } = useLanguage();
  const { isAuthenticated, user } = useAuth();
  const [activeTab, setActiveTab] = useState('thoughts');
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();

  // Right-rail content is fetched, not hardcoded: recent thoughts are real
  // ideas, and Quick Contact / Expected Jobs come from the résumé
  // (`personal_info` + the `expectations` part). An author — or an agent
  // editing the résumé via the silan CLI/MCP — updates them at the source.
  const [recentThoughts, setRecentThoughts] = useState<
    { id: string; title: string; description: string }[]
  >([]);
  const [expectedJobs, setExpectedJobs] = useState<ExpectationItem[]>([]);
  const [contactInfo, setContactInfo] = useState<
    { icon: React.ReactNode; title: string; value: string; href: string }[]
  >([]);
  const [socialLinks, setSocialLinks] = useState<
    { icon: React.ReactNode; label: string; href: string }[]
  >([]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Recent Thoughts — the three most recent ideas.
    fetchIdeas({ page: 1, size: 3 }, language)
      .then((ideas) => {
        if (cancelled) return;
        setRecentThoughts(
          ideas.slice(0, 3).map((idea) => ({
            id: idea.id,
            title: idea.title,
            description: idea.description || idea.abstract || '',
          })),
        );
      })
      .catch(() => {/* leave the list empty on failure */});

    // Expected Jobs — the résumé's `expectations` part.
    fetchExpectations(language)
      .then((items) => {
        if (!cancelled) setExpectedJobs(items);
      })
      .catch(() => {/* leave the list empty on failure */});

    // Quick Contact — contacts and social links from `personal_info`.
    fetchResumeData(language)
      .then((resume) => {
        if (cancelled) return;
        const labelFor = (type: string) =>
          ({ email: language === 'en' ? 'Email' : '邮箱',
             phone: language === 'en' ? 'Phone' : '电话',
             location: language === 'en' ? 'Location' : '位置' } as Record<string, string>)[
            type
          ] || type;
        const iconFor = (type: string) =>
          type === 'email' ? <Mail size={18} />
          : type === 'phone' ? <Phone size={18} />
          : <MapPin size={18} />;
        const hrefFor = (type: string, value: string) =>
          type === 'email' ? `mailto:${value}`
          : type === 'phone' ? `tel:${value.replace(/\s+/g, '')}`
          : `https://maps.google.com/?q=${encodeURIComponent(value)}`;
        setContactInfo(
          (resume.contacts || []).map((c) => ({
            icon: iconFor(c.type),
            title: labelFor(c.type),
            value: c.value,
            href: hrefFor(c.type, c.value),
          })),
        );
        setSocialLinks(
          (resume.socialLinks || []).map((s) => {
            // `fetchResumeData` maps each link to `{ type, url }`; tolerate
            // the `platform` field too in case the shape varies.
            const name = ((s as any).type || (s as any).platform || '') as string;
            // Identify the platform from the URL then the label, so the icon
            // matches GitHub / LinkedIn / … not a generic globe.
            const { icon, label } = resolveSocialLink(s.url, name);
            return { icon, label, href: s.url };
          }),
        );
      })
      .catch(() => {/* leave Quick Contact empty on failure */});

    return () => {
      cancelled = true;
    };
  }, [language]);

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
                  {recentThoughts.map((thought) => (
                    <ListRow
                      key={thought.id}
                      title={thought.title}
                      description={thought.description}
                      onClick={() => navigate('/ideas')}
                    />
                  ))}
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
                  {expectedJobs.map((job) => (
                    <ListRow
                      key={job.id}
                      title={job.title}
                      description={job.description}
                      onClick={() => navigate('/')}
                    />
                  ))}
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
                  <Divider />
                  <div>
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
                  </div>
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
  return (
    <AuthProvider>
      <InteractiveContactPageContent />
    </AuthProvider>
  );
};

export default InteractiveContactPage;
