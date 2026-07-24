import { useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  AlertCircle,
  Archive,
  BookOpen,
  Check,
  CheckCircle2,
  FolderKanban,
  ImagePlus,
  KeyRound,
  Languages,
  LoaderCircle,
  Radio,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { selectPrimaryDocument } from '../lib/content';
import { contentLifecycleFor, contentStateSummary } from '../lib/contentLifecycle';
import { formatShortDate } from '../lib/format';
import { toWebviewMediaUrl } from '../lib/media';
import { useOpenAiCredentials } from '../lib/openAiCredentials';
import type { ContentGroup, WorkspacePreferences } from '../types';

type SettingsTab = 'profile' | 'connection' | 'archive';
type ProfileSavePhase = 'idle' | 'language' | 'avatar' | 'removing';

type WorkspaceSettingsPageProps = {
  archivedResources: ContentGroup[];
  restoringResourceId: string;
  preferences: WorkspacePreferences | null;
  onPreferencesChange: (preferences: WorkspacePreferences) => void;
  onRestoreResource: (resource: ContentGroup) => Promise<void>;
};

const archiveKindMeta = {
  blog: { label: 'Article', Icon: BookOpen },
  episode: { label: 'Episode', Icon: Radio },
  project: { label: 'Project', Icon: FolderKanban },
} as const;

const languageOptions = [
  {
    value: 'en',
    label: 'English',
    nativeLabel: 'English',
    description: 'Open shelves, Resume, and Capture in English.',
  },
  {
    value: 'zh',
    label: 'Chinese',
    nativeLabel: '简体中文',
    description: '默认以中文打开内容、简历与快速记录。',
  },
] as const;

const settingsTabMeta = {
  profile: {
    label: 'Profile',
  },
  connection: {
    label: 'AI connection',
  },
  archive: {
    label: 'Archived resources',
  },
} as const;

function WorkspaceProfileSettings({
  preferences,
  onPreferencesChange,
}: {
  preferences: WorkspacePreferences | null;
  onPreferencesChange: (preferences: WorkspacePreferences) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<ProfileSavePhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const busy = phase !== 'idle';
  const avatarUrl = toWebviewMediaUrl(preferences?.identity.avatar_url);
  const displayName = preferences?.identity.display_name || 'Workspace owner';
  const avatarLabel = preferences?.identity.avatar_label || displayName.charAt(0) || 'P';

  const saveDefaultLanguage = async (language: WorkspacePreferences['default_language']) => {
    if (!preferences || busy || language === preferences.default_language) return;
    setPhase('language');
    setError(null);
    try {
      const saved = await invoke<WorkspacePreferences>('save_workspace_default_language', { language });
      onPreferencesChange(saved);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setPhase('idle');
    }
  };

  const saveAvatar = async (file: File) => {
    if (busy) return;
    if (file.size > 12 * 1024 * 1024) {
      setError('Choose an image smaller than 12 MB.');
      return;
    }
    setPhase('avatar');
    setError(null);
    try {
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      const saved = await invoke<WorkspacePreferences>('save_workspace_avatar', {
        fileName: file.name,
        bytes,
      });
      onPreferencesChange(saved);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setPhase('idle');
    }
  };

  const removeAvatar = async () => {
    if (!preferences?.identity.avatar_reference || busy) return;
    setPhase('removing');
    setError(null);
    try {
      const saved = await invoke<WorkspacePreferences>('remove_workspace_avatar');
      onPreferencesChange(saved);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setPhase('idle');
    }
  };

  return (
    <section
      className="workspace-settings-section workspace-profile-section"
      aria-labelledby="workspace-profile-heading"
    >
      <header className="workspace-settings-section-header">
        <h2 id="workspace-profile-heading">Profile</h2>
        <p>
          Set the identity shown across the workspace and choose how authoring views open.
        </p>
      </header>

      {!preferences ? (
        <div className="workspace-profile-loading" aria-live="polite">
          <LoaderCircle size={16} className="spin" />
          <span>Reading workspace profile…</span>
        </div>
      ) : (
        <div className="workspace-profile-grid">
          <section className="workspace-profile-setting" aria-labelledby="workspace-avatar-label">
            <div className="workspace-profile-setting-copy">
              <h3 id="workspace-avatar-label">Avatar</h3>
              <p>Used in the app sidebar, Moments profile, and public Resume identity.</p>
            </div>

            <div className="workspace-avatar-editor">
              <div className="workspace-avatar-preview" data-empty={!avatarUrl}>
                {avatarUrl
                  ? <img src={avatarUrl} alt={`${displayName} avatar`} />
                  : <span aria-hidden="true">{avatarLabel}</span>}
              </div>
              <div className="workspace-avatar-copy">
                <strong>{displayName}</strong>
                <span>
                  {preferences.identity.avatar_reference
                    ? preferences.identity.avatar_reference
                    : 'No avatar selected'}
                </span>
                <div className="workspace-avatar-actions">
                  <button
                    type="button"
                    className="primary"
                    disabled={busy}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {phase === 'avatar'
                      ? <LoaderCircle size={14} className="spin" />
                      : <ImagePlus size={14} />}
                    {preferences.identity.avatar_reference ? 'Replace image' : 'Choose image'}
                  </button>
                  {preferences.identity.avatar_reference && (
                    <button
                      type="button"
                      className="workspace-avatar-remove"
                      disabled={busy}
                      onClick={() => void removeAvatar()}
                    >
                      {phase === 'removing'
                        ? <LoaderCircle size={14} className="spin" />
                        : <Trash2 size={14} />}
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp,image/avif,image/x-icon"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = '';
                  if (file) void saveAvatar(file);
                }}
              />
            </div>
          </section>

          <section className="workspace-profile-setting" aria-labelledby="workspace-language-label">
            <div className="workspace-profile-setting-copy">
              <h3 id="workspace-language-label">Default language</h3>
              <p>You can still switch language from any shelf or editor.</p>
            </div>

            <div className="workspace-language-options" role="radiogroup" aria-labelledby="workspace-language-label">
              {languageOptions.map((option) => {
                const selected = preferences.default_language === option.value;
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={selected ? 'active' : undefined}
                    disabled={busy}
                    key={option.value}
                    onClick={() => void saveDefaultLanguage(option.value)}
                  >
                    <span className="workspace-language-mark">
                      {phase === 'language' && !selected
                        ? <LoaderCircle size={14} className="spin" />
                        : selected
                          ? <Check size={14} />
                          : <Languages size={14} />}
                    </span>
                    <span>
                      <strong>{option.nativeLabel}</strong>
                      <small>{option.label}</small>
                      <p>{option.description}</p>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {error && (
        <div className="dialog-error workspace-profile-error" role="alert">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}

function OpenAiConnectionSettings() {
  const { state, setDraft, save, test, remove } = useOpenAiCredentials();
  const busy = state.phase === 'loading'
    || state.phase === 'saving'
    || state.phase === 'testing'
    || state.phase === 'removing';
  const configured = state.status?.state === 'ready';
  const invalid = state.status?.state === 'invalid';
  const verified = Boolean(state.status?.request_id);
  const statusLabel = verified
    ? 'Connected'
    : configured
      ? 'Configured'
      : invalid
        ? 'Stored key is invalid'
        : 'Not configured';

  return (
    <section className="workspace-settings-section" aria-labelledby="workspace-connection-heading">
      <header className="workspace-settings-section-header">
        <h2 id="workspace-connection-heading">AI connection</h2>
        <p>Translation and voice capture share one Platform API key stored in macOS Keychain.</p>
      </header>

      <div className="openai-connection-status" data-state={state.status?.state || 'loading'}>
        {state.phase === 'loading'
          ? <LoaderCircle size={16} className="spin" />
          : configured
            ? <CheckCircle2 size={16} />
            : <AlertCircle size={16} />}
        <div>
          <strong>{state.phase === 'loading' ? 'Reading Keychain…' : statusLabel}</strong>
          <span>Translation model · {state.status?.model || 'gpt-5-nano'}</span>
        </div>
      </div>

      <form
        className="openai-settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (state.draft.trim() && !busy) void save();
        }}
      >
        <label className="openai-key-field">
          <span>{configured ? 'Replace API key' : 'OpenAI Platform API key'}</span>
          <input
            type="password"
            value={state.draft}
            placeholder="sk-…"
            autoComplete="new-password"
            spellCheck={false}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
          />
          <small>The key is verified before it replaces the current Keychain entry.</small>
        </label>

        {(state.error || state.status?.detail) && (
          <div className="dialog-error openai-settings-error" role="alert">
            <AlertCircle size={14} />
            <span>{state.error || state.status?.detail}</span>
          </div>
        )}

        {state.status?.request_id && !state.error && (
          <div className="openai-verification-result">
            <ShieldCheck size={14} />
            <span>Verified with OpenAI · request {state.status.request_id}</span>
          </div>
        )}

        <footer className="openai-settings-actions">
          <div>
            {(configured || invalid) && (
              <button
                type="button"
                className="openai-remove-button"
                disabled={busy}
                onClick={() => void remove()}
              >
                {state.phase === 'removing' ? <LoaderCircle size={14} className="spin" /> : <Trash2 size={14} />}
                Remove
              </button>
            )}
          </div>
          <div>
            {configured && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void test()}
              >
                {state.phase === 'testing' ? <LoaderCircle size={14} className="spin" /> : <ShieldCheck size={14} />}
                Test connection
              </button>
            )}
            <button
              type="submit"
              className="primary"
              disabled={busy || !state.draft.trim()}
            >
              {state.phase === 'saving' ? <LoaderCircle size={14} className="spin" /> : <KeyRound size={14} />}
              Verify &amp; save
            </button>
          </div>
        </footer>
      </form>

      <div className="workspace-settings-security-note">
        <ShieldCheck size={14} />
        <span>The API key stays in macOS Keychain and is never written to <strong>content/</strong>.</span>
      </div>
    </section>
  );
}

function ArchivedResourceSettings({
  resources,
  restoringResourceId,
  onRestoreResource,
}: {
  resources: ContentGroup[];
  restoringResourceId: string;
  onRestoreResource: (resource: ContentGroup) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const visibleResources = useMemo(() => resources.filter((resource) => {
    if (!normalizedQuery) return true;
    const primary = selectPrimaryDocument(resource);
    return [
      resource.title,
      resource.slug,
      resource.kind,
      primary?.series_title,
      primary?.series_slug,
    ].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery);
  }), [normalizedQuery, resources]);
  const articleCount = resources.filter((resource) => resource.kind === 'blog').length;
  const episodeCount = resources.filter((resource) => resource.kind === 'episode').length;
  const projectCount = resources.filter((resource) => resource.kind === 'project').length;

  return (
    <section
      className="workspace-settings-section workspace-archive-section"
      aria-labelledby="workspace-archive-heading"
    >
      <header className="workspace-settings-section-header">
        <h2 id="workspace-archive-heading">Archived resources</h2>
        <p>
          Archived content stays in its source files but is removed from content shelves,
          navigation counts, and editor references.
        </p>
      </header>

      <div className="workspace-archive-summary" aria-label="Archive summary">
        <span><strong>{resources.length}</strong> total</span>
        <span><strong>{articleCount}</strong> articles</span>
        <span><strong>{episodeCount}</strong> episodes</span>
        <span><strong>{projectCount}</strong> projects</span>
      </div>

      {resources.length > 0 && (
        <label className="workspace-archive-search">
          <Search size={14} />
          <input
            type="search"
            value={query}
            placeholder="Search archived resources"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      )}

      <div className="workspace-archive-list" aria-live="polite">
        {visibleResources.map((resource) => {
          const meta = archiveKindMeta[resource.kind as keyof typeof archiveKindMeta];
          const primary = selectPrimaryDocument(resource);
          const Icon = meta?.Icon || Archive;
          const restoring = restoringResourceId === resource.id;
          const restoreAction = contentLifecycleFor(resource.kind, 'archived', 'private')
            .actions
            .find((action) => action.id === 'restore');
          const context = resource.kind === 'episode'
            ? primary?.series_title || primary?.series_slug || 'Unfiled series'
            : resource.slug;
          return (
            <article className="workspace-archive-row" key={resource.id}>
              <div className="workspace-archive-row-icon"><Icon size={15} /></div>
              <div className="workspace-archive-row-copy">
                <div>
                  <span>{meta?.label || resource.kind}</span>
                  <small>{contentStateSummary(resource.kind, resource.status, resource.visibility)}</small>
                </div>
                <strong>{resource.title}</strong>
                <p>{context} · archived {formatShortDate(primary?.updated_at || '')}</p>
              </div>
              <button
                type="button"
                className="workspace-archive-restore"
                disabled={Boolean(restoringResourceId)}
                title={restoreAction?.description || 'Restore this resource privately'}
                onClick={() => void onRestoreResource(resource)}
              >
                {restoring
                  ? <LoaderCircle size={14} className="spin" />
                  : <RotateCcw size={14} />}
                {restoring ? 'Restoring' : restoreAction?.label || 'Restore'}
              </button>
            </article>
          );
        })}

        {resources.length === 0 && (
          <div className="workspace-archive-empty">
            <CheckCircle2 size={20} />
            <strong>No archived resources</strong>
            <p>Archived articles, episodes, and projects will appear here for restoration.</p>
          </div>
        )}
        {resources.length > 0 && visibleResources.length === 0 && (
          <div className="workspace-archive-empty">
            <Search size={20} />
            <strong>No archive matches</strong>
            <p>Try a title, slug, type, or series name.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function WorkspaceSettingsPage({
  archivedResources,
  restoringResourceId,
  preferences,
  onPreferencesChange,
  onRestoreResource,
}: WorkspaceSettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  return (
    <div className="workspace-settings-page">
      <aside className="workspace-settings-sidebar">
        <nav className="workspace-settings-tabs" aria-label="Settings sections" role="tablist">
          {(Object.keys(settingsTabMeta) as SettingsTab[]).map((tab) => {
            const meta = settingsTabMeta[tab];
            return (
              <button
                type="button"
                role="tab"
                className={activeTab === tab ? 'active' : undefined}
                aria-selected={activeTab === tab}
                aria-controls="workspace-settings-panel"
                key={tab}
                onClick={() => setActiveTab(tab)}
              >
                <span>{meta.label}</span>
                {tab === 'archive' && (
                  <strong className="workspace-settings-tab-count">{archivedResources.length}</strong>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      <div
        id="workspace-settings-panel"
        className="workspace-settings-content"
        role="tabpanel"
        aria-label={settingsTabMeta[activeTab].label}
      >
        {activeTab === 'profile' && (
          <WorkspaceProfileSettings
            preferences={preferences}
            onPreferencesChange={onPreferencesChange}
          />
        )}
        {activeTab === 'connection' && <OpenAiConnectionSettings />}
        {activeTab === 'archive' && (
          <ArchivedResourceSettings
            resources={archivedResources}
            restoringResourceId={restoringResourceId}
            onRestoreResource={onRestoreResource}
          />
        )}
      </div>
    </div>
  );
}
