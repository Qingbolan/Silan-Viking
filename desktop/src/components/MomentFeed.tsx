import { Heart, LockKeyhole, MessageCircle } from 'lucide-react';
import { contentGroupTags, contentGroupUpdatedAt, localizedDocumentTitle, selectPrimaryDocument, translationPreview } from '../lib/content';
import { contentVisibilityFor } from '../lib/contentVisibility';
import { toWebviewMediaUrl } from '../lib/media';
import type { ContentGroup, MomentsSettings } from '../types';

type MomentFeedProps = {
  groups: ContentGroup[];
  empty: string;
  query: string;
  settings: MomentsSettings | null;
  languageByDocument: Record<string, string>;
  onOpen: (group: ContentGroup) => void;
};

const contentGroupDate = (group: ContentGroup) => group.date || contentGroupUpdatedAt(group);

const timelineDate = (group: ContentGroup) => {
  const key = contentGroupDate(group).slice(0, 10);
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : { key, date };
};

export function MomentFeed({
  groups,
  empty,
  query,
  settings,
  languageByDocument,
  onOpen,
}: MomentFeedProps) {
  const ordered = [...groups].sort((left, right) =>
    contentGroupDate(right).localeCompare(contentGroupDate(left)),
  );
  const years = new Map<string, Map<string, { date: Date | null; items: ContentGroup[] }>>();
  for (const group of ordered) {
    const value = timelineDate(group);
    const year = value ? String(value.date.getFullYear()) : 'Undated';
    const key = value?.key || 'undated';
    if (!years.has(year)) years.set(year, new Map());
    const days = years.get(year)!;
    if (!days.has(key)) days.set(key, { date: value?.date || null, items: [] });
    days.get(key)!.items.push(group);
  }

  if (ordered.length === 0) {
    return (
      <div className="moments-feed-empty">
        {query.trim() ? 'No matching moments.' : empty}
      </div>
    );
  }

  const profile = settings?.profile;
  const displayName = profile?.display_name.trim() || 'Profile';
  const avatarUrl = toWebviewMediaUrl(profile?.avatar_url);
  const avatarLabel = profile?.avatar_label.trim() || displayName.charAt(0) || 'P';

  return (
    <section className="moments-feed moments-moments" aria-label="Moments feed">
      <header className="moments-cover">
        <div className="moments-cover-art" aria-hidden="true" />
        <div className="moments-profile" data-align={profile?.alignment || 'right'}>
          <strong>{displayName}</strong>
          <div className="moments-avatar" aria-hidden="true">
            {avatarUrl ? <img src={avatarUrl} alt="" loading="lazy" /> : avatarLabel}
          </div>
        </div>
      </header>

      <div className="moments-timeline">
        {[...years].map(([year, days]) => (
          <section className="moments-year" key={year} aria-label={year}>
            <h2 className="moments-year-heading">{year}</h2>
            <ol className="moments-day-list">
              {[...days].sort(([, left], [, right]) =>
                Number(right.items.some((item) => item.pinned)) - Number(left.items.some((item) => item.pinned)),
              ).map(([key, { date, items }]) => (
                <li className="moments-timeline-row" key={key} data-visibility={items.every(item => item.visibility === 'private') ? 'private' : undefined}>
                  <div className="moments-date">
                    <time dateTime={date ? key : undefined}>{date?.getDate() ?? '—'}</time>
                    {date && <span>{date.toLocaleDateString('en-SG', { month: 'short' })}</span>}
                  </div>
                  <div className="moments-day-posts" data-multiple={items.length > 1}>
                    {[...items].sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))).map((group) => {
                      const document = selectPrimaryDocument(group);
                      const language = document ? languageByDocument[document.id] : undefined;
                      const title = localizedDocumentTitle(document, language) || group.title;
                      const preview = translationPreview(document, language) || group.description;
                      const visibility = contentVisibilityFor(group.visibility);
                      const tags = contentGroupTags(group, 3);
                      return (
                        <article className="moments-post" key={group.id} data-visibility={visibility.visibility}>
                          <button type="button" className="moments-entry" onClick={() => onOpen(group)} aria-label={`Edit ${title}`}>
                            {group.pinned && <span className="moments-post-pin">Pin</span>}
                            <div className="moments-entry-heading">
                              <h3>{title}</h3>
                              {visibility.visibility === 'private' && <span className="moments-private-icon" role="img" aria-label="私密" title="私密"><LockKeyhole size={14} aria-hidden="true" /></span>}
                            </div>
                            {preview && <p>{preview}</p>}
                            {tags.length > 0 && <div className="moments-tags">
                              {tags.map((tag) => <span key={tag}>#{tag}</span>)}
                            </div>}
                          </button>
                          {(group.engagement.likes > 0 || group.engagement.comments > 0) && <div className="moments-post-footer">
                            <div className="moments-engagement" aria-label={`${group.engagement.likes} likes and ${group.engagement.comments} comments`}>
                              {group.engagement.likes > 0 && <span><Heart size={12} aria-hidden="true" />{group.engagement.likes}</span>}
                              {group.engagement.comments > 0 && <span><MessageCircle size={12} aria-hidden="true" />{group.engagement.comments}</span>}
                            </div>
                          </div>}
                        </article>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </section>
  );
}
