import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  Image,
  LoaderCircle,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { toWebviewMediaUrl } from '../lib/media';
import { Select } from './ds/Select';
import type {
  ArticleAttribution,
  ArticleImageAttributionPlan,
  ArticleImageAttributionResult,
  ArticleResource,
} from '../types';

const resourceKinds = [
  ['website', 'Website'],
  ['github', 'GitHub'],
  ['paper', 'Paper'],
  ['doi', 'DOI'],
  ['documentation', 'Documentation'],
  ['other', 'Other'],
] as const;

const attributionLines = (value: ArticleAttribution, slug: string) => {
  const site = value.image_site_url.trim().replace(/\/+$/, '');
  const project = value.project_name.trim() || 'Article';
  return [
    [project, value.publication_venue.trim(), value.image_author.trim()].filter(Boolean).join(' / '),
    [
      site.replace(/^https?:\/\//, ''),
      site ? `Article: ${site}/blog/${slug}/` : '',
      value.project_url.trim() ? `Project: ${value.project_url.trim()}` : '',
    ].filter(Boolean).join(' / '),
  ].filter(Boolean);
};

export function ArticleDiscoverySettings({
  targetUri,
  slug,
  coverUrl,
  value,
  dirty,
  disabled,
  onChange,
}: {
  targetUri: string;
  slug: string;
  coverUrl: string;
  value: ArticleAttribution;
  dirty: boolean;
  disabled: boolean;
  onChange: (value: ArticleAttribution) => void;
}) {
  const [plan, setPlan] = React.useState<ArticleImageAttributionPlan | null>(null);
  const [busy, setBusy] = React.useState<'preview' | 'apply' | ''>('');
  const [error, setError] = React.useState('');
  const [result, setResult] = React.useState<ArticleImageAttributionResult | null>(null);
  const wasDirty = React.useRef(dirty);
  const update = <Key extends keyof ArticleAttribution>(key: Key, next: ArticleAttribution[Key]) => {
    onChange({ ...value, [key]: next });
    setResult(null);
  };

  const refresh = React.useCallback(async () => {
    if (dirty || busy) return;
    setBusy('preview');
    setError('');
    try {
      setPlan(await invoke<ArticleImageAttributionPlan>('preview_article_image_attribution', {
        targetUri,
      }));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy('');
    }
  }, [busy, dirty, targetUri]);

  React.useEffect(() => {
    if (!dirty && !plan && !busy) void refresh();
  }, [busy, dirty, plan, refresh]);

  React.useEffect(() => {
    setPlan(null);
    setResult(null);
    setError('');
  }, [targetUri]);

  React.useEffect(() => {
    if (wasDirty.current && !dirty) setPlan(null);
    wasDirty.current = dirty;
  }, [dirty]);

  const apply = async () => {
    if (dirty || disabled || busy) return;
    setBusy('apply');
    setError('');
    try {
      const next = await invoke<ArticleImageAttributionResult>('apply_article_image_attribution', {
        targetUri,
      });
      setResult(next);
      setPlan(next.plan);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy('');
    }
  };

  const supportedAssets = plan?.assets.filter((asset) => asset.supported) || [];
  const previewUrl = supportedAssets[0]?.local_path
    ? toWebviewMediaUrl(supportedAssets[0].local_path)
    : toWebviewMediaUrl(coverUrl);
  const lines = dirty ? attributionLines(value, slug) : plan?.visible_lines || attributionLines(value, slug);
  const visible = value.image_watermark_mode === 'visible' || value.image_watermark_mode === 'both';
  const metadata = value.image_watermark_mode === 'metadata' || value.image_watermark_mode === 'both';
  const appliedCount = result?.assets.filter((asset) => asset.state === 'applied').length || 0;

  const updateResource = (index: number, patch: Partial<ArticleResource>) => {
    update('external_resources', value.external_resources.map((resource, resourceIndex) => (
      resourceIndex === index ? { ...resource, ...patch } : resource
    )));
  };

  return (
    <>
      <section className="resume-editor-section content-settings-section article-discovery-identity">
        <div className="content-settings-section-heading">
          <h3>Project identity</h3>
          <p>One source of truth for the article header, image attribution, social preview, and search metadata.</p>
        </div>
        <div className="content-settings-grid">
          <label className="content-settings-field">
            <span>Project</span>
            <input
              type="text"
              value={value.project_name}
              onChange={(event) => update('project_name', event.target.value)}
              disabled={disabled}
              placeholder="GEM-Bench"
            />
          </label>
          <label className="content-settings-field">
            <span>Publication venue</span>
            <input
              type="text"
              value={value.publication_venue}
              onChange={(event) => update('publication_venue', event.target.value)}
              disabled={disabled}
              placeholder="KDD 2026"
            />
          </label>
          <label className="content-settings-field content-settings-field--wide">
            <span>Project address</span>
            <input
              type="url"
              value={value.project_url}
              onChange={(event) => update('project_url', event.target.value)}
              disabled={disabled}
              placeholder="https://gem-bench.org"
            />
          </label>
        </div>
      </section>

      <section className="resume-editor-section content-settings-section">
        <div className="article-resource-heading">
          <div className="content-settings-section-heading">
            <h3>Opening attachments</h3>
            <p>Compact external resources shown before the article begins and included in structured data.</p>
          </div>
          <button
            type="button"
            className="article-resource-add"
            disabled={disabled}
            onClick={() => update('external_resources', [
              ...value.external_resources,
              { kind: 'website', label: '', url: '' },
            ])}
          >
            <Plus size={14} />
            Add resource
          </button>
        </div>
        <div className="article-resource-list">
          {value.external_resources.length === 0 && (
            <div className="article-resource-empty">No attachments yet.</div>
          )}
          {value.external_resources.map((resource, index) => (
            <div className="article-resource-row" key={`${index}:${resource.url}`}>
              <Select
                aria-label={`Resource ${index + 1} kind`}
                value={resource.kind}
                disabled={disabled}
                onChange={(event) => updateResource(index, { kind: event.target.value })}
              >
                {resourceKinds.map(([kind, label]) => <option value={kind} key={kind}>{label}</option>)}
              </Select>
              <input
                type="text"
                aria-label={`Resource ${index + 1} label`}
                value={resource.label}
                disabled={disabled}
                placeholder="Source code"
                onChange={(event) => updateResource(index, { label: event.target.value })}
              />
              <input
                type="url"
                aria-label={`Resource ${index + 1} URL`}
                value={resource.url}
                disabled={disabled}
                placeholder="https://…"
                onChange={(event) => updateResource(index, { url: event.target.value })}
              />
              <button
                type="button"
                aria-label={`Remove resource ${index + 1}`}
                disabled={disabled}
                onClick={() => update(
                  'external_resources',
                  value.external_resources.filter((_, resourceIndex) => resourceIndex !== index),
                )}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="resume-editor-section content-settings-section article-attribution-workspace">
        <div className="content-settings-section-heading">
          <h3>Image attribution</h3>
          <p>Edit and reapply at any time. The watermark is rebuilt from the saved clean image strip, while embedded metadata records the same provenance inside each supported image.</p>
        </div>
        <div className="article-attribution-layout">
          <div className="article-attribution-preview">
            {previewUrl ? (
              <img src={previewUrl} alt="Article image attribution preview" />
            ) : (
              <div className="article-attribution-preview-empty">
                <Image size={22} />
                <span>Add an article image to preview attribution.</span>
              </div>
            )}
            {previewUrl && visible && lines.length > 0 && (
              <div className={`article-attribution-overlay ${value.image_watermark_position}`}>
                {lines.map((line, index) => <span key={`${index}:${line}`}>{line}</span>)}
              </div>
            )}
          </div>
          <div className="article-attribution-controls">
            <label className="content-settings-field">
              <span>Author</span>
              <input
                type="text"
                value={value.image_author}
                disabled={disabled}
                onChange={(event) => update('image_author', event.target.value)}
                placeholder="Silan Hu"
              />
            </label>
            <label className="content-settings-field">
              <span>Canonical site</span>
              <input
                type="url"
                value={value.image_site_url}
                disabled={disabled}
                onChange={(event) => update('image_site_url', event.target.value)}
                placeholder="https://silan.tech"
              />
            </label>
            <div className="article-attribution-choice">
              <span>Watermark mode</span>
              <div>
                {(['off', 'metadata', 'visible', 'both'] as const).map((mode) => (
                  <button
                    type="button"
                    className={value.image_watermark_mode === mode ? 'active' : ''}
                    disabled={disabled}
                    onClick={() => update('image_watermark_mode', mode)}
                    key={mode}
                  >
                    {mode === 'metadata' && <EyeOff size={13} />}
                    {mode === 'visible' && <Eye size={13} />}
                    {mode === 'both' && <CheckCircle2 size={13} />}
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            {visible && (
              <div className="article-attribution-choice">
                <span>Visible credit position</span>
                <div>
                  {(['bottom-left', 'bottom-right'] as const).map((position) => (
                    <button
                      type="button"
                      className={value.image_watermark_position === position ? 'active' : ''}
                      disabled={disabled}
                      onClick={() => update('image_watermark_position', position)}
                      key={position}
                    >
                      {position === 'bottom-left' ? 'Left' : 'Right'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="article-attribution-status">
              <span><Eye size={14} /> Visible {visible ? 'on' : 'off'}</span>
              <span><EyeOff size={14} /> Metadata {metadata ? 'on' : 'off'}</span>
              <span><ExternalLink size={14} /> {supportedAssets.length} supported image{supportedAssets.length === 1 ? '' : 's'}</span>
            </div>
            <div className="article-attribution-actions">
              <button type="button" disabled={disabled || dirty || Boolean(busy)} onClick={() => void refresh()}>
                {busy === 'preview' ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />}
                Refresh preview
              </button>
              <button
                type="button"
                className="article-attribution-apply"
                disabled={disabled || dirty || Boolean(busy)}
                onClick={() => void apply()}
              >
                {busy === 'apply' ? <LoaderCircle size={14} className="spin" /> : <CheckCircle2 size={14} />}
                {value.image_watermark_mode === 'off' ? 'Remove from' : 'Apply to'} {supportedAssets.length || 'all'} images
              </button>
            </div>
            {dirty && <p className="article-attribution-note">Settings are saving automatically. Image attribution will be available once saved.</p>}
            {appliedCount > 0 && <p className="article-attribution-success">{appliedCount} image{appliedCount === 1 ? '' : 's'} updated.</p>}
            {error && <p className="article-attribution-error" role="alert">{error}</p>}
          </div>
        </div>
      </section>
    </>
  );
}
