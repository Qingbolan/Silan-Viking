import type {
  ResumeData,
  PersonalInfo,
  Language,
  EducationItem,
  ResearchItem,
  ExperienceItem,
  RecentUpdate,
  Publication,
  Award,
} from '../../types/api';
import { get, formatLanguage, mediaUrl } from '../utils';
import { fetchUpdates } from '../updates/updateApi';
import { fetchProjects } from '../projects/projectApi';

interface ResumeEntryResponse {
  id: string;
  entry_id: string;
  sort_order: number;
  shared_payload?: Record<string, any>;
  localized_payload?: Record<string, any>;
}

interface ResumePartResponse {
  id: string;
  part_id: string;
  role: string;
  shape: string;
  sort_order: number;
  canonical_lang: string;
  body?: Record<string, string>;
  entries?: ResumeEntryResponse[];
}

interface ResumeResponse {
  personal_info?: any;
  parts?: ResumePartResponse[];
}

const partMatches = (part: ResumePartResponse, names: string[]) => {
  const role = (part.role || '').toLowerCase();
  const partId = (part.part_id || '').toLowerCase();
  return names.some((name) => role.includes(name) || partId.includes(name));
};

const findPart = (parts: ResumePartResponse[], names: string[]) =>
  parts.find((part) => partMatches(part, names));

const entryPayload = (entry: ResumeEntryResponse) => ({
  ...(entry.shared_payload || {}),
  ...(entry.localized_payload || {}),
});

const formatDateValue = (value: unknown, precision: 'day' | 'month') => {
  if (!value) return '';
  const text = String(value);
  return precision === 'month' && /^\d{4}-\d{2}/.test(text) ? text.slice(0, 7) : text;
};

const formatDateRange = (
  payload: any,
  language: Language = 'en',
  precision: 'day' | 'month' = 'day',
) => {
  if (payload.date) return String(payload.date);
  const start = formatDateValue(payload.start_date || payload.startDate || payload.start, precision);
  const end = payload.is_current || payload.current
    ? (language === 'zh' ? '至今' : 'Present')
    : formatDateValue(payload.end_date || payload.endDate || payload.end, precision);
  return [start, end].filter(Boolean).join(' - ');
};

const sectionTitle = (key: string, language: Language) => {
  if (language !== 'zh') {
    return {
      about: 'About Me',
      education: 'Education',
      experience: 'Work Experience',
      research: 'Projects',
      publications: 'Publications',
      awards: 'Awards',
      skills: 'Skills',
      recent: 'Recent Updates',
    }[key] || key;
  }

  return {
    about: '关于我',
    education: '教育经历',
    experience: '工作经历',
    research: '项目',
    publications: '论文发表',
    awards: '荣誉奖项',
    skills: '技能',
    recent: '最新动态',
  }[key] || key;
};

const bodyLines = (part?: ResumePartResponse, language: Language = 'en') => {
  if (!part?.body) return [];
  const body = part.body[language] || part.body.en || Object.values(part.body)[0] || '';
  return body
    .split('\n')
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
};

// The raw prose body of a Part — paragraphs preserved (for the About section).
const bodyText = (part?: ResumePartResponse, language: Language = 'en'): string => {
  if (!part?.body) return '';
  return (part.body[language] || part.body.en || Object.values(part.body)[0] || '').trim();
};

const optionalMediaUrl = (value?: string): string | undefined => {
  if (!value) return undefined;
  return mediaUrl(value);
};

const mapEducation = (part?: ResumePartResponse): EducationItem[] =>
  (part?.entries || []).map((entry) => {
    const payload = entryPayload(entry);
    return {
      id: entry.id,
      user_id: '',
      institution: payload.institution || payload.school || payload.title || '',
      degree: payload.degree || payload.subtitle || '',
      field_of_study: payload.field_of_study || payload.field || '',
      start_date: payload.start_date || payload.start || '',
      end_date: payload.end_date || payload.end || '',
      is_current: Boolean(payload.is_current || payload.current),
      gpa: payload.gpa || '',
      location: payload.location || '',
      institution_website: payload.website || payload.institution_website || '',
      institution_logo_url: payload.logo || payload.institution_logo_url || '',
      details: payload.details || payload.bullets || [],
      sort_order: entry.sort_order,
      created_at: '',
      updated_at: '',
    };
  });

const mapExperience = (part?: ResumePartResponse): ExperienceItem[] =>
  (part?.entries || []).map((entry) => {
    const payload = entryPayload(entry);
    return {
      id: entry.id,
      user_id: '',
      company: payload.company || payload.organization || payload.title || '',
      position: payload.position || payload.role || payload.subtitle || '',
      start_date: payload.start_date || payload.start || '',
      end_date: payload.end_date || payload.end || '',
      is_current: Boolean(payload.is_current || payload.current),
      location: payload.location || '',
      company_website: payload.website || payload.company_website || '',
      company_logo_url: payload.logo || payload.company_logo_url || '',
      details: payload.details || payload.bullets || [],
      sort_order: entry.sort_order,
      created_at: '',
      updated_at: '',
    };
  });

// Authors may arrive as a JSON list or an already-joined string.
const joinAuthors = (raw: unknown): string => {
  if (Array.isArray(raw)) return raw.filter(Boolean).join(', ');
  return raw ? String(raw) : '';
};

const mapResearch = (part?: ResumePartResponse): ResearchItem[] =>
  (part?.entries || []).map((entry) => {
    const payload = entryPayload(entry);
    return {
      id: entry.id,
      user_id: '',
      title: payload.title || '',
      institution: payload.institution || payload.organization || '',
      location: payload.location || '',
      start_date: payload.start_date || payload.start || '',
      end_date: payload.end_date || payload.end || '',
      details: payload.details || payload.bullets || [],
      image: payload.image_url || payload.image || payload.cover || '',
      tags: payload.tags || payload.keywords || [],
      sort_order: entry.sort_order,
      created_at: '',
      updated_at: '',
    };
  });

const mapPublications = (part?: ResumePartResponse): Publication[] =>
  (part?.entries || []).map((entry) => {
    const payload = entryPayload(entry);
    return {
      id: entry.id,
      user_id: '',
      title: payload.title || '',
      authors: joinAuthors(payload.authors),
      journal: payload.journal || payload.journal_name || '',
      conference: payload.conference || payload.conference_name || payload.venue || '',
      conference_full_name: payload.conference_full_name || '',
      conference_url: payload.conference_url || '',
      conference_location: payload.conference_location || '',
      ccf_rank: payload.ccf_rank || undefined,
      publisher: payload.publisher || '',
      published_at: payload.published_at || payload.publication_date || payload.date || '',
      doi: payload.doi || '',
      url: payload.url || '',
      pdf_url: payload.pdf_url || '',
      github_url: payload.github_url || payload.github || payload.code_url || '',
      slides_url: payload.slides_url || payload.slides || '',
      blog_url: payload.blog_url || payload.blog || '',
      abstract: payload.abstract || payload.summary || payload.description || '',
      award: payload.award || payload.award_name || '',
      tags: payload.tags || payload.keywords || [],
      image: payload.image_url || payload.image || '',
      publication_type: payload.publication_type || undefined,
      citation_count: Number(payload.citation_count || 0),
      created_at: '',
      updated_at: '',
    };
  });

const mapAwards = (part?: ResumePartResponse): Award[] =>
  (part?.entries || []).map((entry) => {
    const payload = entryPayload(entry);
    return {
      id: entry.id,
      user_id: '',
      title: payload.title || '',
      organization: payload.organization || payload.awarding_organization || payload.issuer || '',
      description: payload.description || '',
      award_date: payload.award_date || payload.date || '',
      category: payload.category || payload.award_type || '',
      url: payload.url || payload.certificate_url || payload.website || payload.source_url || payload.credential_url || '',
      sort_order: entry.sort_order,
      created_at: '',
      updated_at: '',
    };
  });

export const fetchResumeData = async (language: Language = 'en'): Promise<ResumeData> => {
  const [response, updates, portfolioProjects] = await Promise.all([
    get<ResumeResponse>('/api/v1/resume', { lang: formatLanguage(language) }),
    fetchUpdates(language),
    fetchProjects({ status: 'active', size: 100 }, language),
  ]);

  const parts = response.parts || [];
  // About-me prose — the résumé's `summary` part.
  const aboutText = bodyText(findPart(parts, ['summary', 'about']), language);
  const education = mapEducation(findPart(parts, ['education']));
  const experience = mapExperience(findPart(parts, ['experience', 'work']));
  const research = mapResearch(findPart(parts, ['research']));
  const publications = mapPublications(findPart(parts, ['publication']));
  const awards = mapAwards(findPart(parts, ['award']));
  const skills = [
    ...bodyLines(findPart(parts, ['skill']), language),
    ...(findPart(parts, ['skill'])?.entries || []).flatMap((entry) => {
      const payload = entryPayload(entry);
      return payload.skills || payload.items || payload.tags || [];
    }),
  ];

  return {
    name: response.personal_info?.full_name || '',
    title: response.personal_info?.title || '',
    current: response.personal_info?.current_status || '',
    contacts: [
      { type: 'email', value: response.personal_info?.email || '' },
      { type: 'phone', value: response.personal_info?.phone || '' },
      { type: 'location', value: response.personal_info?.location || '' },
    ].filter((contact) => contact.value),
    socialLinks: response.personal_info?.social_links?.map((link: any) => ({
      type: link.platform,
      url: link.url,
    })) || [],
    sections: {
      ...(aboutText && {
        about: {
          title: sectionTitle('about', language),
          content: aboutText,
        },
      }),
      education: {
        title: sectionTitle('education', language),
        content: education.map((edu) => ({
          school: edu.institution,
          degree: edu.degree,
          date: formatDateRange(edu, language, 'month'),
          details: edu.details || [],
          logo: optionalMediaUrl(edu.institution_logo_url),
          website: edu.institution_website,
          location: edu.location,
        })),
      },
      experience: {
        title: sectionTitle('experience', language),
        content: experience.map((exp) => ({
          company: exp.company,
          role: exp.position,
          date: formatDateRange(exp, language, 'month'),
          details: exp.details || [],
          logo: optionalMediaUrl(exp.company_logo_url),
          website: exp.company_website,
          location: exp.location,
        })),
      },
      research: {
        title: sectionTitle('research', language),
        content: [
          ...portfolioProjects.map((project) => ({
            id: project.slug || project.id,
            title: project.name,
            location: language === 'zh' ? '公开项目' : 'Public portfolio',
            date: project.year ? String(project.year) : '',
            details: [project.description].filter(Boolean),
            image: optionalMediaUrl(project.thumbnailUrl),
            tags: project.tags && project.tags.length > 0 ? project.tags : undefined,
          })),
          ...research
            .filter((item) => !portfolioProjects.some((project) => (
              project.id === item.id || project.name.trim().toLowerCase() === item.title.trim().toLowerCase()
            )))
            .map((item) => ({
              id: item.id,
              title: item.title,
              location: item.location || item.institution || '',
              date: formatDateRange(item, language),
              details: item.details || [],
              image: optionalMediaUrl(item.image),
              tags: item.tags && item.tags.length > 0 ? item.tags : undefined,
            })),
        ],
      },
      publications: {
        title: sectionTitle('publications', language),
        // Keep the full structured publication — title, authors, venue,
        // year, citations and links — instead of flattening to a string.
        content: publications.map((item) => ({
          id: item.id,
          title: item.title,
          authors: item.authors || undefined,
          venue: item.conference || item.journal || item.publisher || undefined,
          venueFullName: item.conference_full_name || undefined,
          venueUrl: item.conference_url || undefined,
          venueLocation: item.conference_location || undefined,
          ccfRank: item.ccf_rank || undefined,
          year: item.published_at || undefined,
          abstract: item.abstract || undefined,
          award: item.award || undefined,
          tags: item.tags && item.tags.length > 0 ? item.tags : undefined,
          citations: item.citation_count || undefined,
          url: item.url || item.doi || undefined,
          pdfUrl: item.pdf_url || undefined,
          githubUrl: item.github_url || undefined,
          slidesUrl: item.slides_url || undefined,
          blogUrl: item.blog_url || undefined,
          image: optionalMediaUrl(item.image),
          publicationType: item.publication_type || undefined,
        })),
      },
      awards: {
        title: sectionTitle('awards', language),
        content: awards.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description || undefined,
          organization: item.organization || undefined,
          date: item.award_date || undefined,
          category: item.category || undefined,
          url: item.url || undefined,
        })),
      },
      skills: {
        title: sectionTitle('skills', language),
        content: Array.from(new Set(skills.map(String).filter(Boolean))),
      },
      recent: {
        title: sectionTitle('recent', language),
        content: updates.map((update) => ({
          id: update.id,
          title: update.title,
          description: update.description,
          date: update.date,
          tags: update.tags || [],
          type: update.type,
          status: update.status,
          priority: update.priority,
        })),
      },
    },
  };
};

export const fetchPersonalInfo = async (language: Language = 'en'): Promise<PersonalInfo> =>
  get<PersonalInfo>('/api/v1/resume/personal', { lang: formatLanguage(language) });

export const fetchEducation = async (language: Language = 'en'): Promise<EducationItem[]> => {
  const response = await get<ResumeResponse>('/api/v1/resume', { lang: formatLanguage(language) });
  return mapEducation(findPart(response.parts || [], ['education']));
};

export const fetchWorkExperience = async (language: Language = 'en'): Promise<ExperienceItem[]> => {
  const response = await get<ResumeResponse>('/api/v1/resume', { lang: formatLanguage(language) });
  return mapExperience(findPart(response.parts || [], ['experience', 'work']));
};

export const fetchResearchProjects = async (language: Language = 'en'): Promise<ResearchItem[]> => {
  const response = await get<ResumeResponse>('/api/v1/resume', { lang: formatLanguage(language) });
  return mapResearch(findPart(response.parts || [], ['research']));
};

export const fetchPublications = async (language: Language = 'en'): Promise<Publication[]> => {
  const response = await get<ResumeResponse>('/api/v1/resume', { lang: formatLanguage(language) });
  return mapPublications(findPart(response.parts || [], ['publication']));
};

export const fetchAwards = async (language: Language = 'en'): Promise<Award[]> => {
  const response = await get<ResumeResponse>('/api/v1/resume', { lang: formatLanguage(language) });
  return mapAwards(findPart(response.parts || [], ['award']));
};

export const fetchRecentUpdates = async (language: Language = 'en'): Promise<RecentUpdate[]> =>
  fetchUpdates(language);

/** One "open to" role from the résumé's `expectations` part. */
export interface ExpectationItem {
  id: string;
  title: string;
  description: string;
}

/**
 * Fetch the résumé's `expectations` entries — the kinds of roles /
 * collaborations the author is open to. Drives the Contact page's
 * "Expected Jobs" tab; an absent part yields an empty list.
 */
export const fetchExpectations = async (
  language: Language = 'en',
): Promise<ExpectationItem[]> => {
  const response = await get<ResumeResponse>('/api/v1/resume', {
    lang: formatLanguage(language),
  });
  const part = findPart(response.parts || [], ['expectations', 'open-to']);
  return (part?.entries || [])
    .map((entry) => {
      const payload = entryPayload(entry);
      return {
        id: entry.id,
        title: payload.title || '',
        description: payload.description || '',
        sort_order: entry.sort_order,
      };
    })
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(({ sort_order: _omit, ...rest }) => rest);
};
