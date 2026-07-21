import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  FileImage,
  LoaderCircle,
  Mail,
  MapPin,
  PencilLine,
  Phone,
  Plus,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { MarkdownPreview } from './MarkdownPreview';
import { LanguageCloseControls } from './LanguageCloseControls';
import { ResumeBioEditor } from './ResumeBioEditor';
import { toWebviewMediaUrl } from '../lib/media';
import type {
  EditorDocument,
  ImportedMediaAsset,
  ResumeEntry,
  ResumeFieldValue,
  ResumePartSource,
  ResumeProfile,
  ResumeProfileSource,
  ResumeSection,
  ResumeSocialLink,
} from '../types';

const roleLabels: Record<string, string> = {
  education: 'Education',
  experience: 'Experience',
  awards: 'Awards',
  publications: 'Publications',
  research: 'Research',
  expectations: 'Looking for',
  skills: 'Skills',
};

const roleOrder = ['experience', 'education', 'research', 'publications', 'awards', 'expectations', 'skills'];

/** Fields the block editor manages itself — never shown as form inputs. */
const managedFields = new Set(['entry_id', 'sort_order']);

/** Long-prose fields that deserve a textarea instead of a one-line input. */
const longTextFields = new Set(['description', 'abstract']);

/** Asset fields are managed as files, not typed URLs. */
const mediaFields = new Set(['institution_logo_url', 'company_logo_url', 'image_url']);

/** Preferred form field order — identity first, dates next, prose last. */
const preferredFieldOrder = [
  'institution', 'company', 'title', 'category',
  'degree', 'position', 'field_of_study', 'awarding_organization',
  'conference_name', 'journal_name', 'authors',
  'start_date', 'end_date', 'award_date', 'publication_date',
  'is_current', 'is_ongoing', 'location',
  'description', 'abstract', 'details', 'items',
  'institution_logo_url', 'company_logo_url', 'image_url',
];

/** Starter fields for a section's first block, per role. */
const roleTemplates: Record<string, Record<string, ResumeFieldValue>> = {
  education: { institution: '', degree: '', start_date: '', end_date: '', location: '', details: [] },
  experience: { company: '', position: '', start_date: '', end_date: '', location: '', details: [] },
  awards: { title: '', awarding_organization: '', award_date: '', description: '' },
  publications: { title: '', authors: [], publication_date: '', url: '' },
  research: { title: '', start_date: '', end_date: '', location: '', details: [] },
  expectations: { title: '', description: '' },
  skills: { category: '', items: [] },
};

type EntryDraft = {
  entry_id: string;
  fields: Record<string, ResumeFieldValue>;
  isNew?: boolean;
};

const fieldOf = (entry: ResumeEntry, key: string) => entry.localized[key] ?? entry.shared[key] ?? null;
const asText = (value: unknown) => (typeof value === 'string' ? value : '');
const asList = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

const mergedFields = (entry: ResumeEntry): Record<string, ResumeFieldValue> => ({
  ...entry.shared,
  ...entry.localized,
});

const orderedFieldKeys = (fields: Record<string, ResumeFieldValue>) => {
  const keys = Object.keys(fields).filter((key) => !managedFields.has(key));
  return keys.sort((left, right) => {
    const li = preferredFieldOrder.indexOf(left);
    const ri = preferredFieldOrder.indexOf(right);
    if (li !== -1 && ri !== -1) return li - ri;
    if (li !== -1) return -1;
    if (ri !== -1) return 1;
    return left.localeCompare(right);
  });
};

const templateFrom = (section: ResumeSection): Record<string, ResumeFieldValue> => {
  const first = section.entries[0];
  if (!first) return { ...(roleTemplates[section.role] || { title: '', description: '' }) };
  const blank: Record<string, ResumeFieldValue> = {};
  for (const [key, value] of Object.entries(mergedFields(first))) {
    if (managedFields.has(key)) continue;
    blank[key] = Array.isArray(value) ? [] : typeof value === 'boolean' ? false : typeof value === 'number' ? 0 : '';
  }
  return blank;
};

const sectionToDrafts = (section: ResumeSection): EntryDraft[] => section.entries.map((entry) => ({
  entry_id: entry.entry_id,
  fields: mergedFields(entry),
}));

const fieldLabel = (key: string) => key.replace(/_/g, ' ');

const blankSocialLink = (): ResumeSocialLink => ({ platform: '', url: '', display_name: '' });

const profileContactItems = (profile: ResumeProfile) => [
  { key: 'email', icon: Mail, value: profile.email, href: profile.email ? `mailto:${profile.email}` : '' },
  { key: 'phone', icon: Phone, value: profile.phone, href: profile.phone ? `tel:${profile.phone}` : '' },
  { key: 'location', icon: MapPin, value: profile.location, href: '' },
].filter((item) => item.value.trim() !== '');

const entryFieldGroups = [
  {
    id: 'basics',
    title: 'Basics',
    keys: ['institution', 'company', 'title', 'category', 'degree', 'position', 'field_of_study', 'awarding_organization', 'conference_name', 'journal_name', 'location'],
  },
  {
    id: 'timeline',
    title: 'Timeline',
    keys: ['start_date', 'end_date', 'award_date', 'publication_date', 'is_current', 'is_ongoing'],
  },
  {
    id: 'content',
    title: 'Content',
    keys: ['description', 'abstract', 'details', 'items', 'authors'],
  },
  {
    id: 'links',
    title: 'Links',
    keys: ['url', 'institution_website', 'company_website', 'institution_logo_url', 'company_logo_url', 'image_url'],
  },
];

const entryOutlineFor = (draft: EntryDraft) => {
  const keys = orderedFieldKeys(draft.fields);
  const groupedKeys = new Set(entryFieldGroups.flatMap((group) => group.keys));
  return [
    ...entryFieldGroups.map((group) => ({
      id: `entry-${group.id}`,
      label: group.title,
      visible: group.keys.some((key) => keys.includes(key)),
    })),
    {
      id: 'entry-other',
      label: 'Other',
      visible: keys.some((key) => !groupedKeys.has(key)),
    },
  ].filter((item) => item.visible);
};

const formatDate = (value: unknown) => {
  const text = asText(value);
  if (!text) return '';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
};

const dateRange = (entry: ResumeEntry) => {
  const start = formatDate(fieldOf(entry, 'start_date'));
  const isCurrent = fieldOf(entry, 'is_current') === true || fieldOf(entry, 'is_ongoing') === true;
  const end = isCurrent ? 'Present' : formatDate(fieldOf(entry, 'end_date'));
  if (start && end) return `${start} — ${end}`;
  if (start) return start;
  return formatDate(fieldOf(entry, 'award_date')) || formatDate(fieldOf(entry, 'publication_date'));
};

/* --- Block: read view ----------------------------------------------------- */

function EntryView({ role, entry }: { role: string; entry: ResumeEntry }) {
  const title = asText(fieldOf(entry, 'degree'))
    || asText(fieldOf(entry, 'position'))
    || asText(fieldOf(entry, 'title'))
    || entry.entry_id;
  const subtitle = asText(fieldOf(entry, 'institution'))
    || asText(fieldOf(entry, 'company'))
    || asText(fieldOf(entry, 'awarding_organization'))
    || asText(fieldOf(entry, 'conference_name'))
    || asText(fieldOf(entry, 'journal_name'));
  const location = asText(fieldOf(entry, 'location'));
  const details = asList(fieldOf(entry, 'details'));
  const description = asText(fieldOf(entry, 'description'));
  const url = asText(fieldOf(entry, 'url')) || asText(fieldOf(entry, 'institution_website')) || asText(fieldOf(entry, 'company_website'));
  const range = dateRange(entry);
  const logoUrl = toWebviewMediaUrl(
    entry.media?.company_logo_url
    || entry.media?.institution_logo_url
    || entry.media?.image_url
    || '',
  );

  // Description and detail bullets carry inline Markdown (bold, links) —
  // render them through Vditor's own preview pipeline as one block.
  const bodyMarkdown = [
    description,
    details.map((detail) => `- ${detail}`).join('\n'),
  ].filter(Boolean).join('\n\n');

  return (
    <>
      <div className="resume-entry-head">
        <div className="resume-entry-title-row">
          {logoUrl && (
            <img
              className="resume-entry-logo"
              src={logoUrl}
              alt=""
              loading="lazy"
              aria-hidden="true"
            />
          )}
          <div>
          <h3>{title}</h3>
          {subtitle && <p className="resume-entry-subtitle">{subtitle}{location ? ` · ${location}` : ''}</p>}
          </div>
        </div>
        {range && <span className="resume-entry-range">{range}</span>}
      </div>
      {bodyMarkdown && <MarkdownPreview content={bodyMarkdown} className="resume-entry-md" />}
      {url && (
        <a className="resume-entry-link" href={url} target="_blank" rel="noreferrer">
          {url.replace(/^https?:\/\//, '')}
        </a>
      )}
      {role === 'publications' && asList(fieldOf(entry, 'authors')).length > 0 && (
        <p className="resume-entry-authors">{asList(fieldOf(entry, 'authors')).join(', ')}</p>
      )}
    </>
  );
}

/* --- Block: edit form ------------------------------------------------------ */

export function ResumeMediaField({
  fieldKey,
  value,
  previewUrl,
  saving,
  busy,
  error,
  onUpload,
  onRemove,
}: {
  fieldKey: string;
  value: string;
  previewUrl: string;
  saving: boolean;
  busy: boolean;
  error?: string;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const hasAsset = Boolean(value || previewUrl);

  return (
    <div className="resume-media-field">
      <div className="resume-media-label">
        <span>{fieldLabel(fieldKey).replace(/ url$/i, '')}</span>
        {value && <code>{value}</code>}
      </div>
      <div className="resume-media-control">
        <div className="resume-media-preview" data-empty={!previewUrl}>
          {previewUrl ? (
            <img src={previewUrl} alt="" aria-hidden="true" />
          ) : (
            <FileImage size={20} aria-hidden="true" />
          )}
        </div>
        <div className="resume-media-actions">
          <button
            type="button"
            className="resume-media-button"
            disabled={saving || busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <LoaderCircle size={13} className="spin" /> : <UploadCloud size={13} />}
            {hasAsset ? 'Change' : 'Upload'}
          </button>
          {hasAsset && (
            <button
              type="button"
              className="resume-media-button resume-media-button--danger"
              disabled={saving || busy}
              onClick={onRemove}
            >
              <Trash2 size={13} />
              Remove
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp,image/avif,image/x-icon"
          disabled={saving || busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = '';
            if (file) onUpload(file);
          }}
        />
      </div>
      {error && <p className="resume-media-error" role="alert">{error}</p>}
    </div>
  );
}

function EntryForm({
  draft,
  media,
  saving,
  onChange,
}: {
  draft: EntryDraft;
  media?: Record<string, string>;
  saving: boolean;
  onChange: (fields: Record<string, ResumeFieldValue>) => void;
}) {
  const setField = (key: string, value: ResumeFieldValue) => onChange({ ...draft.fields, [key]: value });
  const [mediaBusy, setMediaBusy] = React.useState<string | null>(null);
  const [mediaErrors, setMediaErrors] = React.useState<Record<string, string>>({});
  const [localPreviews, setLocalPreviews] = React.useState<Record<string, string>>({});
  const orderedKeys = orderedFieldKeys(draft.fields);
  const groupedKeys = new Set(entryFieldGroups.flatMap((group) => group.keys));
  const groups = [
    ...entryFieldGroups.map((group) => ({
      ...group,
      keys: group.keys.filter((key) => orderedKeys.includes(key)),
    })),
    {
      id: 'other',
      title: 'Other',
      keys: orderedKeys.filter((key) => !groupedKeys.has(key)),
    },
  ].filter((group) => group.keys.length > 0);

  const renderField = (key: string) => {
    const value = draft.fields[key];
    if (mediaFields.has(key)) {
      const text = asText(value);
      const previewUrl = localPreviews[key] || toWebviewMediaUrl(media?.[key]) || '';
      return (
        <div className="resume-form-field resume-form-field--wide" key={key}>
          <ResumeMediaField
            fieldKey={key}
            value={text}
            previewUrl={previewUrl}
            saving={saving}
            busy={mediaBusy === key}
            error={mediaErrors[key]}
            onRemove={() => {
              setField(key, '');
              setMediaErrors((current) => {
                const next = { ...current };
                delete next[key];
                return next;
              });
              setLocalPreviews((current) => {
                const next = { ...current };
                delete next[key];
                return next;
              });
            }}
            onUpload={async (file) => {
              setMediaBusy(key);
              setMediaErrors((current) => {
                const next = { ...current };
                delete next[key];
                return next;
              });
              try {
                const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
                const imported = await invoke<ImportedMediaAsset>('import_resume_media_asset', {
                  fileName: file.name,
                  bytes,
                });
                setField(key, imported.uri);
                setLocalPreviews((current) => ({
                  ...current,
                  [key]: imported.local_path ? toWebviewMediaUrl(imported.local_path) : URL.createObjectURL(file),
                }));
              } catch (reason) {
                setMediaErrors((current) => ({ ...current, [key]: String(reason) }));
              } finally {
                setMediaBusy(null);
              }
            }}
          />
        </div>
      );
    }
    if (typeof value === 'boolean') {
      return (
        <label className="resume-form-check" key={key}>
          <input
            type="checkbox"
            checked={value}
            disabled={saving}
            onChange={(event) => setField(key, event.target.checked)}
          />
          <span>{fieldLabel(key)}</span>
        </label>
      );
    }
    if (Array.isArray(value)) {
      return (
        <label className="resume-form-field resume-form-field--wide" key={key}>
          <span>{fieldLabel(key)} <em>one per line</em></span>
          <textarea
            value={value.join('\n')}
            rows={Math.max(4, value.length + 1)}
            disabled={saving}
            onChange={(event) => setField(key, event.target.value.split('\n'))}
          />
        </label>
      );
    }
    if (typeof value === 'number') {
      return (
        <label className="resume-form-field" key={key}>
          <span>{fieldLabel(key)}</span>
          <input
            type="number"
            value={value}
            disabled={saving}
            onChange={(event) => setField(key, Number(event.target.value) || 0)}
          />
        </label>
      );
    }
    const text = asText(value);
    if (longTextFields.has(key)) {
      return (
        <label className="resume-form-field resume-form-field--wide" key={key}>
          <span>{fieldLabel(key)}</span>
          <textarea
            value={text}
            rows={5}
            disabled={saving}
            onChange={(event) => setField(key, event.target.value)}
          />
        </label>
      );
    }
    return (
      <label className="resume-form-field" key={key}>
        <span>{fieldLabel(key)}</span>
        <input
          type="text"
          value={text}
          disabled={saving}
          onChange={(event) => setField(key, event.target.value)}
        />
      </label>
    );
  };

  return (
    <div className="resume-form resume-form--workspace">
      {groups.map((group) => (
        <section className="resume-editor-section" id={`entry-${group.id}`} key={group.id}>
          <h3>{group.title}</h3>
          <div className="resume-editor-field-grid">
            {group.keys.map(renderField)}
          </div>
        </section>
      ))}
    </div>
  );
}

function ResumeProfileView({
  source,
  onEdit,
  editingDisabled,
  showEditControls,
}: {
  source: ResumeProfileSource;
  onEdit: () => void;
  editingDisabled: boolean;
  showEditControls: boolean;
}) {
  const { profile } = source;
  const contacts = profileContactItems(profile);
  return (
    <header className="resume-profile">
      {showEditControls && (
        <button
          type="button"
          className="resume-block-action resume-profile-edit"
          disabled={editingDisabled}
          onClick={onEdit}
          title="Edit profile"
          aria-label="Edit profile"
        >
          <PencilLine size={13} />
        </button>
      )}
      <div className="resume-profile-identity">
        <h1>{profile.full_name || 'Unnamed profile'}</h1>
        {profile.title && <p className="resume-profile-title">{profile.title}</p>}
        {profile.current_status && <p className="resume-profile-status">{profile.current_status}</p>}
      </div>

      {(contacts.length > 0 || profile.website || profile.social_links.length > 0) && (
        <div className="resume-profile-contact" aria-label="Contact">
          {contacts.map(({ key, icon: Icon, value, href }) => (
            href ? (
              <a href={href} key={key}>
                <Icon size={12} />
                <span>{value}</span>
              </a>
            ) : (
              <span key={key}>
                <Icon size={12} />
                <span>{value}</span>
              </span>
            )
          ))}
          {profile.website && (
            <a href={profile.website} target="_blank" rel="noreferrer">
              {profile.website.replace(/^https?:\/\//, '')}
            </a>
          )}
          {profile.social_links.map((link) => (
            <a href={link.url} target="_blank" rel="noreferrer" key={`${link.platform}:${link.url}`}>
              {link.display_name || link.platform || link.url}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}

function ResumeEditorWorkspace({
  eyebrow,
  title,
  subtitle,
  saving,
  saveLabel,
  language,
  onLanguageChange,
  outline,
  children,
  onSave,
  onCancel,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  saving: boolean;
  saveLabel: string;
  language: string;
  onLanguageChange: (language: string) => void;
  outline: { id: string; label: string }[];
  children: React.ReactNode;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="resume-editor-workspace" role="dialog" aria-modal="true" aria-label={title}>
      <div className="resume-editor-topbar">
        <div className="resume-editor-title">
          <span>{eyebrow}</span>
          <strong>{title}</strong>
          <em>{subtitle}</em>
        </div>
        <LanguageCloseControls
          className="resume-editor-language-close"
          languages={[
            { language: 'en' },
            { language: 'zh' },
          ]}
          activeLanguage={language}
          disabled={saving}
          closeLabel="Close editor"
          closeSize={15}
          onLanguageSelect={onLanguageChange}
          onClose={onCancel}
        />
      </div>
      <div className="resume-editor-actions" aria-label="Editor actions">
        <button type="button" className="resume-editor-save" disabled={saving} onClick={onSave}>
          {saving ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}
          {saving ? 'Saving' : saveLabel}
        </button>
      </div>
      <div className="resume-editor-body">
        <aside className="resume-editor-outline" aria-label="Editor sections">
          {outline.map((item) => (
            <a href={`#${item.id}`} key={item.id}>{item.label}</a>
          ))}
        </aside>
        <main className="resume-editor-canvas">
          {children}
        </main>
      </div>
    </div>
  );
}

function ResumeProfileForm({
  profile,
  saving,
  onProfileChange,
}: {
  profile: ResumeProfile;
  saving: boolean;
  onProfileChange: (profile: ResumeProfile) => void;
}) {
  const setField = (key: keyof ResumeProfile, value: string) => {
    onProfileChange({ ...profile, [key]: value });
  };
  const setSocialLink = (index: number, patch: Partial<ResumeSocialLink>) => {
    onProfileChange({
      ...profile,
      social_links: profile.social_links.map((link, i) => (i === index ? { ...link, ...patch } : link)),
    });
  };
  const removeSocialLink = (index: number) => {
    onProfileChange({
      ...profile,
      social_links: profile.social_links.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="resume-form resume-form--workspace resume-profile-form">
      <section className="resume-editor-section" id="profile-identity">
        <h3>Identity</h3>
        <div className="resume-editor-field-grid">
          {(['full_name', 'title', 'current_status', 'avatar_url'] as const).map((key) => (
            <label className="resume-form-field" key={key}>
              <span>{fieldLabel(key)}</span>
              {key === 'current_status' ? (
                <textarea
                  value={profile[key]}
                  rows={2}
                  disabled={saving}
                  onChange={(event) => setField(key, event.target.value)}
                />
              ) : (
                <input
                  type={key === 'avatar_url' ? 'url' : 'text'}
                  value={profile[key]}
                  disabled={saving}
                  onChange={(event) => setField(key, event.target.value)}
                />
              )}
            </label>
          ))}
        </div>
      </section>

      <section className="resume-editor-section" id="profile-contact">
        <h3>Contact</h3>
        <div className="resume-editor-field-grid">
          {(['email', 'phone', 'location', 'website'] as const).map((key) => (
            <label className="resume-form-field" key={key}>
              <span>{fieldLabel(key)}</span>
              <input
                type={key === 'email' ? 'email' : key === 'website' ? 'url' : 'text'}
                value={profile[key]}
                disabled={saving}
                onChange={(event) => setField(key, event.target.value)}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="resume-editor-section" id="profile-links">
        <h3>Links</h3>
        <div className="resume-social-editor">
          <div className="resume-social-editor-head">
            <span>Social links</span>
            <button
              type="button"
              className="resume-block-action"
              disabled={saving}
              onClick={() => onProfileChange({ ...profile, social_links: [...profile.social_links, blankSocialLink()] })}
            >
              <Plus size={13} />
              Link
            </button>
          </div>
          {profile.social_links.map((link, index) => (
            <div className="resume-social-row" key={index}>
              <input
                type="text"
                value={link.platform}
                disabled={saving}
                placeholder="Platform"
                onChange={(event) => setSocialLink(index, { platform: event.target.value })}
              />
              <input
                type="text"
                value={link.display_name}
                disabled={saving}
                placeholder="Display"
                onChange={(event) => setSocialLink(index, { display_name: event.target.value })}
              />
              <input
                type="url"
                value={link.url}
                disabled={saving}
                placeholder="URL"
                onChange={(event) => setSocialLink(index, { url: event.target.value })}
              />
              <button
                type="button"
                className="resume-block-action resume-block-action--danger"
                disabled={saving}
                onClick={() => removeSocialLink(index)}
                title="Remove link"
                aria-label="Remove link"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* --- Page ------------------------------------------------------------------ */

export function ResumePage({
  overview,
  language,
  onLanguageChange,
  editControlsVisible,
}: {
  overview: EditorDocument | null;
  language: string;
  onLanguageChange: (language: string) => void;
  editControlsVisible: boolean;
}) {
  const [sections, setSections] = React.useState<ResumeSection[] | null>(null);
  const [profileSource, setProfileSource] = React.useState<ResumeProfileSource | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [profileError, setProfileError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [profileLoading, setProfileLoading] = React.useState(true);

  // At most one block edits at a time: which section + entry, and its draft.
  const [editing, setEditing] = React.useState<{ role: string; draft: EntryDraft } | null>(null);
  const [profileDraft, setProfileDraft] = React.useState<ResumeProfile | null>(null);
  const [summaryDraft, setSummaryDraft] = React.useState<string | null>(null);
  const [summaryToolbarVisible, setSummaryToolbarVisible] = React.useState(false);
  const [savingRole, setSavingRole] = React.useState<string | null>(null);
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [sectionErrors, setSectionErrors] = React.useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);

  const loadSections = React.useCallback((lang: string) => {
    setLoading(true);
    setError(null);
    invoke<ResumeSection[]>('get_resume_sections', { language: lang })
      .then(setSections)
      .catch((reason) => setError(String(reason)))
      .finally(() => setLoading(false));
  }, []);

  const loadProfile = React.useCallback((lang: string) => {
    setProfileLoading(true);
    setProfileError(null);
    invoke<ResumeProfileSource>('get_resume_profile', { language: lang })
      .then(setProfileSource)
      .catch((reason) => setProfileError(String(reason)))
      .finally(() => setProfileLoading(false));
  }, []);

  React.useEffect(() => {
    setEditing(null);
    setProfileDraft(null);
    setSummaryDraft(null);
    setConfirmDelete(null);
    loadSections(language);
    loadProfile(language);
  }, [language, loadProfile, loadSections]);

  React.useEffect(() => {
    if (!editing && !profileDraft && summaryDraft === null) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [editing, profileDraft, summaryDraft]);

  React.useEffect(() => {
    if (editControlsVisible) return;
    setEditing(null);
    setProfileDraft(null);
    setSummaryDraft(null);
    setSummaryToolbarVisible(false);
    setConfirmDelete(null);
  }, [editControlsVisible]);

  const orderedSections = React.useMemo(() => {
    if (!sections) return [];
    return [...sections].sort((left, right) => (
      roleOrder.indexOf(left.role) - roleOrder.indexOf(right.role)
    ));
  }, [sections]);

  /** Persist a section's blocks: revision handshake, save, refresh. */
  const commitSection = async (section: ResumeSection, drafts: EntryDraft[]) => {
    setSavingRole(section.role);
    setSectionErrors((current) => ({ ...current, [section.role]: '' }));
    try {
      const source = await invoke<ResumePartSource>('get_resume_part_source', {
        role: section.role,
        language,
      });
      const entries = drafts.map((draft, index) => {
        const fields: Record<string, ResumeFieldValue> = { ...draft.fields };
        if ('sort_order' in fields) fields.sort_order = index;
        if (Array.isArray(fields.details)) fields.details = fields.details.filter((line) => line.trim() !== '');
        if (Array.isArray(fields.items)) fields.items = fields.items.filter((line) => line.trim() !== '');
        if (Array.isArray(fields.authors)) fields.authors = fields.authors.filter((line) => line.trim() !== '');
        return { entry_id: draft.entry_id, fields };
      });
      const fresh = await invoke<ResumeSection[]>('save_resume_entries', {
        role: section.role,
        language,
        shape: section.shape,
        entries,
        expectedRevision: source.revision,
      });
      setSections(fresh);
      setEditing(null);
      setConfirmDelete(null);
    } catch (reason) {
      setSectionErrors((current) => ({ ...current, [section.role]: String(reason) }));
    } finally {
      setSavingRole(null);
    }
  };

  const startEdit = (section: ResumeSection, entry: ResumeEntry) => {
    setConfirmDelete(null);
    setProfileDraft(null);
    setEditing({
      role: section.role,
      draft: { entry_id: entry.entry_id, fields: mergedFields(entry) },
    });
  };

  const startAdd = (section: ResumeSection) => {
    setConfirmDelete(null);
    setProfileDraft(null);
    setEditing({
      role: section.role,
      draft: {
        entry_id: `${section.role}-${Date.now().toString(36)}`,
        fields: templateFrom(section),
        isNew: true,
      },
    });
  };

  const saveEdit = (section: ResumeSection) => {
    if (!editing) return;
    const drafts = sectionToDrafts(section);
    if (editing.draft.isNew) {
      drafts.push(editing.draft);
    } else {
      const index = drafts.findIndex((draft) => draft.entry_id === editing.draft.entry_id);
      if (index !== -1) drafts[index] = editing.draft;
    }
    void commitSection(section, drafts);
  };

  const moveEntry = (section: ResumeSection, entryId: string, direction: -1 | 1) => {
    const drafts = sectionToDrafts(section);
    const index = drafts.findIndex((draft) => draft.entry_id === entryId);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= drafts.length) return;
    [drafts[index], drafts[target]] = [drafts[target], drafts[index]];
    void commitSection(section, drafts);
  };

  const deleteEntry = (section: ResumeSection, entryId: string) => {
    const drafts = sectionToDrafts(section).filter((draft) => draft.entry_id !== entryId);
    void commitSection(section, drafts);
  };

  const startEditProfile = () => {
    if (!profileSource) return;
    setEditing(null);
    setConfirmDelete(null);
    setProfileDraft({
      ...profileSource.profile,
      social_links: profileSource.profile.social_links.map((link) => ({ ...link })),
    });
    setSummaryDraft(null);
  };

  const startEditSummary = () => {
    if (!profileSource) return;
    setEditing(null);
    setConfirmDelete(null);
    setProfileDraft(null);
    setSummaryDraft(profileSource.summary);
    setSummaryToolbarVisible(false);
  };

  const saveProfile = async () => {
    if (!profileSource || !profileDraft) return;
    setSavingProfile(true);
    setProfileError(null);
    try {
      const saved = await invoke<ResumeProfileSource>('save_resume_profile', {
        language,
        profile: profileDraft,
        expectedRevision: profileSource.revision,
      });
      setProfileSource(saved);
      setProfileDraft(null);
    } catch (reason) {
      setProfileError(String(reason));
    } finally {
      setSavingProfile(false);
    }
  };

  const saveSummary = async () => {
    if (!profileSource || summaryDraft === null) return;
    setSavingProfile(true);
    setProfileError(null);
    try {
      const saved = await invoke<ResumeProfileSource>('save_resume_summary', {
        language,
        summary: summaryDraft,
        expectedRevision: profileSource.revision,
      });
      setProfileSource(saved);
      setSummaryDraft(null);
    } catch (reason) {
      setProfileError(String(reason));
    } finally {
      setSavingProfile(false);
    }
  };

  const fallbackSummaryText = overview?.translations.find((translation) => translation.language === language)
    ?.content
    || overview?.translations.find((translation) => translation.language === overview.canonical_language)?.content
    || overview?.translations[0]?.content
    || '';
  const summaryText = profileSource?.summary ?? fallbackSummaryText;
  const editingSection = editing
    ? orderedSections.find((section) => section.role === editing.role) || null
    : null;
  const editingEntry = editing && editingSection
    ? editingSection.entries.find((entry) => entry.entry_id === editing.draft.entry_id) || null
    : null;
  const editingTitle = editing
    ? asText(editing.draft.fields.title)
      || asText(editing.draft.fields.position)
      || asText(editing.draft.fields.degree)
      || asText(editing.draft.fields.category)
      || (editing.draft.isNew ? `New ${roleLabels[editing.role] || editing.role}` : editing.draft.entry_id)
    : '';

  return (
    <section className="resume-page" aria-label="Resume">
      <div className="resume-sheet">
      {profileLoading && <div className="empty resume-profile-loading">Reading profile...</div>}

      {profileError && (
        <div className="error resume-section-error" role="alert">
          <AlertCircle size={14} />
          <span>{profileError}</span>
        </div>
      )}

      {profileSource ? (
        <ResumeProfileView
          source={profileSource}
          onEdit={startEditProfile}
          editingDisabled={editing !== null || summaryDraft !== null || savingProfile}
          showEditControls={editControlsVisible}
        />
      ) : null}

      {(profileSource || summaryText) && (
        <header className="resume-summary">
          {profileSource && editControlsVisible && (
            <button type="button" className="resume-block-action resume-summary-edit" disabled={editing !== null || profileDraft !== null || savingProfile} onClick={startEditSummary} title="Edit bio" aria-label="Edit bio">
              <PencilLine size={13} />
            </button>
          )}
          {summaryText ? (
            <MarkdownPreview content={summaryText} className="resume-summary-md" />
          ) : (
            <p className="resume-summary-empty">No bio yet.</p>
          )}
        </header>
      )}

      {loading && <div className="empty">Reading resume sources...</div>}

      {error && (
        <div className="error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && orderedSections.map((section) => {
        const saving = savingRole === section.role;
        const sectionError = sectionErrors[section.role];
        return (
          <section className="resume-section" key={section.role}>
            <div className="resume-section-head">
              <h2>{roleLabels[section.role] || section.role}</h2>
              {editControlsVisible && (
                <button
                  type="button"
                  className="resume-block-action"
                  disabled={saving || editing !== null || profileDraft !== null || summaryDraft !== null}
                  onClick={() => startAdd(section)}
                  title={`Add ${section.shape === 'key_value_list' ? 'category' : 'entry'}`}
                  aria-label={`Add ${section.shape === 'key_value_list' ? 'category' : 'entry'}`}
                >
                  <Plus size={14} />
                </button>
              )}
            </div>

            {sectionError && (
              <div className="error resume-section-error" role="alert">
                <AlertCircle size={14} />
                <span>{sectionError}</span>
              </div>
            )}

            <div className={section.shape === 'key_value_list' ? 'resume-skills' : 'resume-entries'}>
              {section.entries.map((entry) => {
                const deleteKey = `${section.role}:${entry.entry_id}`;
                return (
                  <article className="resume-entry" key={entry.entry_id}>
                    <div className="resume-entry-row">
                      <div className="resume-entry-content">
                        {section.shape === 'key_value_list' ? (
                          <div className="resume-skill-group">
                            <span className="resume-skill-category">{asText(fieldOf(entry, 'category')) || entry.entry_id}</span>
                            <div className="resume-skill-tags">
                              {asList(fieldOf(entry, 'items')).map((item) => (
                                <span className="resume-skill-tag" key={item}>{item}</span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <EntryView role={section.role} entry={entry} />
                        )}
                      </div>
                      {editControlsVisible && (
                        <div className="resume-block-actions">
                          <button
                            type="button"
                            className="resume-block-action"
                            disabled={saving || editing !== null || profileDraft !== null || summaryDraft !== null}
                            onClick={() => startEdit(section, entry)}
                            title="Edit"
                            aria-label={`Edit ${entry.entry_id}`}
                          >
                            <PencilLine size={13} />
                          </button>
                          <button
                            type="button"
                            className="resume-block-action"
                            disabled={saving || editing !== null || profileDraft !== null || summaryDraft !== null}
                            onClick={() => moveEntry(section, entry.entry_id, -1)}
                            title="Move up"
                            aria-label={`Move ${entry.entry_id} up`}
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            type="button"
                            className="resume-block-action"
                            disabled={saving || editing !== null || profileDraft !== null || summaryDraft !== null}
                            onClick={() => moveEntry(section, entry.entry_id, 1)}
                            title="Move down"
                            aria-label={`Move ${entry.entry_id} down`}
                          >
                            <ArrowDown size={13} />
                          </button>
                          {confirmDelete === deleteKey ? (
                            <button
                              type="button"
                              className="resume-block-action resume-block-action--danger"
                              disabled={saving}
                              onClick={() => deleteEntry(section, entry.entry_id)}
                            >
                              <Trash2 size={13} />
                              Confirm
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="resume-block-action"
                              disabled={saving || editing !== null || profileDraft !== null || summaryDraft !== null}
                              onClick={() => setConfirmDelete(deleteKey)}
                              title="Delete"
                              aria-label={`Delete ${entry.entry_id}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
      </div>

      {profileDraft && profileSource && (
        <ResumeEditorWorkspace
          eyebrow={`${language.toUpperCase()} resume`}
          title={profileDraft.full_name || 'Profile'}
          subtitle="Profile header"
          saving={savingProfile}
          saveLabel="Save profile"
          language={language}
          onLanguageChange={onLanguageChange}
          outline={[
            { id: 'profile-identity', label: 'Identity' },
            { id: 'profile-contact', label: 'Contact' },
            { id: 'profile-links', label: 'Links' },
          ]}
          onSave={() => void saveProfile()}
          onCancel={() => setProfileDraft(null)}
        >
          <ResumeProfileForm
            profile={profileDraft}
            saving={savingProfile}
            onProfileChange={setProfileDraft}
          />
        </ResumeEditorWorkspace>
      )}

      {summaryDraft !== null && profileSource && (
        <ResumeBioEditor
          value={summaryDraft}
          language={language}
          onLanguageChange={onLanguageChange}
          sourcePath={profileSource.relative_path}
          disabled={savingProfile}
          dirty={summaryDraft !== profileSource.summary}
          toolbarVisible={summaryToolbarVisible}
          onChange={setSummaryDraft}
          onSave={() => void saveSummary()}
          onCancel={() => setSummaryDraft(null)}
          onToggleToolbar={() => setSummaryToolbarVisible((visible) => !visible)}
        />
      )}

      {editing && editingSection && (
        <ResumeEditorWorkspace
          eyebrow={`${language.toUpperCase()} ${roleLabels[editingSection.role] || editingSection.role}`}
          title={editingTitle}
          subtitle={editing.draft.isNew ? 'New resume block' : editing.draft.entry_id}
          saving={savingRole === editingSection.role}
          saveLabel="Save block"
          language={language}
          onLanguageChange={onLanguageChange}
          outline={entryOutlineFor(editing.draft).map(({ id, label }) => ({ id, label }))}
          onSave={() => saveEdit(editingSection)}
          onCancel={() => setEditing(null)}
        >
          <EntryForm
            draft={editing.draft}
            media={editingEntry?.media}
            saving={savingRole === editingSection.role}
            onChange={(fields) => setEditing({ role: editingSection.role, draft: { ...editing.draft, fields } })}
          />
        </ResumeEditorWorkspace>
      )}
    </section>
  );
}
