import React, { useState, useEffect, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertCircle,
  Award as AwardIcon,
  BookOpen,
  Briefcase,
  GraduationCap,
  FlaskConical,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../components/LanguageContext';
import { useTheme } from '../components/ThemeContext';
import { LoadingSpinner } from '../components/ui';
import { fetchResumeData } from '../api/home/resumeApi';
import {
  AwardsList,
  ProjectSection,
  PublicationsList,
  RecentSection,
  SectionCard,
  SkillsCloud,
  Timeline,
  type RecentItem,
} from '../components/Resume';
import { usePageSections } from '../layout/PageTitleContext';



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
  title: string;
  location: string;
        date: string;
        details: string[];
      }>;
    };
    publications: {
      title: string;
      content: string[];
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
    
    if (resumeData.sections?.recent) {
      sections.push({ id: 'recent-section', title: resumeData.sections.recent.title, level: 2 });
    }
    
    if (resumeData.sections?.experience) {
      sections.push({ id: 'experience-section', title: resumeData.sections.experience.title, level: 2 });
    }
    
    if (resumeData.sections?.education) {
      sections.push({ id: 'education-section', title: resumeData.sections.education.title, level: 2 });
    }
    
    if (resumeData.sections?.research) {
      sections.push({ id: 'research-section', title: resumeData.sections.research.title, level: 2 });
    }
    
    if (resumeData.sections?.publications) {
      sections.push({ id: 'publications-section', title: resumeData.sections.publications.title, level: 2 });
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
  }, [language, t]);

  // Removed unused handleDownloadResume function

  if (loading || !resumeData) {
    return (
      <div className="min-h-screen flex items-center justify-center ">
        <LoadingSpinner 
          size="xl" 
          text={t('resume.loading_profile')} 
          variant="ring"
          color="primary"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center ">
        <motion.div
          className="text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          role="alert"
        >
          <AlertCircle size={48} className="mx-auto mb-4 text-theme-error" />
          <h2 className="text-xl font-semibold mb-2 text-theme-primary">
            {t('resume.error_loading')}
          </h2>
          <p className="text-theme-secondary">{error}</p>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      role="main"
      aria-label={t('resume.page_label', { defaultValue: 'Resume' })}
      className="min-h-screen relative"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={reduceMotion ? undefined : { opacity: 1 }}
      transition={reduceMotion ? undefined : { duration: 0.5 }}
    >
      {/* Project Section */}
      <div id="hero-section" className="scroll-mt-24 sm:scroll-mt-28 lg:scroll-mt-32">
        <ProjectSection 
          name={resumeData.name || ''}
          title={resumeData.title || ''}
          current={resumeData.current || ''}
          contacts={resumeData.contacts || []}
          socialLinks={resumeData.socialLinks || []}
        />
      </div>

      {/* Content Sections */}
      <div className="mx-auto max-w-6xl px-1 pb-12 xs:pb-16 sm:pb-20 space-y-6 xs:space-y-8 sm:space-y-12">
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

        {/* Experience Section */}
        {resumeData.sections?.experience && resumeData.sections.experience.content && (
          <div id="experience-section" className="scroll-mt-24 sm:scroll-mt-28 lg:scroll-mt-32">
            <SectionCard
              title={resumeData.sections.experience.title}
              kicker="Career"
              index="01"
              icon={<Briefcase size={18} aria-hidden focusable={false} />}
              delay={0.2}
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

        {/* Education Section */}
        {resumeData.sections?.education && resumeData.sections.education.content && (
          <div id="education-section" className="scroll-mt-24 sm:scroll-mt-28 lg:scroll-mt-32">
            <SectionCard
              title={resumeData.sections.education.title}
              kicker="Academia"
              index="02"
              icon={<GraduationCap size={18} aria-hidden focusable={false} />}
              delay={0.3}
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

        {/* Research Section */}
        {resumeData.sections?.research && resumeData.sections.research.content && (
          <div id="research-section" className="scroll-mt-24 sm:scroll-mt-28 lg:scroll-mt-32">
            <SectionCard
              title={resumeData.sections.research.title}
              kicker="Inquiry"
              index="03"
              icon={<FlaskConical size={18} aria-hidden focusable={false} />}
              delay={0.4}
            >
              <Timeline
                items={resumeData.sections.research.content.map(research => ({
                  title: research.title,
                  subtitle: research.location,
                  date: research.date,
                  details: research.details,
                }))}
                variant="accent"
              />
            </SectionCard>
          </div>
        )}

        {/* Publications Section */}
        {resumeData.sections?.publications && resumeData.sections.publications.content && (
          <div id="publications-section" className="scroll-mt-24 sm:scroll-mt-28 lg:scroll-mt-32">
            <SectionCard
              title={resumeData.sections.publications.title}
              kicker="Library"
              index="04"
              icon={<BookOpen size={18} aria-hidden focusable={false} />}
              delay={0.5}
            >
              <PublicationsList publications={resumeData.sections.publications.content} />
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
    </motion.div>
  );
};

export default ResumeWebsite; 
