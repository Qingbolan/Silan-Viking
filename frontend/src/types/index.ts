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

export interface Resource {
  id: string;
  title: string;
  type: 'article' | 'video' | 'tool' | 'documentation' | 'paper' | 'other';
  url: string;
  description?: string;
  descriptionZh?: string;
}
