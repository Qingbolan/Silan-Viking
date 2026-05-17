import type {
  Project,
  ProjectWithPlan,
  AnnualPlan,
  GraphData,
  Language,
  ProjectDetail,
  ProjectBlogReference
} from '../../types/api';
import { get, post, del, formatLanguage } from '../utils';
import { type PaginationRequest, type SearchRequest, type ListResponse } from '../config';

// Backend API request/response types
interface ProjectListRequest extends PaginationRequest {
  type?: string;
  featured?: boolean;
  status?: string;
  search?: string;
  year?: number;
  annual_plan?: string;
  tags?: string;
}

interface ProjectListResponse extends ListResponse<Project> {
  projects: Project[];
  total: number;
  page: number;
  size: number;
  total_pages: number;
}

interface ProjectSearchRequest extends SearchRequest {
  query?: string;
  tags?: string;
  year?: number;
  plan_id?: string;
}


// API Functions

/**
 * Get projects list with pagination and filtering
 */
export const fetchProjects = async (
  params: Partial<ProjectListRequest> = {},
  language: Language = 'en'
): Promise<Project[]> => {
  const response = await get<ProjectListResponse>('/api/v1/projects', {
    ...params,
    lang: formatLanguage(language)
  });
  return response.projects || [];
};

/**
 * Get single project by slug
 */
export const fetchProject = async (
  slug: string, 
  language: Language = 'en'
): Promise<Project | null> => {
  const response = await get<Project>(`/api/v1/projects/${slug}`, {
    lang: formatLanguage(language)
  });
  return response;
};

/**
 * Get single project by ID (numeric)
 */
export const fetchProjectById = async (
  id: number | string, 
  language: Language = 'en'
): Promise<Project | null> => {
  const response = await get<Project>(`/api/v1/projects/id/${id}`, {
    lang: formatLanguage(language)
  });
  return response;
};

/**
 * Get detailed project information
 */
export const fetchProjectDetail = async (
  id: string, 
  language: Language = 'en'
): Promise<ProjectDetail | null> => {
  const response = await get<ProjectDetail>(`/api/v1/projects/${id}/detail`, {
    lang: formatLanguage(language)
  });
  return response;
};

/**
 * Get project categories
 */
export const fetchCategories = async (language: Language = 'en'): Promise<string[]> => {
  const response = await get<string[]>('/api/v1/projects/categories', {
    lang: formatLanguage(language)
  });
  return response;
};

/**
 * Get project technologies/tags
 */
export const getProjectTags = async (language: Language = 'en'): Promise<string[]> => {
  const response = await get<string[]>('/api/v1/projects/tags', {
    lang: formatLanguage(language)
  });
  return response;
};

/**
 * Get project graph data for visualization
 */
export const fetchGraphData = async (
  category: string = 'all', 
  language: Language = 'en'
): Promise<GraphData> => {
  const response = await get<GraphData>('/api/v1/projects/graph', {
    category,
    lang: formatLanguage(language)
  });
  return response;
};

/**
 * Get project related blogs
 */
export const getProjectRelatedBlogs = async (
  projectId: string, 
  language: Language = 'en'
): Promise<ProjectBlogReference[]> => {
  const response = await get<ProjectBlogReference[]>(`/api/v1/projects/${projectId}/blogs`, {
    lang: formatLanguage(language)
  });
  return response;
};

/**
 * Search project details with filters
 */
export const searchProjectDetails = async (
  params: ProjectSearchRequest,
  language: Language = 'en'
): Promise<ProjectDetail[]> => {
  const response = await get<ProjectDetail[]>('/api/v1/projects/search', {
    ...params,
    lang: formatLanguage(language)
  });
  return response;
};

// Extended functions for project details
export const fetchProjectDetailById = async (
  id: string, 
  language: Language = 'en'
): Promise<ProjectDetail | null> => {
  try {
    // Fetch both basic project info and detail info
    const [basicProject, projectDetail] = await Promise.all([
      get<Project>(`/api/v1/projects/id/${id}`, {
        lang: formatLanguage(language)
      }),
      get<any>(`/api/v1/projects/${id}/detail`, {
        lang: formatLanguage(language)
      }).catch(() => null) // Don't fail if detail doesn't exist
    ]);

    if (!basicProject) {
      return null;
    }

    // Merge basic project info with detail info to create a complete ProjectDetail
    const licenseName = projectDetail?.license || 'MIT';
    const licenseText: string | undefined = projectDetail?.license_text;
    const releaseNotes: string | undefined = projectDetail?.release || projectDetail?.release_notes;
    const quickStartGuide: string | undefined = projectDetail?.quick_start;
    const dependenciesDoc: string | undefined = projectDetail?.dependance || projectDetail?.dependencies;

    const mergedDetail: ProjectDetail = {
      id: basicProject.id,
      title: basicProject.name,
      description: basicProject.description,
      fullDescription: projectDetail?.detailed_description || projectDetail?.project_details || basicProject.description,
      tags: basicProject.tags || [],
      year: basicProject.year,

      // Timeline from detail or defaults
      timeline: projectDetail?.timeline || {
        start: '',
        end: '',
        duration: ''
      },

      // Metrics from detail or defaults
      metrics: projectDetail?.metrics || {
        linesOfCode: 0,
        commits: 0,
        stars: 0,
        downloads: 0
      },

      // Related blogs
      relatedBlogs: projectDetail?.related_blogs || [],

      // Version info with release notes
      versions: {
        latest: projectDetail?.version || '1.0.0',
        releases: releaseNotes
          ? [{
              version: projectDetail?.version || '1.0.0',
              date: projectDetail?.updated_at || new Date().toISOString().split('T')[0],
              description: releaseNotes,
              downloadCount: 0,
              assets: [],
              // Include markdown notes for UI markdown rendering
              notes: releaseNotes,
            }]
          : []
      },

      // Default status info
      status: {
        buildStatus: 'unknown' as const,
        coverage: 0,
        vulnerabilities: 0,
        lastUpdated: projectDetail?.updated_at || new Date().toISOString().split('T')[0],
        license: projectDetail?.license || 'MIT',
        language: 'Multiple',
        size: 'Medium'
      },

      // Always provide quickStart object; UI handles empty content
      quickStart: {
        installation: [],
        basicUsage: quickStartGuide || '',
        requirements: []
      },

      // Default community info
      community: {
        contributors: 1,
        forks: 0,
        watchers: 0,
        issues: {
          open: 0,
          closed: 0,
          recent: []
        },
        discussions: []
      },

      // Dependencies from database or defaults
      dependencies: dependenciesDoc
        ? {
            production: [],
            development: [],
            // Additional raw markdown for UI rendering
            raw: dependenciesDoc as any,
          } as any
        : {
            production: [],
            development: []
          },

      // Default performance
      performance: {
        benchmarks: [],
        analytics: {
          downloads: [],
          usage: []
        }
      },

      // Additional fields
      features: [],
      teamSize: 1,
      myRole: 'Developer',
      planId: basicProject.annualPlan,

      // URLs (these might not be in the basic project, so we use defaults)
      github: '', // These would need to be added to the basic project type
      demo: ''    // or fetched from somewhere else
    };

    // Populate licenseInfo if backend returned full license text
    if (licenseText) {
      (mergedDetail as any).licenseInfo = {
        name: licenseName,
        spdxId: licenseName,
        fullText: licenseText,
        url: '',
        permissions: [],
        conditions: [],
        limitations: [],
        description: ''
      };
    }

    return mergedDetail;
  } catch (err) {
    console.error('Error fetching project detail:', err);
    return null;
  }
};

// Backward compatibility exports
export const fetchAnnualPlans = async (language: Language = 'en'): Promise<AnnualPlan[]> => {
  // This function is now handled by plans API
  const { fetchAnnualPlans: fetchPlans } = await import('../plans/planApi');
  return fetchPlans(language);
};

export const fetchAnnualPlanByName = async (
  name: string, 
  language: Language = 'en'
): Promise<AnnualPlan | null> => {
  // This function is now handled by plans API
  const { fetchAnnualPlanByName: fetchPlanByName } = await import('../plans/planApi');
  return fetchPlanByName(name, language);
};

export const fetchProjectsWithPlans = async (
  language: Language = 'en'
): Promise<ProjectWithPlan[]> => {
  const projects = await fetchProjects({}, language);

  return projects.map((project) => {
    const projectAny = project as Record<string, any>;

    const titleZh =
      projectAny.titleZh ??
      projectAny.nameZh ??
      projectAny.title_zh ??
      projectAny.name_zh;
    const descriptionZh =
      projectAny.descriptionZh ?? projectAny.description_zh;
    const github =
      projectAny.github ??
      projectAny.githubUrl ??
      projectAny.github_url;
    const demo =
      projectAny.demo ??
      projectAny.demoUrl ??
      projectAny.demo_url ??
      projectAny.previewUrl ??
      projectAny.preview_url;
    const rawTags = projectAny.tags ?? project.tags;
    const tags = Array.isArray(rawTags) ? rawTags : [];
    const rawYear = projectAny.year ?? project.year;
    const parsedYear =
      typeof rawYear === 'string'
        ? Number.parseInt(rawYear, 10)
        : rawYear;
    const year = Number.isFinite(parsedYear)
      ? (parsedYear as number)
      : new Date().getFullYear();
    const planId =
      projectAny.planId ??
      projectAny.annualPlan ??
      projectAny.plan_id ??
      project.annualPlan ??
      '';

    return {
      id: String(project.id),
      title: projectAny.title ?? projectAny.name ?? project.name,
      titleZh,
      description: projectAny.description ?? project.description,
      descriptionZh,
      // No fake-URL fallback: when the project has no cover, leave `image`
      // undefined so `ProjectCard` renders its built-in branded placeholder
      // instead of a broken-image icon from a non-existent endpoint.
      image:
        projectAny.image ??
        projectAny.coverImage ??
        projectAny.cover_image ??
        projectAny.thumbnail_url ??
        projectAny.thumbnailUrl ??
        undefined,
      tags,
      github,
      demo,
      planId,
      year,
    } satisfies ProjectWithPlan;
  });
};

export const fetchProjectsByPlan = async (
  planName: string,
  language: Language = 'en'
): Promise<Project[]> => {
  const projects = await fetchProjects({}, language);
  return projects.filter((project) => {
    const projectAny = project as Record<string, any>;
    const projectPlan =
      project.annualPlan ??
      projectAny.annual_plan ??
      projectAny.planId ??
      projectAny.plan_id;
    return projectPlan === planName;
  });
};

// ====== Project Comment API Functions ======

export interface ProjectCommentData {
  id: string;
  project_id: string;
  parent_id?: string;
  author_name: string;
  author_avatar_url?: string;
  content: string;
  type: string;
  created_at: string;
  user_identity_id?: string;
  likes_count: number;
  is_liked_by_user: boolean;
  replies: ProjectCommentData[];
}

export interface ProjectCommentListResponse {
  comments: ProjectCommentData[];
  total: number;
}

export interface LikeProjectCommentResponse {
  likes_count: number;
  is_liked_by_user: boolean;
}

/**
 * List project comments by type
 */
export const listProjectComments = async (
  projectId: string,
  type: string = 'general',
  fingerprint?: string,
  userIdentityId?: string,
  language: 'en' | 'zh' = 'en'
): Promise<ProjectCommentData[]> => {
  const response = await get<ProjectCommentListResponse>(
    `/api/v1/projects/${projectId}/comments`,
    {
      type,
      lang: formatLanguage(language),
      fingerprint,
      user_identity_id: userIdentityId,
    }
  );
  return response.comments || [];
};

/**
 * Create a new project comment
 */
export const createProjectComment = async (
  projectId: string,
  content: string,
  fingerprint: string,
  options?: {
    type?: string;
    authorName?: string;
    authorEmail?: string;
    userIdentityId?: string;
    parentId?: string;
    language?: 'en' | 'zh';
  }
): Promise<ProjectCommentData> => {
  const body: any = {
    content,
    type: options?.type || 'general',
    fingerprint,
  };
  if (options?.authorName && options.authorName.trim()) body.author_name = options.authorName.trim();
  if (options?.authorEmail && options.authorEmail.trim()) body.author_email = options.authorEmail.trim();
  if (options?.userIdentityId && options.userIdentityId.trim()) body.user_identity_id = options.userIdentityId.trim();
  if (options?.parentId && options.parentId.trim()) body.parent_id = options.parentId.trim();

  // Align with backend model: if no user_identity_id provided, backend requires author_name and author_email
  if (!body.user_identity_id) {
    if (!body.author_name || typeof body.author_name !== 'string' || !body.author_name.trim()) {
      body.author_name = 'Anonymous';
    }
    if (!body.author_email || typeof body.author_email !== 'string' || body.author_email.trim().length < 5 || !body.author_email.includes('@')) {
      body.author_email = 'anonymous@example.com';
    }
  }

  // Add language as query parameter
  const url = `/api/v1/projects/${projectId}/comments?lang=${formatLanguage(options?.language || 'en')}`;
  const res = await post<ProjectCommentData>(url, body);
  return res;
};

/**
 * Like/unlike a project comment
 */
export const likeProjectComment = async (
  commentId: string,
  fingerprint?: string,
  userIdentityId?: string,
  language: 'en' | 'zh' = 'en'
): Promise<LikeProjectCommentResponse> => {
  const data: any = { lang: formatLanguage(language) };
  if (fingerprint) data.fingerprint = fingerprint;
  if (userIdentityId) data.user_identity_id = userIdentityId;
  const res = await post<LikeProjectCommentResponse>(`/api/v1/projects/comments/${commentId}/like`, data);
  return res;
};

/**
 * Delete a project comment
 */
export const deleteProjectComment = async (
  commentId: string,
  payload: { fingerprint: string; userIdentityId?: string; language?: 'en' | 'zh' }
): Promise<void> => {
  await del(`/api/v1/projects/comments/${commentId}`, {
    fingerprint: payload.fingerprint,
    user_identity_id: payload.userIdentityId || '',
  });
};

// ====== Project Issue Helpers (built on top of comment APIs) ======

export interface ProjectIssueRecord {
  id: string;
  number: number;
  title: string;
  description: string;
  status: 'open' | 'closed';
  type: 'bug' | 'enhancement' | 'question' | 'documentation';
  priority: 'low' | 'medium' | 'high';
  labels: string[];
  author: string;
  author_avatar?: string;
  created: string;
  updated: string;
  comments: number;
  likes: number;
  comment: ProjectCommentData;
}

export interface CreateProjectIssuePayload {
  projectId: string;
  title: string;
  description: string;
  issueType: 'bug' | 'enhancement' | 'question' | 'documentation';
  priority: 'low' | 'medium' | 'high';
  labels?: string[];
  fingerprint: string;
  authorName?: string;
  authorEmail?: string;
  userIdentityId?: string;
  language?: 'en' | 'zh';
}

const ISSUE_DELIMITER = '\n---\n';

const serializeIssueContent = (payload: CreateProjectIssuePayload): string => {
  const labelLine = payload.labels && payload.labels.length > 0
    ? `\n**Labels:** ${payload.labels.join(', ')}`
    : '';

  const metaBlock = `**Issue Type:** ${payload.issueType}\n**Priority:** ${payload.priority}${labelLine}`;

  return `# ${payload.title}\n\n${payload.description.trim()}${ISSUE_DELIMITER}${metaBlock}`;
};

const parseIssueContent = (content: string) => {
  const [headerAndBody, metaRaw = ''] = content.split(ISSUE_DELIMITER);
  const lines = headerAndBody.split('\n');
  const titleLine = lines.shift() ?? '';
  const title = titleLine.replace(/^#+\s*/, '').trim() || 'Untitled Issue';
  const description = lines.join('\n').trim();

  const meta: Record<string, string> = {};
  metaRaw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const match = line.match(/\*\*(.+?):\*\*\s*(.+)/);
      if (match) {
        meta[match[1].toLowerCase()] = match[2];
      }
    });

  const issueType = (meta['issue type'] as CreateProjectIssuePayload['issueType']) || 'bug';
  const priority = (meta['priority'] as CreateProjectIssuePayload['priority']) || 'medium';
  const labels = meta['labels'] ? meta['labels'].split(',').map((label) => label.trim()).filter(Boolean) : [];

  return {
    title,
    description,
    issueType,
    priority,
    labels,
  };
};

const buildIssueFromComment = (
  comment: ProjectCommentData,
  number: number
): ProjectIssueRecord => {
  const { title, description, issueType, priority, labels } = parseIssueContent(comment.content);
  const mergedLabels = Array.from(new Set([issueType, `${priority}-priority`, ...labels]));

  return {
    id: comment.id,
    number,
    title,
    description: description || 'No description provided',
    status: 'open',
    type: issueType,
    priority,
    labels: mergedLabels,
    author: comment.author_name,
    author_avatar: comment.author_avatar_url,
    created: comment.created_at,
    updated: comment.created_at,
    comments: comment.replies?.length || 0,
    likes: comment.likes_count,
    comment,
  };
};

export const fetchProjectIssues = async (
  projectId: string,
  language: Language = 'en'
): Promise<ProjectIssueRecord[]> => {
  const comments = await listProjectComments(projectId, 'issue', undefined, undefined, language);
  const sorted = comments
    .map((comment) => buildIssueFromComment(comment, 0))
    .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());

  return sorted.map((issue, index) => ({
    ...issue,
    number: sorted.length - index,
  }));
};

export const createProjectIssue = async (
  payload: CreateProjectIssuePayload
): Promise<ProjectIssueRecord> => {
  const content = serializeIssueContent(payload);

  const comment = await createProjectComment(
    payload.projectId,
    content,
    payload.fingerprint,
    {
      type: 'issue',
      authorName: payload.authorName,
      authorEmail: payload.authorEmail,
      userIdentityId: payload.userIdentityId,
      language: payload.language ?? 'en'
    }
  );

  return buildIssueFromComment(comment, 0);
};

export const fetchProjectIssueThread = async (
  projectId: string,
  issueId: string,
  options: {
    fingerprint?: string;
    userIdentityId?: string;
    language?: 'en' | 'zh';
  } = {}
): Promise<ProjectCommentData | null> => {
  const comments = await listProjectComments(
    projectId,
    'issue',
    options.fingerprint,
    options.userIdentityId,
    options.language ?? 'en'
  );
  return comments.find((comment) => comment.id === issueId) ?? null;
};

export const projectIssueFromComment = (comment: ProjectCommentData): ProjectIssueRecord => {
  return buildIssueFromComment(comment, 0);
};

/**
 * Delete a project issue (uses deleteProjectComment internally)
 */
export const deleteProjectIssue = async (
  issueId: string,
  payload: { fingerprint: string; userIdentityId?: string; language?: 'en' | 'zh' }
): Promise<void> => {
  return deleteProjectComment(issueId, payload);
};

// ====== Project Likes & Views API Functions ======

export interface LikeProjectResponse {
  likes_count: number;
  is_liked_by_user: boolean;
}

export interface RecordProjectViewResponse {
  views_count: number;
  view_recorded: boolean;
}

export interface ProjectMetricsResponse {
  likes_count: number;
  views_count: number;
  is_liked_by_user: boolean;
}

/**
 * Like/unlike a project
 */
export const likeProject = async (
  projectId: string,
  fingerprint: string,
  options: {
    userIdentityId?: string;
    clientIP?: string;
    userAgent?: string;
    language?: 'en' | 'zh';
  } = {}
): Promise<LikeProjectResponse> => {
  const body: any = {
    fingerprint,
  };

  if (options.userIdentityId) body.user_identity_id = options.userIdentityId;
  if (options.clientIP) body.client_ip = options.clientIP;
  body.user_agent_full = options.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  body.referrer = typeof document !== 'undefined' ? document.referrer : '';

  const url = `/api/v1/projects/${projectId}/like?lang=${formatLanguage(options.language || 'en')}`;
  const response = await post<LikeProjectResponse>(url, body);
  return response;
};

/**
 * Record a project view
 */
export const recordProjectView = async (
  projectId: string,
  fingerprint: string,
  options: {
    userIdentityId?: string;
    clientIP?: string;
    userAgent?: string;
    language?: 'en' | 'zh';
  } = {}
): Promise<RecordProjectViewResponse> => {
  const body: any = {
    fingerprint,
  };

  if (options.userIdentityId) body.user_identity_id = options.userIdentityId;
  if (options.clientIP) body.client_ip = options.clientIP;
  body.user_agent_full = options.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  body.referrer = typeof document !== 'undefined' ? document.referrer : '';

  const url = `/api/v1/projects/${projectId}/view?lang=${formatLanguage(options.language || 'en')}`;
  const response = await post<RecordProjectViewResponse>(url, body);
  return response;
};

/**
 * Get project metrics (likes, views, user like status)
 */
export const getProjectMetrics = async (
  projectId: string,
  options: {
    fingerprint?: string;
    userIdentityId?: string;
    language?: 'en' | 'zh';
  } = {}
): Promise<ProjectMetricsResponse> => {
  const params: any = {
    lang: formatLanguage(options.language || 'en'),
  };

  if (options.fingerprint) params.fingerprint = options.fingerprint;
  if (options.userIdentityId) params.user_identity_id = options.userIdentityId;

  const response = await get<ProjectMetricsResponse>(`/api/v1/projects/${projectId}/metrics`, params);
  return response;
};
