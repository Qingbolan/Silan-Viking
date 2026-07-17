import { Lock, PencilLine } from 'lucide-react';
import { contentGroupTags, contentGroupUpdatedAt, selectPrimaryDocument, translationPreview } from '../lib/content';
import { toWebviewMediaUrl } from '../lib/media';
import type { ContentGroup, EditorDocument, MomentsSettings } from '../types';

type UpdateFeedProps = {
  groups: ContentGroup[];
  empty: string;
  query: string;
  settings: MomentsSettings | null;
  eyebrow: string;
  title: string;
  meta: string[];
  onOpen: (group: ContentGroup) => void;
};

const primaryTranslation = (document?: EditorDocument | null) => (
  document?.translations.find((translation) => translation.language === document.canonical_language)
  || document?.translations[0]
  || null
);

const updateDateParts = (value: string) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return { day: '', month: '' };
  return {
    day: new Intl.DateTimeFormat('en', { day: 'numeric' }).format(date),
    month: new Intl.DateTimeFormat('en', { month: 'short' }).format(date),
  };
};

const contentGroupDate = (group: ContentGroup) => group.date || contentGroupUpdatedAt(group);

export function UpdateFeed({
  groups,
  empty,
  query,
  settings,
  eyebrow,
  title,
  meta,
  onOpen,
}: UpdateFeedProps) {
  const ordered = [...groups].sort((left, right) =>
    Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))
    || contentGroupDate(right).localeCompare(contentGroupDate(left)),
  );

  if (ordered.length === 0) {
    return (
      <div className="updates-feed-empty">
        {query.trim() ? 'No matching moments.' : empty}
      </div>
    );
  }

  const profile = settings?.profile;
  const displayName = profile?.display_name.trim() || 'Profile';
  const avatarUrl = toWebviewMediaUrl(profile?.avatar_url);
  const avatarLabel = profile?.avatar_label.trim() || displayName.charAt(0) || 'P';

  return (
    <section className="updates-feed updates-moments" aria-label="Updates feed">
      <header className="updates-cover">
        <div className="updates-cover-art" aria-hidden="true" />
        <div className="updates-cover-title">
          <div className="eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          <div className="meta">
            {meta.map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
        <div className="updates-profile" data-align={profile?.alignment || 'right'}>
          <strong>{displayName}</strong>
          <div className="updates-avatar" aria-hidden="true">
            {avatarUrl ? <img src={avatarUrl} alt="" loading="lazy" /> : avatarLabel}
          </div>
        </div>
      </header>

      <div className="updates-timeline">
        {ordered.map((group) => {
          const document = selectPrimaryDocument(group);
          const translation = primaryTranslation(document);
          const updateDate = contentGroupDate(group);
          const date = updateDateParts(updateDate);
          const tags = contentGroupTags(group, 3);
          const preview = translationPreview(document) || translation?.content || group.title;

          return (
            <article className="updates-timeline-row" key={group.id}>
              <time className="updates-date" dateTime={updateDate}>
                {group.pinned && <em>PIN</em>}
                <strong>{date.day}</strong>
                <span>{date.month}.</span>
              </time>
              <button type="button" className="updates-entry" onClick={() => onOpen(group)}>
                <div>
                  <p>{preview}</p>
                  {tags.length > 0 && (
                    <div className="updates-tags">
                      {tags.map((tag) => <span key={tag}>#{tag}</span>)}
                    </div>
                  )}
                </div>
                {group.visibility !== 'public' ? <Lock size={18} aria-label="Private update" /> : <PencilLine size={16} aria-hidden="true" />}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
