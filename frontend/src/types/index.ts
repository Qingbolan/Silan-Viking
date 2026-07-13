// Common types for the application

export interface Theme {
  isDark: boolean;
  toggleTheme: () => void;
}

export interface Language {
  language: string;
  changeLanguage: (lang: string) => void;
  t: (key: string) => string;
}

export interface ProjectData {
  id: string;
  title: string;
  titleZh?: string;
  description: string;
  descriptionZh?: string;
  /** Cover image URL. Absent when the project has no cover — the card then
   *  renders its built-in branded placeholder. */
  image?: string;
  tags: string[];
  link?: string;
  github?: string;
  demo?: string;
}

export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  date: string;
  author: string;
  tags: string[];
  image?: string;
}

export interface SkillData {
  name: string;
  level: number;
  category: string;
}

export interface ExperienceData {
  id: string;
  company: string;
  position: string;
  duration: string;
  description: string[];
  technologies: string[];
}

export interface EducationData {
  id: string;
  institution: string;
  degree: string;
  duration: string;
  description?: string;
}

export interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export interface IdeaData {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  status: 'draft' | 'hypothesis' | 'experimenting' | 'validating' | 'published' | 'concluded';
  priority?: 'high' | 'medium' | 'low';
  createdAt: string;
  lastUpdated?: string;
  
  // Academic/Research oriented fields
  abstract?: string;
  abstractZh?: string;
  hypothesis?: string;
  hypothesisZh?: string;
  motivation?: string;
  motivationZh?: string;
  progress?: string;
  progressZh?: string;
  
  // Research methodology
  methodology?: string;
  methodologyZh?: string;
  experiments?: Experiment[];
  preliminaryResults?: string;
  preliminaryResultsZh?: string;
  results?: string;
  resultsZh?: string;
  
  // Academic context
  relatedWorks?: Reference[];
  citations?: Reference[];
  futureDirections?: string[];
  futureDirectionsZh?: string[];
  reference?: string;
  referenceZh?: string;
  
  // Implementation details (if applicable)
  techStack?: string[];
  codeRepository?: string;
  demoUrl?: string;
  
  // Community and collaboration
  collaborators?: Collaborator[];
  openForCollaboration?: boolean;
  feedbackRequested?: FeedbackType[];
  
  // Publication status
  publications?: Publication[];
  conferences?: string[];
  
  // Validation and results
  validationStatus?: 'not-started' | 'in-progress' | 'completed' | 'failed';
  keyFindings?: string[];
  keyFindingsZh?: string[];
  limitations?: string[];
  limitationsZh?: string[];
  
  // Additional metadata
  difficulty?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  researchField?: string;
  keywords?: string[];
  estimatedDuration?: string;
  fundingStatus?: 'unfunded' | 'seeking' | 'funded';

  // Data-driven Part list — whatever Parts the Item actually has, in
  // sort_order. The named fields above are a compatibility shim; the detail
  // page renders one tab per Part from here. See [[ContentPart]].
  parts?: ContentPart[];
}

/**
 * A single Part of a content Item, as returned by every detail endpoint.
 * The SCHEMA `parts` set is a *recommendation*, not a closed whitelist — an
 * Item may carry a Part whose `role` no type predeclares. The UI renders one
 * tab per Part, in `sortOrder`, with no fixed role list: a `prose` Part shows
 * its markdown body, an `entry_list` Part shows its entries.
 */
export interface ContentEntry {
  id: string;
  entryId: string;
  sortOrder: number;
  sharedPayload: Record<string, unknown>;
  localizedPayload: Record<string, unknown>;
}

export interface ContentPart {
  id: string;
  partId: string;
  role: string;
  shape: 'prose' | 'entry_list' | string;
  sortOrder: number;
  canonicalLang: string;
  /** Prose body keyed by language code (e.g. `en`, `zh`). */
  body: Record<string, string>;
  entries: ContentEntry[];
}

export interface Experiment {
  id: string;
  title: string;
  titleZh?: string;
  description: string;
  descriptionZh?: string;
  status: 'planned' | 'running' | 'completed' | 'failed';
  startDate?: string;
  endDate?: string;
  results?: string;
  resultsZh?: string;
  dataUrl?: string;
}

export interface Reference {
  id: string;
  title: string;
  authors: string[];
  year: number;
  venue?: string; // journal/conference
  url?: string;
  doi?: string;
  notes?: string;
  notesZh?: string;
}

export interface Collaborator {
  id: string;
  name: string;
  affiliation?: string;
  role: 'author' | 'advisor' | 'contributor' | 'reviewer';
  contact?: string;
}

export interface Publication {
  id: string;
  title: string;
  authors: string[];
  venue: string;
  year: number;
  status: 'submitted' | 'under-review' | 'accepted' | 'published';
  url?: string;
  doi?: string;
}

export interface FeedbackType {
  type: 'methodology' | 'theoretical' | 'implementation' | 'writing' | 'general';
  description: string;
  descriptionZh?: string;
}

export interface Milestone {
  id: string;
  title: string;
  titleZh?: string;
  description: string;
  descriptionZh?: string;
  status: 'todo' | 'in-progress' | 'completed';
  dueDate?: string;
  completedDate?: string;
}

export interface Resource {
  id: string;
  title: string;
  type: 'article' | 'video' | 'tool' | 'documentation' | 'paper' | 'other';
  url: string;
  description?: string;
  descriptionZh?: string;
}
