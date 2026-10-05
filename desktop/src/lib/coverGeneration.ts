import { invoke } from '@tauri-apps/api/core';
import type { ImportedMediaAsset } from '../types';

export type CoverTarget = { uri: string };

export type CoverBrief = {
  contentKind: 'blog' | 'project' | 'series';
  language: 'en' | 'zh';
  headline: string;
  audience: string;
  value: string;
  visualDirection: string;
};

export type CoverGenerationRequest = {
  size: '1536x1024' | '1024x1536';
  quality: 'low' | 'medium' | 'high';
  outputFormat: 'png';
};

export type CoverGenerationState =
  | { phase: 'idle'; asset: null; error: null }
  | { phase: 'generating'; asset: ImportedMediaAsset | null; error: null }
  | { phase: 'candidate'; asset: ImportedMediaAsset; error: null }
  | { phase: 'applied'; asset: ImportedMediaAsset; error: null }
  | { phase: 'failed'; asset: ImportedMediaAsset | null; error: string };

export type CoverGenerationEvent =
  | { type: 'started' }
  | { type: 'succeeded'; asset: ImportedMediaAsset }
  | { type: 'applied' }
  | { type: 'failed'; error: string };

export const initialCoverGenerationState: CoverGenerationState = {
  phase: 'idle',
  asset: null,
  error: null,
};

export const transitionCoverGeneration = (
  state: CoverGenerationState,
  event: CoverGenerationEvent,
): CoverGenerationState => {
  switch (event.type) {
    case 'started':
      return { phase: 'generating', asset: state.asset, error: null };
    case 'succeeded':
      return { phase: 'candidate', asset: event.asset, error: null };
    case 'applied':
      return state.asset
        ? { phase: 'applied', asset: state.asset, error: null }
        : initialCoverGenerationState;
    case 'failed':
      return { phase: 'failed', asset: state.asset, error: event.error };
  }
};

const compact = (value: string) => value.trim().replace(/\s+/g, ' ');
const hasCjk = (value: string) => /[\u3400-\u9fff]/u.test(value);

export const createCoverBrief = ({
  contentKind,
  title,
  description,
  language,
}: {
  contentKind: CoverBrief['contentKind'];
  title: string;
  description?: string | null;
  language?: string | null;
}): CoverBrief => {
  const normalizedLanguage = language?.trim().toLowerCase().startsWith('zh') || hasCjk(`${title} ${description || ''}`)
    ? 'zh'
    : 'en';
  return {
    contentKind,
    language: normalizedLanguage,
    headline: compact(title),
    audience: '',
    value: compact(description || title),
    visualDirection: '',
  };
};

export const generateCoverAsset = async (
  target: CoverTarget,
  brief: CoverBrief,
  request: CoverGenerationRequest,
) => {
  return invoke<ImportedMediaAsset>('generate_cover_asset', {
    targetUri: target.uri,
    language: brief.language,
    headline: brief.headline,
    audience: brief.audience,
    value: brief.value,
    visualDirection: brief.visualDirection,
    size: request.size,
    quality: request.quality,
    outputFormat: request.outputFormat,
  });
};

export const generateCoverBrief = (target: CoverTarget, language: string) =>
  invoke<Omit<CoverBrief, 'contentKind'>>('generate_cover_brief', { targetUri: target.uri, language });

/** Preserve edits made while the model was preparing its answer. */
export function mergeGeneratedCoverBrief(current: CoverBrief, baseline: CoverBrief, generated: Omit<CoverBrief, 'contentKind'>): CoverBrief {
  const result = { ...current };
  for (const field of ['headline', 'audience', 'value', 'visualDirection'] as const) {
    if (current[field] === baseline[field]) result[field] = generated[field];
  }
  return result;
}
