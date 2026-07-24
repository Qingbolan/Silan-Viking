import React, { useState, useEffect, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Award as AwardIcon,
  BookOpen,
  Briefcase,
  GraduationCap,
  FolderGit2,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../components/LanguageContext';
import { useTheme } from '../components/ThemeContext';
import { BrandLoading } from '../components/ds/BrandLoading';
import { ErrorState } from '../components/ds/ErrorState';
import Markdown from '../components/ui/Markdown';
import { Seo, personJsonLd } from '../components/Seo';
import { publicAssetUrl } from '../utils/publicAsset';
import { fetchResumeData, fetchPersonalInfo } from '../api/home/resumeApi';
import {
  AwardsList,
  ProjectSection,
  PublicationsList,
  RecentSection,
  ResearchGrid,
  SectionCard,
  SkillsCloud,
  Timeline,
  type RecentItem,
} from '../components/Resume';
import { usePageSections } from '../layout/PageTitleContext';
import { EDITORIAL_CONTENT_FRAME_CLASS } from '../layout/contentFrame';



interface ResumeViewData {
  name: string;
  title: string;
  current: string;
  contacts: Array<{
    type: string;
    value: string;
  }>;
  socialLinks: Array<{
    type: string;
    url: string;
  }>;
  sections: {
    about?: {
      title: string;
      content: string;
    };
    education: {
      title: string;
      content: Array<{
        school: string;
        degree: string;
        date: string;
        details: string[];
        logo?: string;
        website?: string;
        location?: string;
      }>;
    };
    experience: {
      title: string;
      content: Array<{
        company: string;
        role: string;
        date: string;
        details: string[];
        logo?: string;
        website?: string;
        location?: string;
      }>;
    };
    research: {
      title: string;
      content: Array<{
        id: string;
        title: string;
        location: string;
        date: string;
        details: string[];
        image?: string;
        tags?: string[];
      }>;
    };
    publications: {
      title: string;
      content: Array<{
        id: string;
        title: string;
        authors?: string;
        venue?: string;
        venueFullName?: string;
        venueUrl?: string;
        venueLocation?: string;
        ccfRank?: 'A' | 'B' | 'C';
        year?: string;
        abstract?: string;
        award?: string;
        tags?: string[];
        citations?: number;
        url?: string;
        pdfUrl?: string;
        githubUrl?: string;
        slidesUrl?: string;
        blogUrl?: string;
        image?: string;
      }>;
    };
    awards: {
      title: string;
      content: string[];
    };
    skills: {
      title: string;
      content: string[];
    };
    recent: {
      title: string;
      content: RecentItem[];
    };
  };
}

// Components moved to separate files

const ResumeWebsite: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [resumeData, setResumeData] = useState<ResumeViewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  // Stable Latin-script owner name for PublicationCard highlight. authors[]
  // lists every paper with the Latin-script names ("Silan Hu" etc.), so when
  // the UI is in zh and resumeData.name becomes "胡思蓝", the includes() match
  // fails and no name is bolded. Pin highlight to the en personal_info name
  // so the rule survives language switching.
  const [highlightAuthor, setHighlightAuthor] = useState<string | undefined>();
  
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const { language } = useLanguage();
  const { t } = useTranslation();

  // Generate table of contents from resume data
  const tocSections = useMemo(() => {
    if (!resumeData || !resumeData.sections) return [];
    
    const sections = [
      { id: 'hero-section', title: resumeData.name, level: 1 },
    ];
    
    // Order: about → recent, then academics-first — education /
    // publications / projects lead, work experience follows, awards & skills close.
    if (resumeData.sections?.about) {
      sections.push({ id: 'about-section', title: resumeData.sections.about.title, level: 2 });
    }

    if (resumeData.sections?.recent) {
      sections.push({ id: 'recent-section', title: resumeData.sections.recent.title, level: 2 });
    }

    if (resumeData.sections?.education) {
      sections.push({ id: 'education-section', title: resumeData.sections.education.title, level: 2 });
    }

    if (resumeData.sections?.publications) {
      sections.push({ id: 'publications-section', title: resumeData.sections.publications.title, level: 2 });
    }

    if (resumeData.sections?.research?.content?.length > 0) {
      sections.push({ id: 'research-section', title: resumeData.sections.research.title, level: 2 });
    }

    if (resumeData.sections?.experience) {
      sections.push({ id: 'experience-section', title: resumeData.sections.experience.title, level: 2 });
    }

    if (resumeData.sections?.awards) {
      sections.push({ id: 'awards-section', title: resumeData.sections.awards.title, level: 2 });
    }

    if (resumeData.sections?.skills) {
      sections.push({ id: 'skills-section', title: resumeData.sections.skills.title, level: 2 });
    }
    
    return sections;
  }, [resumeData]);

  // Surface the resume sections in the address bar as #anchor crumbs.
  usePageSections(tocSections);

  // Set CSS variables based on current theme
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });
  }, [colors]);

  // Resolve the stable owner name once (en variant, independent of UI lang)
  // so PublicationCard can bold it regardless of which language the user
  // toggled into.
  useEffect(() => {
    let cancelled = false;
    fetchPersonalInfo('en')
      .then((info) => {
        if (!cancelled && info?.full_name) setHighlightAuthor(info.full_name);
      })
      .catch(() => {
        // Non-fatal — author highlight just stays off.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load resume data
  useEffect(() => {
    let isMounted = true;

    const loadResumeData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const data = await fetchResumeData(language);
                
        if (isMounted) {
          setResumeData(data as unknown as ResumeViewData);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          console.error('❌ Failed to load resume data:', err);
          setError(t('resume.failed_to_load'));
          setLoading(false);
        }
      }
    };

    loadResumeData();

    return () => {
      isMounted = false;
    };
  }, [language, t, retryKey]);

  // Removed unused handleDownloadResume function

  if (loading) {
    // The home page boot — the design-system branded splash.
    return <BrandLoading message={t('resume.loading_profile')} />;
  }

  if (error || !resumeData) {
    // A failed resume load — the design-system full-page error, with a
    // retry that re-runs the fetch.
    return (
      <ErrorState
        variant="page"
        title={t('resume.error_loading')}
        description={error ?? t('resume.failed_to_load')}
        onRetry={() => setRetryKey((value) => value + 1)}
      />
    );
  }

  return (
    <motion.section
      aria-label={t('resume.page_label', { defaultValue: 'Resume' })}
      className="relative min-h-screen w-full max-w-full min-w-0 overflow-x-hidden"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={reduceMotion ? undefined : { opacity: 1 }}
      transition={reduceMotion ? undefined : { duration: 0.5 }}
    >
      <Seo
        path="/"
        type="profile"
        lang={language as 'en' | 'zh'}
        jsonLd={{
          ...personJsonLd({
            name: resumeData.name,
            sameAs: resumeData.socialLinks?.map((l) => l.url).filter(Boolean) || [],
            lang: language as 'en' | 'zh',
          }),
        }}
      />

      {/* Project Section */}
      <div id="hero-section" className="scroll-mt-24 sm:scroll-mt-28 lg:scroll-mt-32">
        <ProjectSection
          name={resumeData.name || ''}
          title={resumeData.title || ''}
          current={resumeData.current || ''}
          contacts={resumeData.contacts || []}
          socialLinks={resumeData.socialLinks || []}
          avatarSrc={publicAssetUrl('/image.png')}
          bottomIllustrations={[
            {
              src: publicAssetUrl('/intj-illustration.png'),
              alt: 'INTJ personality illustration',
            },
            {
              src: publicAssetUrl('/scorpion-line-art.png'),
              alt: 'Scorpion line illustration',
              tone: 'line-art',
            },
          ]}
        />
      </div>

      {/* Content Sections */}
      <div
        className={[
          EDITORIAL_CONTENT_FRAME_CLASS,
          'min-w-0 space-y-6 pb-12 xs:space-y-8 xs:pb-16 sm:space-y-12 sm:pb-20',
        ].join(' ')}
      >
        {/* About Me Section — the résumé summary prose, leads the content. */}
        {resumeData.sections?.about && resumeData.sections.about.content && (
          <div id="about-section" className="scroll-mt-24 sm:scroll-mt-28 lg:scroll-mt-32">
            <SectionCard
              title={resumeData.sections.about.title}
              kicker="Intro"
              index="00"
              icon={<UserRound size={18} aria-hidden focusable={false} />}
              delay={0.05}
            >
              <Markdown className="text-ds-base leading-[1.7] text-ds-fg-muted">
                {resumeData.sections.about.content}
              </Markdown>
            </SectionCard>
          </div>
        )}

        {/* Recent Section - At the top for prominence */}
        {resumeData.sections?.recent && resumeData.sections.recent.content && (
          <div id="recent-section" className="scroll-mt-24 sm:scroll-mt-28 lg:scroll-mt-32">
            <RecentSection
              data={resumeData.sections.recent.content}
              title={resumeData.sections.recent.title}
              delay={0.1}
            />
          </div>
        )}

        {/* Education Section — academics lead. */}
        {resumeData.sections?.education && resumeData.sections.education.content && (
          <div id="education-section" className="scroll-mt-24 sm:scroll-mt-28 lg:scroll-mt-32">
            <SectionCard
              title={resumeData.sections.education.title}
              kicker="Academia"
              index="01"
              icon={<GraduationCap size={18} aria-hidden focusable={false} />}
              delay={0.2}
            >
              <Timeline
                items={resumeData.sections.education.content.map(edu => ({
                  title: edu.degree,
                  subtitle: edu.school,
                  date: edu.date,
                  details: edu.details,
                  logo: edu.logo,
                  website: edu.website,
                  location: edu.location,
                }))}
                variant="secondary"
              />
            </SectionCard>
          </div>
        )}

        {/* Publications Section — papers lead the academic output. */}
        {resumeData.sections?.publications && resumeData.sections.publications.content && (
          <div id="publications-section" className="scroll-mt-24 sm:scroll-mt-28 lg:scroll-mt-32">
            <SectionCard
              title={resumeData.sections.publications.title}
              kicker="Library"
              index="02"
              icon={<BookOpen size={18} aria-hidden focusable={false} />}
              delay={0.3}
            >
              <PublicationsList
                publications={resumeData.sections.publications.content}
                highlightAuthor={highlightAuthor ?? resumeData.name}
              />
            </SectionCard>
          </div>
        )}

        {/* Projects Section — research projects shown as a card grid. */}
        {resumeData.sections?.research?.content?.length > 0 && (
          <div id="research-section" className="scroll-mt-24 sm:scroll-mt-28 lg:scroll-mt-32">
            <SectionCard
              title={resumeData.sections.research.title}
              kicker="Work"
              index="03"
              icon={<FolderGit2 size={18} aria-hidden focusable={false} />}
              delay={0.4}
            >
              <ResearchGrid items={resumeData.sections.research.content} />
            </SectionCard>
          </div>
        )}

        {/* Experience Section — work history follows the academics. */}
        {resumeData.sections?.experience && resumeData.sections.experience.content && (
          <div id="experience-section" className="scroll-mt-24 sm:scroll-mt-28 lg:scroll-mt-32">
            <SectionCard
              title={resumeData.sections.experience.title}
              kicker="Career"
              index="04"
              icon={<Briefcase size={18} aria-hidden focusable={false} />}
              delay={0.5}
            >
              <Timeline
                items={resumeData.sections.experience.content.map(exp => ({
                  title: exp.role,
                  subtitle: exp.company,
                  date: exp.date,
                  details: exp.details,
                  logo: exp.logo,
                  website: exp.website,
                  location: exp.location,
                }))}
                variant="primary"
              />
            </SectionCard>
          </div>
        )}

        {/* Awards Section */}
        {resumeData.sections?.awards && resumeData.sections.awards.content && (
          <div id="awards-section" className="scroll-mt-24 sm:scroll-mt-28 lg:scroll-mt-32">
            <SectionCard
              title={resumeData.sections.awards.title}
              kicker="Highlights"
              index="05"
              icon={<AwardIcon size={18} aria-hidden focusable={false} />}
              delay={0.6}
            >
              <AwardsList awards={resumeData.sections.awards.content} />
            </SectionCard>
          </div>
        )}

        {/* Skills Section */}
        {resumeData.sections?.skills && resumeData.sections.skills.content && (
          <div id="skills-section" className="scroll-mt-24 sm:scroll-mt-28 lg:scroll-mt-32">
            <SectionCard
              title={resumeData.sections.skills.title}
              kicker="Toolbox"
              index="06"
              icon={<Sparkles size={18} aria-hidden focusable={false} />}
              delay={0.7}
            >
              <SkillsCloud skills={resumeData.sections.skills.content} />
            </SectionCard>
          </div>
        )}
      </div>
    </motion.section>
  );
};

export default ResumeWebsite; 
