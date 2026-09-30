import { convertFileSrc, isTauri } from '@tauri-apps/api/core';

const URL_SCHEME = /^[a-z][a-z\d+.-]*:/i;

export const toWebviewMediaUrl = (value?: string | null) => {
  const source = value?.trim();
  if (!source) return '';
  if (URL_SCHEME.test(source)) return source;
  return isTauri() ? convertFileSrc(source) : source;
};

export const cssBackgroundImage = (value?: string | null) => {
  const url = toWebviewMediaUrl(value);
  if (!url) return '';
  return `url("${url.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
};

/** Source-backed formats shared by capture previews and Markdown rendering. */
export const isVideoResource = (source: string): boolean =>
  /\.(?:mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(source);

export const isVideoFile = (file: Pick<File, 'name' | 'type'>): boolean =>
  file.type.startsWith('video/') || isVideoResource(file.name);

export const MEDIA_FILE_ACCEPT = 'image/*,video/mp4,video/webm,video/quicktime,video/x-m4v,.mp4,.webm,.mov,.m4v';

/** HTTP headers are ASCII; JSON escaping retains non-ASCII file names. */
export const mediaFileNameHeader = (name: string): string =>
  JSON.stringify(name).replace(/[^\x20-\x7e]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
