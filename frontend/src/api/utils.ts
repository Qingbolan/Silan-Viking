import { API_CONFIG, type Language } from './config';

// Error types
export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const runtimeOrigin = (): string =>
  typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : API_CONFIG.BASE_URL;

export const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN || runtimeOrigin()).replace(/\/+$/, '');

export const apiUrl = (path: string): string => new URL(path, `${API_ORIGIN}/`).toString();

export const mediaUrl = (path: string): string => {
  if (!path.startsWith('/api/')) return path;
  return apiUrl(path);
};

// Build API URLs through one origin resolver. Development remains same-origin
// for the Vite proxy; the NUS mirror pins this to https://silan.tech.
const buildUrl = (endpoint: string, params?: Record<string, any>): string => {
  const url = new URL(apiUrl(endpoint));
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }
  return url.toString();
};

// GET request helper using native fetch to avoid CORS preflight
export const get = <T = any>(
  endpoint: string,
  params?: Record<string, any>,
  options?: { signal?: AbortSignal },
): Promise<T> => {
  const urlStr = buildUrl(endpoint, params);

  return fetch(urlStr, {
    method: 'GET',
    signal: options?.signal,
  }).then(async (response) => {
    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(`API request failed: ${response.status}`, response.status, errorText);
    }

    return response.json();
  });
};

// POST request helper using native fetch to avoid CORS preflight
export const post = <T = any>(endpoint: string, data?: any): Promise<T> => {
  const urlStr = buildUrl(endpoint);

  return fetch(urlStr, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: data ? JSON.stringify(data) : undefined,
  }).then(async (response) => {
    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(`API request failed: ${response.status}`, response.status, errorText);
    }

    return response.json();
  });
};

// DELETE request helper using native fetch to avoid CORS preflight
export const del = <T = any>(endpoint: string, data?: any): Promise<T> => {
  const urlStr = buildUrl(endpoint);

  return fetch(urlStr, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: data ? JSON.stringify(data) : undefined,
  }).then(async (response) => {
    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(`API request failed: ${response.status}`, response.status, errorText);
    }

    // DELETE might return empty response
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  });
};

// PUT request helper using native fetch to avoid CORS preflight
export const put = <T = any>(endpoint: string, data?: any): Promise<T> => {
  const urlStr = buildUrl(endpoint);

  return fetch(urlStr, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: data ? JSON.stringify(data) : undefined,
  }).then(async (response) => {
    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(`API request failed: ${response.status}`, response.status, errorText);
    }

    return response.json();
  });
};

// Language formatting helper
export const formatLanguage = (lang: Language): string => {
  return lang === 'zh' ? 'zh' : 'en';
};
