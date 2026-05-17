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
import { get, formatLanguage } from '../utils';
import { fetchUpdates } from '../updates/updateApi';

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

const formatDateRange = (payload: any, language: Language = 'en') => {
  if (payload.date) return String(payload.date);
  const start = payload.start_date || payload.startDate || payload.start || '';
  const end = payload.is_current || payload.current
    ? (language === 'zh' ? '至今' : 'Present')
    : payload.end_date || payload.endDate || payload.end || '';
  return [start, end].filter(Boolean).join(' - ');
};

const sectionTitle = (key: string, language: Language) => {
  if (language !== 'zh') {
    return {
      education: 'Education',
      experience: 'Work Experience',
      research: 'Research Experience',
      publications: 'Publications',
      awards: 'Awards',
      skills: 'Skills',
      recent: 'Recent Updates',
    }[key] || key;
  }

  return {
    education: '教育经历',
    experience: '工作经历',
    research: '研究经历',
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
      authors: payload.authors || '',
      journal: payload.journal || '',
      conference: payload.conference || payload.venue || '',
      publisher: payload.publisher || '',
      published_at: payload.published_at || payload.date || '',
      doi: payload.doi || '',
      url: payload.url || '',
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
      organization: payload.organization || payload.issuer || '',
      description: payload.description || '',
      award_date: payload.award_date || payload.date || '',
      category: payload.category || '',
      sort_order: entry.sort_order,
      created_at: '',
      updated_at: '',
    };
  });

export const fetchResumeData = async (language: Language = 'en'): Promise<ResumeData> => {
  const [response, updates] = await Promise.all([
    get<ResumeResponse>('/api/v1/resume', { lang: formatLanguage(language) }),
    fetchUpdates(language),
  ]);

  const parts = response.parts || [];
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
      education: {
        title: sectionTitle('education', language),
        content: education.map((edu) => ({
          school: edu.institution,
          degree: edu.degree,
          date: formatDateRange(edu, language),
          details: edu.details || [],
          logo: edu.institution_logo_url,
          website: edu.institution_website,
          location: edu.location,
        })),
      },
      experience: {
        title: sectionTitle('experience', language),
        content: experience.map((exp) => ({
          company: exp.company,
          role: exp.position,
          date: formatDateRange(exp, language),
          details: exp.details || [],
          logo: exp.company_logo_url,
          website: exp.company_website,
          location: exp.location,
        })),
      },
      research: {
        title: sectionTitle('research', language),
        content: research.map((item) => ({
          title: item.title,
          location: item.location || item.institution || '',
          date: formatDateRange(item, language),
          details: item.details || [],
        })),
      },
      publications: {
        title: sectionTitle('publications', language),
        content: publications.map((item) => item.title),
      },
      awards: {
        title: sectionTitle('awards', language),
        content: awards.map((item) => item.description || item.title),
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
