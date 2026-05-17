// Central API exports
export * from './home/resumeApi';
export * from './projects/projectApi';
export * from './ideas/ideaApi';
export * from './episodes/episodeApi';
export * from './updates/updateApi';
// Avoid type name collisions across APIs by namespacing comment-like types
export * as BlogAPI from './blog/blogApi';
export * as ProjectAPI from './projects/projectApi';
export * as IdeaAPI from './ideas/ideaApi';
export * as ResumeAPI from './home/resumeApi';
export * as EpisodeAPI from './episodes/episodeApi';
export * as UpdateAPI from './updates/updateApi';
// Backward compatibility: re-export common functions without conflicting types
export {
  fetchBlogPosts,
  fetchBlogById,
  searchBlogPosts,
  getBlogCategories,
  getBlogTags,
  updateBlogViews,
  updateBlogLikes,
  listBlogComments,
  createBlogComment,
  deleteBlogComment,
  likeComment as likeBlogComment,
} from './blog/blogApi';

// Export specific functions from plans/planApi to avoid conflicts
export { 
  fetchAnnualPlans, 
  fetchCurrentAnnualPlan, 
  fetchAnnualPlanByName,
  fetchProjectsWithAnnualPlans,
  fetchProjectsByAnnualPlan,
  // Backward compatibility exports
  fetchPlans,
  fetchCurrentPlan,
  fetchProjectsWithPlans
} from './plans/planApi';

// Export API configuration and utilities
export { API_CONFIG } from './config';
export { 
  get, 
  post, 
  put, 
  del, 
  formatLanguage 
} from './utils';

// Re-export types for convenience
export type {
  ResumeData,
  PersonalInfo,
  Language,
  Contact,
  SocialLink,
  EducationItem,
  ResearchItem,
  ExperienceItem,
  RecentUpdate,
  Plan,
  ProjectWithPlan,
  Project,
  ProjectDetail,
  AnnualPlan,
  GraphData
} from '../types/api';

// Export API configuration types
export type {
  BaseRequest,
  PaginationRequest,
  SearchRequest,
  ListResponse
} from './config'; 
