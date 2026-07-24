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

export class ApiTimeoutError extends ApiError {
  constructor(timeoutMs: number) {
    super(`API request timed out after ${timeoutMs}ms`, 408);
    this.name = 'ApiTimeoutError';
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

interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

const request = <T = any>(
  urlStr: string,
  init: RequestInit,
  options?: RequestOptions,
): Promise<T> => {
  const timeoutMs = Math.max(1, options?.timeoutMs ?? API_CONFIG.TIMEOUT);
  const controller = new AbortController();
  let didTimeout = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const abortFromCaller = () => {
    controller.abort(options?.signal?.reason);
  };

  if (options?.signal?.aborted) {
    abortFromCaller();
  } else if (options?.signal) {
    options.signal.addEventListener('abort', abortFromCaller, { once: true });
  }

  timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  return fetch(urlStr, {
    ...init,
    signal: controller.signal,
  }).then(async (response) => {
    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(`API request failed: ${response.status}`, response.status, errorText);
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }).catch((error) => {
    if (didTimeout) throw new ApiTimeoutError(timeoutMs);
    throw error;
  }).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    options?.signal?.removeEventListener('abort', abortFromCaller);
  });
};

// GET request helper using native fetch to avoid CORS preflight
export const get = <T = any>(
  endpoint: string,
  params?: Record<string, any>,
  options?: RequestOptions,
): Promise<T> => {
  const urlStr = buildUrl(endpoint, params);

  return request<T>(urlStr, {
    method: 'GET',
  }, options);
};

// POST request helper using native fetch to avoid CORS preflight
export const post = <T = any>(endpoint: string, data?: any, options?: RequestOptions): Promise<T> => {
  const urlStr = buildUrl(endpoint);

  return request<T>(urlStr, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: data ? JSON.stringify(data) : undefined,
  }, options);
};

// DELETE request helper using native fetch to avoid CORS preflight
export const del = <T = any>(endpoint: string, data?: any, options?: RequestOptions): Promise<T> => {
  const urlStr = buildUrl(endpoint);

  return request<T>(urlStr, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: data ? JSON.stringify(data) : undefined,
  }, options);
};

// PUT request helper using native fetch to avoid CORS preflight
export const put = <T = any>(endpoint: string, data?: any, options?: RequestOptions): Promise<T> => {
  const urlStr = buildUrl(endpoint);

  return request<T>(urlStr, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: data ? JSON.stringify(data) : undefined,
  }, options);
};

// Language formatting helper
export const formatLanguage = (lang: Language): string => {
  return lang === 'zh' ? 'zh' : 'en';
};
