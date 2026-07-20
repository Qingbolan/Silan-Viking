// API Configuration
export const API_CONFIG = {
  BASE_URL: 'https://silan.tech',
  DEFAULT_HEADERS: {
  },
  TIMEOUT: 10000, // 10 seconds
};

// API Response Types
export interface ApiResponse<T = any> {
  data?: T;
  message?: string;
  error?: string;
  success?: boolean;
}

export interface ListResponse<T> {
  items?: T[];
  total?: number;
  page?: number;
  size?: number;
  totalPages?: number;
  // Backend API specific response structure
  projects?: T[];
  posts?: T[];
  moments?: T[];
  total_pages?: number; // Backend uses snake_case
}

// Language type
export type Language = 'en' | 'zh';

// Common request parameters
export interface BaseRequest {
  lang?: Language;
}

export interface PaginationRequest extends BaseRequest {
  page?: number;
  size?: number;
}

export interface SearchRequest extends PaginationRequest {
  search?: string;
  category?: string;
  tags?: string;
}

// Backend API specific response types
export interface ProjectListResponse {
  projects: any[];
  total: number;
  page: number;
  size: number;
  total_pages: number;
}

export interface BlogListResponse {
  posts: any[];
  total: number;
  page: number;
  size: number;
  total_pages: number;
}

export interface MomentListResponse {
  moments: any[];
  total: number;
}
