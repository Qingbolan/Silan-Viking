import type {
  Project,
  Language,
  ProjectDetail,
} from '../../types/api';
import { get, post, del, formatLanguage } from '../utils';
import { type PaginationRequest, type ListResponse } from '../config';
import { mapContentParts } from '../contentParts';
import { isPrerenderRuntime } from '../../utils/runtimeContext';

// Backend API request/response types
interface ProjectListRequest extends PaginationRequest {
  type?: string;
  featured?: boolean;
  status?: string;
  search?: string;
  year?: number;
  tags?: string;
}

interface ProjectListResponse extends ListResponse<Project> {
  projects: Project[];
  total: number;
  page: number;
  size: number;
  total_pages: number;
}

const normalizeContentTimestamp = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1 ? undefined : value;
};

const normalizeProject = (raw: any): Project => ({
  id: String(raw.id),
  slug: raw.slug || '',
  name: raw.name || raw.title || '',
  description: raw.description || '',
  tags: Array.isArray(raw.tags) ? raw.tags : [],
  year: Number.isFinite(Number(raw.year)) ? Number(raw.year) : 0,
  status: raw.status || undefined,
  startDate: raw.startDate || raw.start_date || undefined,
  endDate: raw.endDate || raw.end_date || undefined,
  githubUrl: raw.githubUrl || raw.github_url || undefined,
  demoUrl: raw.demoUrl || raw.demo_url || undefined,
  documentationUrl: raw.documentationUrl || raw.documentation_url || undefined,
  thumbnailUrl: raw.thumbnailUrl || raw.thumbnail_url || undefined,
  updatedAt: normalizeContentTimestamp(raw.updatedAt || raw.updated_at),
});


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
  return (response.projects || []).map(normalizeProject);
};

// Canonical project-detail query. The route may carry either the public slug
// or the internal item id; this function resolves the basic record once and
// then loads its detail projection.
export const fetchProjectDetailById = async (
  idOrSlug: string,
  language: Language = 'en'
): Promise<ProjectDetail | null> => {
  const basicRaw = idOrSlug.startsWith('i_')
    ? await get<Project>(`/api/v1/projects/id/${idOrSlug}`, { lang: formatLanguage(language) })
    : await get<any>(`/api/v1/projects/${idOrSlug}`, { lang: formatLanguage(language) });
  if (!basicRaw) return null;

  const basicProject = normalizeProject(basicRaw);
  const projectDetail = await get<any>(`/api/v1/projects/${basicProject.id}/detail`, {
    lang: formatLanguage(language),
  });
  const releaseNotes: string | undefined = projectDetail?.release || projectDetail?.release_notes || undefined;
  const version: string | undefined = projectDetail?.version || undefined;
  const quickStartGuide: string | undefined = projectDetail?.quick_start || undefined;
  const dependenciesDoc: string | undefined = projectDetail?.dependance || projectDetail?.dependencies || undefined;
  const license: string | undefined = projectDetail?.license || undefined;
  const licenseText: string | undefined = projectDetail?.license_text || undefined;
  const timeline = projectDetail?.timeline;
  const rawMetrics = projectDetail?.metrics;
  const hasTimeline = timeline && (timeline.start || timeline.end || timeline.duration);
  const hasMetrics = rawMetrics && Object.values(rawMetrics).some((value) => Number(value) > 0);

  const detail: ProjectDetail = {
    id: basicProject.id,
    title: basicProject.name,
    description: basicProject.description,
    fullDescription: projectDetail?.detailed_description || projectDetail?.project_details || basicProject.description,
    image: basicProject.thumbnailUrl,
    goals: projectDetail?.goals || undefined,
    challenges: projectDetail?.challenges || undefined,
    solutions: projectDetail?.solutions || undefined,
    lessons: projectDetail?.lessons || undefined,
    parts: mapContentParts(projectDetail?.parts),
    tags: basicProject.tags,
    year: basicProject.year,
    relatedBlogs: projectDetail?.related_blogs || [],
    github: basicProject.githubUrl,
    demo: basicProject.demoUrl,
    status: (basicProject.status || basicProject.updatedAt || license)
      ? {
          lifecycle: basicProject.status,
          lastUpdated: basicProject.updatedAt,
          license,
        }
      : undefined,
    timeline: hasTimeline ? timeline : undefined,
    metrics: hasMetrics
      ? {
          linesOfCode: Number(rawMetrics.lines_of_code || rawMetrics.linesOfCode || 0),
          commits: Number(rawMetrics.commits || 0),
          stars: Number(rawMetrics.stars || 0),
          downloads: Number(rawMetrics.downloads || 0),
        }
      : undefined,
    versions: (version || releaseNotes)
      ? {
          latest: version || '',
          releases: releaseNotes
            ? [{
                version: version || '',
                date: projectDetail?.updated_at || '',
                description: releaseNotes,
                downloadCount: 0,
                assets: [],
                notes: releaseNotes,
              }]
            : [],
        }
      : undefined,
    quickStart: quickStartGuide
      ? { installation: [], basicUsage: quickStartGuide, requirements: [] }
      : undefined,
    dependencies: dependenciesDoc
      ? { production: [], development: [], raw: dependenciesDoc }
      : undefined,
  };

  if (licenseText) {
    detail.licenseInfo = {
      name: license || '',
      spdxId: license || '',
      fullText: licenseText,
      url: '',
      permissions: [],
      conditions: [],
      limitations: [],
      description: '',
    };
  }

  return detail;
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
  can_delete: boolean;
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
  language: 'en' | 'zh' = 'en'
): Promise<ProjectCommentData[]> => {
  const response = await get<ProjectCommentListResponse>(
    `/api/v1/projects/${projectId}/comments`,
    {
      type,
      lang: formatLanguage(language),
      fingerprint,
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
  if (options?.parentId && options.parentId.trim()) body.parent_id = options.parentId.trim();

  if (body.author_name || body.author_email) {
    if (!body.author_name || typeof body.author_name !== 'string' || !body.author_name.trim()) {
      throw new Error('author_name is required');
    }
    if (!body.author_email || typeof body.author_email !== 'string' || body.author_email.trim().length < 5 || !body.author_email.includes('@')) {
      throw new Error('author_email is required and must be valid');
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
  language: 'en' | 'zh' = 'en'
): Promise<LikeProjectCommentResponse> => {
  const data: any = { lang: formatLanguage(language) };
  if (fingerprint) data.fingerprint = fingerprint;
  const res = await post<LikeProjectCommentResponse>(`/api/v1/projects/comments/${commentId}/like`, data);
  return res;
};

/**
 * Delete a project comment
 */
export const deleteProjectComment = async (
  commentId: string,
  payload: { fingerprint: string; language?: 'en' | 'zh' }
): Promise<void> => {
  await del(`/api/v1/projects/comments/${commentId}`, {
    fingerprint: payload.fingerprint,
  });
};

// ====== Project Issue Helpers (built on top of comment APIs) ======

export interface ProjectIssueRecord {
  id: string;
  title: string;
  description: string;
  type: 'bug' | 'enhancement' | 'question' | 'documentation';
  priority: 'low' | 'medium' | 'high';
  labels: string[];
  author: string;
  author_avatar?: string;
  created: string;
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
): ProjectIssueRecord => {
  const { title, description, issueType, priority, labels } = parseIssueContent(comment.content);
  const mergedLabels = Array.from(new Set([issueType, `${priority}-priority`, ...labels]));

  return {
    id: comment.id,
    title,
    description: description || 'No description provided',
    type: issueType,
    priority,
    labels: mergedLabels,
    author: comment.author_name,
    author_avatar: comment.author_avatar_url,
    created: comment.created_at,
    comments: comment.replies?.length || 0,
    likes: comment.likes_count,
    comment,
  };
};

export const fetchProjectIssues = async (
  projectId: string,
  language: Language = 'en'
): Promise<ProjectIssueRecord[]> => {
  const comments = await listProjectComments(projectId, 'issue', undefined, language);
  return comments
    .map((comment) => buildIssueFromComment(comment))
    .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
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
      language: payload.language ?? 'en'
    }
  );

  return buildIssueFromComment(comment);
};

export const fetchProjectIssueThread = async (
  projectId: string,
  issueId: string,
  options: {
    fingerprint?: string;
    language?: 'en' | 'zh';
  } = {}
): Promise<ProjectCommentData | null> => {
  const comments = await listProjectComments(
    projectId,
    'issue',
    options.fingerprint,
    options.language ?? 'en'
  );
  return comments.find((comment) => comment.id === issueId) ?? null;
};

export const projectIssueFromComment = (comment: ProjectCommentData): ProjectIssueRecord => {
  return buildIssueFromComment(comment);
};

/**
 * Delete a project issue (uses deleteProjectComment internally)
 */
export const deleteProjectIssue = async (
  issueId: string,
  payload: { fingerprint: string; language?: 'en' | 'zh' }
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
    clientIP?: string;
    userAgent?: string;
    language?: 'en' | 'zh';
  } = {}
): Promise<LikeProjectResponse> => {
  const body: any = {
    fingerprint,
  };

  if (options.clientIP) body.client_ip = options.clientIP;
  body.user_agent_full = options.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  body.referrer = typeof document !== 'undefined' ? document.referrer : '';
  body.landing_url = typeof window !== 'undefined' ? window.location.href : '';

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
    clientIP?: string;
    userAgent?: string;
    language?: 'en' | 'zh';
  } = {}
): Promise<RecordProjectViewResponse> => {
  if (isPrerenderRuntime()) {
    return { views_count: 0, view_recorded: false };
  }

  const body: any = {
    fingerprint,
  };

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
    language?: 'en' | 'zh';
  } = {}
): Promise<ProjectMetricsResponse> => {
  const params: any = {
    lang: formatLanguage(options.language || 'en'),
  };

  if (options.fingerprint) params.fingerprint = options.fingerprint;

  const response = await get<ProjectMetricsResponse>(`/api/v1/projects/${projectId}/metrics`, params);
  return response;
};
