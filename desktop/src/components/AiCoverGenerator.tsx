import React from 'react';
import { createPortal } from 'react-dom';
import {
  createCoverBrief,
  generateCoverAsset,
  generateCoverBrief,
  mergeGeneratedCoverBrief,
  initialCoverGenerationState,
  transitionCoverGeneration,
  type CoverGenerationRequest,
  type CoverTarget,
} from '../lib/coverGeneration';
import { toWebviewMediaUrl } from '../lib/media';
import type { ImportedMediaAsset } from '../types';
import { usePaidAiGate } from './PaidAiGate';

function CoverGenerationDialog({
  headline,
  orientation,
}: {
  headline: string;
  orientation: 'wide' | 'portrait';
}) {
  return createPortal(
    <div className="ai-cover-progress-overlay" role="dialog" aria-modal="true" aria-labelledby="ai-cover-progress-title">
      <section className="ai-cover-progress-card">
        <div className="ai-cover-progress-visual" data-orientation={orientation} aria-hidden="true">
          <span className="ai-cover-progress-sheet ai-cover-progress-sheet--back" />
          <span className="ai-cover-progress-sheet ai-cover-progress-sheet--middle" />
          <span className="ai-cover-progress-sheet ai-cover-progress-sheet--front">
            <i />
            <b />
            <em />
          </span>
          <span className="ai-cover-progress-scan" />
        </div>
        <div className="ai-cover-progress-copy" aria-live="polite">
          <h3 id="ai-cover-progress-title">正在生成封面</h3>
          {headline && <p>{headline}</p>}
          <div className="ai-cover-progress-status">
            <span aria-hidden="true"><i /><i /><i /></span>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export function AiCoverGenerator({
  target,
  contentKind,
  title,
  description,
  language,
  disabled = false,
  onConfigureOpenAi,
  onUse,
}: {
  target: CoverTarget;
  contentKind: 'blog' | 'project' | 'series';
  title: string;
  description?: string | null;
  language?: string | null;
  disabled?: boolean;
  onConfigureOpenAi?: () => void;
  onUse: (asset: ImportedMediaAsset) => void;
}) {
  const subjectLabel = contentKind === 'blog'
    ? 'article'
    : contentKind === 'project'
      ? 'project'
      : 'series';
  const [brief, setBrief] = React.useState(() => createCoverBrief({
    contentKind,
    title,
    description,
    language,
  }));
  const [size, setSize] = React.useState<CoverGenerationRequest['size']>('1536x1024');
  const [quality, setQuality] = React.useState<CoverGenerationRequest['quality']>('medium');
  const [candidateSize, setCandidateSize] = React.useState<CoverGenerationRequest['size']>('1536x1024');
  const [optionsVisible, setOptionsVisible] = React.useState(false);
  const [generation, dispatch] = React.useReducer(
    transitionCoverGeneration,
    initialCoverGenerationState,
  );
  const paidAi = usePaidAiGate();
  const availability = paidAi.availability('cover_generation');

  const [briefPhase, setBriefPhase] = React.useState<'idle' | 'preparing' | 'ready' | 'failed'>('idle');
  const [briefError, setBriefError] = React.useState('');
  const briefRequest = React.useRef(0);
  const briefInFlight = React.useRef(false);
  React.useEffect(() => () => { briefRequest.current += 1; }, [target.uri]);
  const prepareBrief = async () => {
    if (disabled || briefInFlight.current) return;
    const availability = paidAi.availability('cover_brief');
    if (!availability.enabled) { setBriefError(availability.reason || 'Configure a text engine to fill this brief.'); return; }
    briefInFlight.current = true;
    const request = ++briefRequest.current;
    const baseline = brief;
    setBriefPhase('preparing'); setBriefError('');
    try {
      if (!await paidAi.confirm({ kind: 'cover_brief', action: 'Fill the cover brief', scope: `saved source for “${title}”` })) {
        if (request === briefRequest.current) setBriefPhase('idle');
        return;
      }
      if (request !== briefRequest.current) return;
      const generated = await generateCoverBrief(target, brief.language);
      if (request !== briefRequest.current) return;
      setBrief(current => mergeGeneratedCoverBrief(current, baseline, generated));
      setBriefPhase('ready');
    } catch (error) {
      if (request === briefRequest.current) { setBriefError(String(error)); setBriefPhase('failed'); }
    } finally { briefInFlight.current = false; }
  };

  const candidateUrl = generation.asset
    ? toWebviewMediaUrl(generation.asset.local_path || generation.asset.uri)
    : '';
  const headlineLength = Array.from(brief.headline).length;
  const headlineLong = brief.language === 'zh' ? headlineLength > 28 : headlineLength > 70;
  const generating = generation.phase === 'generating';
  const canGenerate = Boolean(
    availability.enabled
    && briefPhase !== 'preparing'
    && brief.headline.trim()
    && brief.value.trim(),
  );

  const generate = async () => {
    if (!canGenerate || disabled || generating) return;
    if (!await paidAi.confirm({
      kind: 'cover_generation',
      action: 'Generate a cover image',
      scope: `the cover brief for “${brief.headline.trim()}” (${quality} quality, ${size})`,
    })) return;
    dispatch({ type: 'started' });
    try {
      const asset = await generateCoverAsset(target, brief, {
        size,
        quality,
        outputFormat: 'png',
      });
      setCandidateSize(size);
      dispatch({ type: 'succeeded', asset });
    } catch (reason) {
      dispatch({ type: 'failed', error: String(reason) });
    }
  };

  const applyCandidate = () => {
    if (!generation.asset || generation.phase === 'generating') return;
    onUse(generation.asset);
    dispatch({ type: 'applied' });
  };

  return (
    <div className="ai-cover-generator" data-expanded={optionsVisible || undefined}>
      {generating && (
        <CoverGenerationDialog
          headline={brief.headline.trim()}
          orientation={size === '1024x1536' ? 'portrait' : 'wide'}
        />
      )}
      {!optionsVisible ? (
        <div className="ai-cover-launch">
          <span>Generate a new cover from the {subjectLabel} title and summary.</span>
          <button
            type="button"
            disabled={disabled}
            aria-expanded="false"
            onClick={() => { setOptionsVisible(true); if (briefPhase !== 'ready') void prepareBrief(); }}
          >
            Generate with AI
          </button>
        </div>
      ) : (
        <>
      {briefError && <p className="ai-cover-error" role="status">{briefError} <button type="button" onClick={paidAi.openSettings}>AI 设置</button></p>}
      <header className="ai-cover-generator-header">
        <div>
          <span>AI cover</span>
        </div>
        <div className="ai-cover-header-actions">
          <button type="button" disabled={disabled || generating || briefPhase === 'preparing'} onClick={() => void prepareBrief()}>
            {briefPhase === 'preparing' ? 'AI 填写中…' : 'AI 重新填写'}
          </button>
          {availability.settingsFixable ? (
            <button
              type="button"
              className="ai-cover-credential"
              data-state="missing"
              disabled={disabled}
              title={availability.reason || undefined}
              onClick={onConfigureOpenAi || paidAi.openSettings}
            >
              Configure image engine
            </button>
          ) : (
            <span
              className="ai-cover-credential"
              data-state={availability.enabled ? 'ready' : 'loading'}
              title={availability.reason || undefined}
            >
              {availability.enabled ? `${paidAi.providerLabel('cover_generation')} ready` : availability.reason}
            </span>
          )}
          <button
            type="button"
            className="ai-cover-collapse"
            disabled={generating}
            title="Hide generation settings"
            aria-label="Hide generation settings"
            aria-expanded="true"
            onClick={() => setOptionsVisible(false)}
          >
            Hide
          </button>
        </div>
      </header>

      <div className="ai-cover-fields">
        <label className="ai-cover-field">
          <span>Cover headline</span>
          <input
            type="text"
            value={brief.headline}
            disabled={disabled || generating}
            onChange={(event) => setBrief((current) => ({ ...current, headline: event.target.value }))}
          />
          <small className="ai-cover-field-count" data-warning={headlineLong || undefined}>{headlineLength} characters</small>
        </label>
        <label className="ai-cover-field">
          <span>Reader</span>
          <input
            type="text"
            value={brief.audience}
            disabled={disabled || generating}
            onChange={(event) => setBrief((current) => ({ ...current, audience: event.target.value }))}
          />
        </label>
        <label className="ai-cover-field ai-cover-field--wide">
          <span>Problem and value</span>
          <textarea
            rows={3}
            value={brief.value}
            disabled={disabled || generating}
            onChange={(event) => setBrief((current) => ({ ...current, value: event.target.value }))}
          />
        </label>
        <label className="ai-cover-field ai-cover-field--wide">
          <span>Concrete visual</span>
          <textarea
            rows={2}
            value={brief.visualDirection}
            disabled={disabled || generating}
            placeholder="Optional scene, object, or material to show"
            onChange={(event) => setBrief((current) => ({ ...current, visualDirection: event.target.value }))}
          />
        </label>
      </div>

      <div className="ai-cover-options">
        <div className="ai-cover-option">
          <div className="ai-cover-option-copy">
            <span>Format</span>
          </div>
          <div className="ai-cover-segmented" role="radiogroup" aria-label="Cover format">
            <button
              type="button"
              role="radio"
              aria-checked={size === '1536x1024'}
              className={size === '1536x1024' ? 'active' : ''}
              disabled={disabled || generating}
              onClick={() => setSize('1536x1024')}
            >
              Wide
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={size === '1024x1536'}
              className={size === '1024x1536' ? 'active' : ''}
              disabled={disabled || generating}
              onClick={() => setSize('1024x1536')}
            >
              Portrait
            </button>
          </div>
        </div>
        <div className="ai-cover-option">
          <div className="ai-cover-option-copy">
            <span>Quality</span>
          </div>
          <div className="ai-cover-segmented ai-cover-segmented--quality" role="radiogroup" aria-label="Image quality">
            {(['low', 'medium', 'high'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={quality === value}
                className={quality === value ? 'active' : ''}
                disabled={disabled || generating}
                onClick={() => setQuality(value)}
              >
                {value[0].toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="ai-cover-generate"
          disabled={!canGenerate || disabled || generating}
          title={availability.reason || 'Generate with OpenAI (paid; asks for confirmation)'}
          onClick={() => void generate()}
        >
          {generating ? 'Generating' : generation.asset ? 'Regenerate' : 'Generate cover'}
        </button>
      </div>

      {candidateUrl && (
        <div className="ai-cover-candidate" data-applied={generation.phase === 'applied' || undefined}>
          <div
            className="ai-cover-candidate-preview"
            data-orientation={candidateSize === '1024x1536' ? 'portrait' : 'wide'}
          >
            <img src={candidateUrl} alt="Generated cover candidate" />
          </div>
          <div>
            <span>Generated candidate</span>
            <button
              type="button"
              disabled={disabled || generating || generation.phase === 'applied'}
              onClick={applyCandidate}
            >
              {generation.phase === 'applied' ? 'Selected' : 'Use as cover'}
            </button>
          </div>
        </div>
      )}

      {generation.error && (
        <p className="ai-cover-error" role="alert">
          <span>{generation.error}</span>
        </p>
      )}
        </>
      )}
    </div>
  );
}
