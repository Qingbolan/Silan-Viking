import { ExternalLink, Link2, Unlink2 } from 'lucide-react';
import { contentStateSummary } from '../lib/contentVisibility';
import type { ContentKind, ContentRelation } from '../types';
import { Badge } from './ds/Badge';
import { Button } from './ds/Button';
import { Select } from './ds/Select';

export type RelationTargetKind = Extract<ContentKind, 'blog' | 'project'>;

export type ContentReferenceOption = {
  kind: RelationTargetKind;
  slug: string;
  title: string;
  visibility: string;
};

type ContentRelationManagerProps = {
  relations: ContentRelation[];
  targets: ContentReferenceOption[];
  targetKind: RelationTargetKind;
  targetSlug: string;
  busyKey: string;
  onTargetKindChange: (kind: RelationTargetKind) => void;
  onTargetSlugChange: (slug: string) => void;
  onLink: () => void;
  onUnlink: (relation: ContentRelation) => void;
  onOpen: (relation: ContentRelation) => void;
};

const humanizeRelationType = (value: string) => (
  value
    .split('_')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
);

export function ContentRelationManager({
  relations,
  targets,
  targetKind,
  targetSlug,
  busyKey,
  onTargetKindChange,
  onTargetSlugChange,
  onLink,
  onUnlink,
  onOpen,
}: ContentRelationManagerProps) {
  const targetOptions = targets.filter((target) => target.kind === targetKind);
  const selectedAlreadyLinked = relations.some((relation) => (
    relation.relation_type === 'references'
    && relation.target_kind === targetKind
    && relation.target_slug === targetSlug
  ));

  return (
    <section className="resume-editor-section content-settings-section content-relation-manager">
      <div className="content-settings-section-heading">
        <h3>Linked content</h3>
      </div>

      {relations.length === 0 ? (
        <div className="content-relation-empty">No Blog or Project links yet.</div>
      ) : (
        <ul className="content-relation-list" aria-label="Current content relations">
          {relations.map((relation) => {
            const target = targets.find((candidate) => (
              candidate.kind === relation.target_kind && candidate.slug === relation.target_slug
            ));
            const canManageReference = relation.relation_type === 'references'
              && (relation.target_kind === 'blog' || relation.target_kind === 'project');
            const unlinkKey = `moment-unlink:${relation.target_kind}:${relation.target_slug}`;
            return (
              <li key={`${relation.relation_type}:${relation.target_uri}`}>
                <button
                  type="button"
                  className="content-relation-target"
                  onClick={() => onOpen(relation)}
                  disabled={!target || Boolean(busyKey)}
                  title={target ? `Open ${target.title}` : `${relation.target_uri} is unavailable in the active workspace`}
                >
                  <span className="content-relation-target-copy">
                    <span className="content-relation-badges">
                      <Badge size="sm" tone="primary">{relation.target_kind}</Badge>
                      <Badge size="sm" tone="neutral">{humanizeRelationType(relation.relation_type)}</Badge>
                      {target && (
                        <Badge size="sm" tone={target.visibility === 'public' ? 'success' : 'neutral'}>
                          {contentStateSummary(target.visibility)}
                        </Badge>
                      )}
                    </span>
                    <strong>{target?.title || relation.target_slug}</strong>
                    <code>{relation.target_slug}</code>
                  </span>
                  <ExternalLink size={14} aria-hidden="true" />
                </button>
                {canManageReference && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Unlink ${target?.title || relation.target_slug}`}
                    title={`Unlink ${target?.title || relation.target_slug}`}
                    disabled={Boolean(busyKey)}
                    loading={busyKey === unlinkKey}
                    onClick={() => onUnlink(relation)}
                  >
                    <Unlink2 aria-hidden="true" />
                    Unlink
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="content-relation-create" aria-label="Add content reference">
        <div className="content-settings-control">
          <span>Target type</span>
          <Select
            aria-label="Relation target type"
            value={targetKind}
            disabled={Boolean(busyKey)}
            onChange={(event) => onTargetKindChange(event.target.value as RelationTargetKind)}
          >
            <option value="blog">Blog</option>
            <option value="project">Project</option>
          </Select>
        </div>
        <div className="content-settings-control content-relation-resource-control">
          <span>Resource</span>
          <Select
            aria-label="Relation target resource"
            value={targetSlug}
            disabled={Boolean(busyKey) || targetOptions.length === 0}
            onChange={(event) => onTargetSlugChange(event.target.value)}
          >
            <option value="">Select {targetKind === 'blog' ? 'a blog' : 'a project'}</option>
            {targetOptions.map((target) => (
              <option key={`${target.kind}:${target.slug}`} value={target.slug}>
                {target.title} — {contentStateSummary(target.visibility)}
              </option>
            ))}
          </Select>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="content-relation-link"
          disabled={Boolean(busyKey) || !targetSlug || selectedAlreadyLinked}
          loading={busyKey === 'moment-link'}
          onClick={onLink}
        >
          <Link2 aria-hidden="true" />
          {selectedAlreadyLinked ? 'Already linked' : 'Link reference'}
        </Button>
      </div>
    </section>
  );
}
