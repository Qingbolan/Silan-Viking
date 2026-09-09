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
import { Button } from './ds/Button';
import {
  Dialog,
  DialogActions,
  DialogCard,
  DialogDescription,
  DialogTitle,
} from './ds/Dialog';
import { Input } from './ds/Input';
import { contentVisibilityFor, contentStateSummary } from '../lib/contentVisibility';
import { formatShortDate } from '../lib/format';
import { toWebviewMediaUrl } from '../lib/media';
import { useApiCredentials, type ApiCredentialProvider } from '../lib/apiCredentials';
import type { ContentGroup, WorkspacePreferences } from '../types';

type SettingsTab = 'profile' | 'connection' | 'private';
type ProfileSavePhase = 'idle' | 'language' | 'avatar' | 'removing';

type WorkspaceSettingsPageProps = {
  privateResources: ContentGroup[];
  restoringResourceId: string;
  preferences: WorkspacePreferences | null;
  onPreferencesChange: (preferences: WorkspacePreferences) => void;
  onMakePublicResource: (resource: ContentGroup) => Promise<void>;
  onDeleteResource: (resource: ContentGroup, confirmation: string) => Promise<void>;
};

const privateKindMeta = {
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
  private: {
    label: 'Private resources',
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
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={busy}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {phase === 'avatar'
                      ? <LoaderCircle size={14} className="spin" />
                      : <ImagePlus size={14} />}
                    {preferences.identity.avatar_reference ? 'Replace image' : 'Choose image'}
                  </Button>
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

const apiProviderMeta: Record<ApiCredentialProvider, {
  displayName: string;
  description: string;
  modelLabel: string;
  keyLabel: string;
  placeholder: string;
}> = {
  openai: {
    displayName: 'OpenAI',
    description: 'Translation and voice capture share one Platform API key stored in macOS Keychain.',
    modelLabel: 'Translation model',
    keyLabel: 'OpenAI Platform API key',
    placeholder: 'sk-…',
  },
  deepseek: {
    displayName: 'DeepSeek',
    description: 'Reader review scores Blog and episode-series prose without modifying source files.',
    modelLabel: 'Reader review model',
    keyLabel: 'DeepSeek API key',
    placeholder: 'DeepSeek API key',
  },
};

function ApiProviderConnectionSettings({ provider }: { provider: ApiCredentialProvider }) {
  const meta = apiProviderMeta[provider];
  const { state, setDraft, save, test, remove } = useApiCredentials(provider);
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
    <section className="workspace-settings-section" aria-labelledby={`${provider}-connection-heading`}>
      <header className="workspace-settings-section-header">
        <h2 id={`${provider}-connection-heading`}>{meta.displayName}</h2>
        <p>{meta.description}</p>
      </header>

      <div className="api-connection-status" data-state={state.status?.state || 'loading'}>
        {state.phase === 'loading'
          ? <LoaderCircle size={16} className="spin" />
          : configured
            ? <CheckCircle2 size={16} />
            : <AlertCircle size={16} />}
        <div>
          <strong>{state.phase === 'loading' ? 'Reading Keychain…' : statusLabel}</strong>
          <span>{meta.modelLabel} · {state.status?.model || '—'}</span>
        </div>
      </div>

      <form
        className="api-settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (state.draft.trim() && !busy) void save();
        }}
      >
        <label className="api-key-field">
          <span>{configured ? `Replace ${meta.displayName} API key` : meta.keyLabel}</span>
          <input
            type="password"
            value={state.draft}
            placeholder={meta.placeholder}
            autoComplete="new-password"
            spellCheck={false}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
          />
          <small>The key is verified before it replaces the current Keychain entry.</small>
        </label>

        {(state.error || state.status?.detail) && (
          <div className="dialog-error api-settings-error" role="alert">
            <AlertCircle size={14} />
            <span>{state.error || state.status?.detail}</span>
          </div>
        )}

        {state.status?.request_id && !state.error && (
          <div className="api-verification-result">
            <ShieldCheck size={14} />
            <span>Verified with {meta.displayName} · request {state.status.request_id}</span>
          </div>
        )}

        <footer className="api-settings-actions">
          <div>
            {(configured || invalid) && (
              <button
                type="button"
                className="api-remove-button"
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
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => void test()}
              >
                {state.phase === 'testing' ? <LoaderCircle size={14} className="spin" /> : <ShieldCheck size={14} />}
                Test connection
              </Button>
            )}
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={busy || !state.draft.trim()}
            >
              {state.phase === 'saving' ? <LoaderCircle size={14} className="spin" /> : <KeyRound size={14} />}
              Verify &amp; save
            </Button>
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

function PrivateResourceSettings({
  resources,
  restoringResourceId,
  onMakePublicResource,
  onDeleteResource,
}: {
  resources: ContentGroup[];
  restoringResourceId: string;
  onMakePublicResource: (resource: ContentGroup) => Promise<void>;
  onDeleteResource: (resource: ContentGroup, confirmation: string) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ContentGroup | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState('');
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
  const deleteCoordinate = deleteTarget
    ? deleteTarget.kind === 'episode'
      ? `${selectPrimaryDocument(deleteTarget)?.series_slug || 'series'}/${deleteTarget.slug}`
      : deleteTarget.slug
    : '';
  const deleting = Boolean(deleteTarget && restoringResourceId === deleteTarget.id);

  const closeDeleteDialog = () => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteConfirmation('');
    setDeleteError('');
  };

  const confirmPermanentDeletion = async () => {
    if (!deleteTarget || deleteConfirmation.trim() !== deleteCoordinate || deleting) return;
    setDeleteError('');
    try {
      await onDeleteResource(deleteTarget, deleteConfirmation.trim());
      closeDeleteDialog();
    } catch (reason) {
      setDeleteError(String(reason));
    }
  };

  return (
    <section
      className="workspace-settings-section workspace-private-section"
      aria-labelledby="workspace-private-heading"
    >
      <header className="workspace-settings-section-header">
        <h2 id="workspace-private-heading">Private resources</h2>
        <p>
          Private content stays in your workspace and is excluded from the next website deployment.
        </p>
      </header>

      <div className="workspace-private-summary" aria-label="Archive summary">
        <span><strong>{resources.length}</strong> total</span>
        <span><strong>{articleCount}</strong> articles</span>
        <span><strong>{episodeCount}</strong> episodes</span>
        <span><strong>{projectCount}</strong> projects</span>
      </div>

      {resources.length > 0 && (
        <label className="workspace-private-search">
          <Search size={14} />
          <input
            type="search"
            value={query}
            placeholder="Search private resources"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      )}

      <div className="workspace-private-list" aria-live="polite">
        {visibleResources.map((resource) => {
          const meta = privateKindMeta[resource.kind as keyof typeof privateKindMeta];
          const primary = selectPrimaryDocument(resource);
          const Icon = meta?.Icon || Archive;
          const restoring = restoringResourceId === resource.id;
          const restoreAction = contentVisibilityFor('private')
            .actions
            .find((action) => action.id === 'make-public');
          const context = resource.kind === 'episode'
            ? primary?.series_title || primary?.series_slug || 'Unfiled series'
            : resource.slug;
          return (
            <article className="workspace-private-row" key={resource.id}>
              <div className="workspace-private-row-icon"><Icon size={15} /></div>
              <div className="workspace-private-row-copy">
                <div>
                  <span>{meta?.label || resource.kind}</span>
                  <small>{contentStateSummary(resource.visibility)}</small>
                </div>
                <strong>{resource.title}</strong>
                <p>{context} · {formatShortDate(primary?.updated_at || '')}</p>
              </div>
              <div className="workspace-private-actions">
                <button
                  type="button"
                  className="workspace-private-restore"
                  disabled={Boolean(restoringResourceId)}
                  title={restoreAction?.description || 'Make this resource public'}
                  onClick={() => void onMakePublicResource(resource)}
                >
                  {restoring
                    ? <LoaderCircle size={14} className="spin" />
                    : <RotateCcw size={14} />}
                  {restoring ? 'Updating' : restoreAction?.label || 'Make public'}
                </button>
                <button
                  type="button"
                  className="workspace-private-delete"
                  disabled={Boolean(restoringResourceId)}
                  title={`Permanently delete ${resource.title}`}
                  onClick={() => {
                    setDeleteTarget(resource);
                    setDeleteConfirmation('');
                    setDeleteError('');
                  }}
                >
                  <Trash2 size={14} />
                  Delete permanently
                </button>
              </div>
            </article>
          );
        })}

        {resources.length === 0 && (
          <div className="workspace-private-empty">
            <CheckCircle2 size={20} />
            <strong>No private resources</strong>
            <p>Private content appears here.</p>
          </div>
        )}
        {resources.length > 0 && visibleResources.length === 0 && (
          <div className="workspace-private-empty">
            <Search size={20} />
            <strong>No private content matches</strong>
            <p>Try a title, slug, type, or series name.</p>
          </div>
        )}
      </div>

      <Dialog open={Boolean(deleteTarget)} onClose={closeDeleteDialog}>
        <DialogCard role="alertdialog" aria-labelledby="archive-delete-title">
          <DialogTitle id="archive-delete-title">Permanently delete this resource?</DialogTitle>
          <DialogDescription>
            This erases <strong>{deleteTarget?.title}</strong> and all of its source files from
            the local content workspace. This action cannot be undone.
          </DialogDescription>
          <label className="workspace-private-delete-confirmation">
            <span>Type <strong>{deleteCoordinate}</strong> to confirm</span>
            <Input
              value={deleteConfirmation}
              placeholder={deleteCoordinate}
              autoComplete="off"
              spellCheck={false}
              data-autofocus
              disabled={deleting}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void confirmPermanentDeletion();
              }}
            />
          </label>
          {deleteError && (
            <p className="workspace-private-delete-error" role="alert">{deleteError}</p>
          )}
          <DialogActions>
            <Button type="button" variant="secondary" size="sm" disabled={deleting} onClick={closeDeleteDialog}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              loading={deleting}
              disabled={deleteConfirmation.trim() !== deleteCoordinate}
              onClick={() => void confirmPermanentDeletion()}
            >
              Delete permanently
            </Button>
          </DialogActions>
        </DialogCard>
      </Dialog>
    </section>
  );
}

export function WorkspaceSettingsPage({
  privateResources,
  restoringResourceId,
  preferences,
  onPreferencesChange,
  onMakePublicResource,
  onDeleteResource,
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
                {tab === 'private' && (
                  <strong className="workspace-settings-tab-count">{privateResources.length}</strong>
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
        {activeTab === 'connection' && (
          <div className="api-provider-settings">
            <ApiProviderConnectionSettings provider="openai" />
            <ApiProviderConnectionSettings provider="deepseek" />
          </div>
        )}
        {activeTab === 'private' && (
          <PrivateResourceSettings
            resources={privateResources}
            restoringResourceId={restoringResourceId}
            onMakePublicResource={onMakePublicResource}
            onDeleteResource={onDeleteResource}
          />
        )}
      </div>
    </div>
  );
}
