import type { AnnualPlan, Project, Language, Plan, ProjectWithPlan } from '../../types/api';
import { get, formatLanguage } from '../utils';


// API Functions

const getString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const getNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const getArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

const normalizeAnnualPlan = (annualPlan: AnnualPlan): AnnualPlan => {
  const raw = annualPlan as Record<string, any>;
  return {
    ...annualPlan,
    nameZh: getString(raw.nameZh ?? raw.name_zh, getString(raw.name)),
    descriptionZh: getString(raw.descriptionZh ?? raw.description_zh, getString(raw.description)),
    image: raw.image ?? null,
    icon: getString(raw.icon, 'Calendar'),
    projectCount: getNumber(raw.projectCount ?? raw.project_count, getArray(raw.projects).length),
    objectives: getArray<string>(raw.objectives),
    objectivesZh: getArray<string>(raw.objectivesZh ?? raw.objectives_zh),
    projects: getArray(raw.projects),
  };
};

const normalizeProject = (project: Project): Project => {
  const raw = project as Record<string, any>;
  return {
    ...project,
    id: String(raw.id ?? project.id),
    name: getString(raw.name ?? raw.title, project.name),
    description: getString(raw.description, project.description),
    tags: getArray<string>(raw.tags),
    year: getNumber(raw.year, new Date().getFullYear()),
    annualPlan: getString(raw.annualPlan ?? raw.annual_plan ?? raw.planId ?? raw.plan_id),
  };
};

/**
 * Fetch all annual plans
 */
export const fetchAnnualPlans = async (language: Language = 'en'): Promise<AnnualPlan[]> => {
  const response = await get<AnnualPlan[]>('/api/v1/plans/annual', {
    lang: formatLanguage(language)
  });
  return response.map(normalizeAnnualPlan);
};

/**
 * Get current active annual plan (most recent year)
 */
export const fetchCurrentAnnualPlan = async (language: Language = 'en'): Promise<AnnualPlan | null> => {
  const response = await get<AnnualPlan>('/api/v1/plans/annual/current', {
    lang: formatLanguage(language)
  });
  return response ? normalizeAnnualPlan(response) : null;
};

/**
 * Get annual plan by name
 */
export const fetchAnnualPlanByName = async (planName: string, language: Language = 'en'): Promise<AnnualPlan | null> => {
  const response = await get<AnnualPlan>(`/api/v1/plans/annual/${planName}`, {
    lang: formatLanguage(language)
  });
  return response ? normalizeAnnualPlan(response) : null;
};

/**
 * Fetch all projects with language support
 */
export const fetchProjectsWithAnnualPlans = async (language: Language = 'en'): Promise<Project[]> => {
  const response = await get<Project[]>('/api/v1/plans/projects', {
    lang: formatLanguage(language)
  });
  return response.map(normalizeProject);
};

/**
 * Get projects by annual plan name
 */
export const fetchProjectsByAnnualPlan = async (planName: string, language: Language = 'en'): Promise<Project[]> => {
  try {
    const response = await get<Project[]>(`/api/v1/plans/${planName}/projects`, {
      lang: formatLanguage(language)
    });
    return response;
  } catch (error) {
    // Fallback: filter projects by plan name
    try {
      const projects = await fetchProjectsWithAnnualPlans(language);
      return projects.filter(project => project.annualPlan === planName);
    } catch (fallbackError) {
      console.warn('Failed to fetch projects by plan:', fallbackError);
      return [];
    }
  }
};

// Conversion functions for backward compatibility
const convertAnnualPlanToPlan = (annualPlan: AnnualPlan): Plan => {
  const normalized = normalizeAnnualPlan(annualPlan);
  const goals = getArray<string>(normalized.objectives);
  const goalsZh = getArray<string>(normalized.objectivesZh);

  return {
    id: normalized.name,
    name: normalized.name,
    nameZh: normalized.nameZh || normalized.name,
    description: normalized.description,
    descriptionZh: normalized.descriptionZh || normalized.description,
    slogan: normalized.description,
    sloganZh: normalized.descriptionZh || normalized.description,
    goals,
    goalsZh: goalsZh.length > 0 ? goalsZh : goals,
    image: '/logo.svg',
    icon: 'Calendar',
    startYear: normalized.year,
    endYear: normalized.year,
    status: normalized.year === new Date().getFullYear() ? 'active' :
             normalized.year < new Date().getFullYear() ? 'completed' : 'planned'
  };
};

const convertProjectToProjectWithPlan = (project: Project): ProjectWithPlan => ({
  id: project.id.toString(),
  title: project.name,
  description: project.description,
  // No cover image: `image` is left undefined so the card renders its
  // built-in branded placeholder (per the ProjectWithPlan.image contract).
  // A real cover would come from the API once the project carries one.
  tags: project.tags,
  github: undefined,
  demo: undefined,
  planId: project.annualPlan,
  year: project.year
});

// Backward compatibility wrapper functions
export const fetchPlans = async (language: Language = 'en'): Promise<Plan[]> => {
  const annualPlans = await fetchAnnualPlans(language);
  return annualPlans.map(convertAnnualPlanToPlan);
};

export const fetchCurrentPlan = async (language: Language = 'en'): Promise<Plan | null> => {
  const currentAnnualPlan = await fetchCurrentAnnualPlan(language);
  return currentAnnualPlan ? convertAnnualPlanToPlan(currentAnnualPlan) : null;
};

export const fetchProjectsWithPlans = async (language: Language = 'en'): Promise<ProjectWithPlan[]> => {
  const projects = await fetchProjectsWithAnnualPlans(language);
  return projects.map(convertProjectToProjectWithPlan);
};
