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
