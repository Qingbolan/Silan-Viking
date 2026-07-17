import type { ContentKind } from '../types';

export type DocumentStateInput = {
  status: string;
  visibility: string;
  pinned?: boolean;
};

export type LifecycleActionId =
  | 'publish'
  | 'unpublish'
  | 'archive'
  | 'restore'
  | 'show'
  | 'hide'
  | 'activate'
  | 'pause'
  | 'complete'
  | 'cancel'
  | 'hypothesis'
  | 'experiment'
  | 'validate'
  | 'conclude';

export type LifecycleAction = {
  id: LifecycleActionId;
  label: string;
  description: string;
  tone: 'primary' | 'secondary' | 'danger';
  nextState: DocumentStateInput;
};

export type LifecycleView = {
  status: string;
  visibility: string;
  statusLabel: string;
  visibilityLabel: string;
  actions: LifecycleAction[];
};

export type SeriesLifecycleActionId = 'publish-all' | 'unpublish-all' | 'archive-all';

export type SeriesLifecycleAction = {
  id: SeriesLifecycleActionId;
  label: string;
  description: string;
  tone: 'primary' | 'secondary' | 'danger';
  nextState: DocumentStateInput;
};

export type SeriesLifecycleView = {
  status: 'published' | 'draft' | 'archived' | 'mixed';
  visibility: 'public' | 'private' | 'mixed';
  statusLabel: string;
  visibilityLabel: string;
  actions: SeriesLifecycleAction[];
};

const titleCase = (value: string) => (
  value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
);

const normalize = (value: string | null | undefined, fallback: string) => (
  value?.trim().toLowerCase() || fallback
);

const proseLifecycle = (status: string, visibility: string): LifecycleView => {
  const actions: LifecycleAction[] = [];

  if (status === 'archived') {
    actions.push(
      {
        id: 'restore',
        label: 'Restore draft',
        description: 'Move this content back to draft without making it public.',
        tone: 'secondary',
        nextState: { status: 'draft', visibility: 'private' },
      },
      {
        id: 'publish',
        label: 'Publish',
        description: 'Publish this content and make it public.',
        tone: 'primary',
        nextState: { status: 'published', visibility: 'public' },
      },
    );
  } else if (status === 'published') {
    actions.push(
      {
        id: 'unpublish',
        label: 'Unpublish',
        description: 'Take this content offline and return it to draft.',
        tone: 'secondary',
        nextState: { status: 'draft', visibility: 'private' },
      },
      {
        id: 'archive',
        label: 'Archive',
        description: 'Remove this content from publication while keeping the record.',
        tone: 'secondary',
        nextState: { status: 'archived', visibility: 'private' },
      },
    );
  } else {
    actions.push(
      {
        id: 'publish',
        label: visibility === 'public' ? 'Republish' : 'Publish',
        description: 'Publish this content and make it public.',
        tone: 'primary',
        nextState: { status: 'published', visibility: 'public' },
      },
      {
        id: 'archive',
        label: 'Archive',
        description: 'Archive this draft without publishing it.',
        tone: 'secondary',
        nextState: { status: 'archived', visibility: 'private' },
      },
    );
  }

  return {
    status,
    visibility,
    statusLabel: titleCase(status),
    visibilityLabel: titleCase(visibility),
    actions,
  };
};

const projectLifecycle = (status: string, visibility: string): LifecycleView => {
  const actions: LifecycleAction[] = [];
  const keepVisibility = visibility || 'private';

  if (status === 'paused') {
    actions.push(
      {
        id: 'activate',
        label: 'Resume',
        description: 'Resume active work on this project.',
        tone: 'primary',
        nextState: { status: 'active', visibility: keepVisibility },
      },
      {
        id: 'cancel',
        label: 'Cancel',
        description: 'Stop this project and remove it from public surfaces.',
        tone: 'danger',
        nextState: { status: 'cancelled', visibility: 'private' },
      },
    );
  } else if (status === 'completed') {
    actions.push({
      id: 'activate',
      label: 'Reopen',
      description: 'Move this completed project back to active work.',
      tone: 'secondary',
      nextState: { status: 'active', visibility: keepVisibility },
    });
  } else if (status === 'cancelled') {
    actions.push({
      id: 'activate',
      label: 'Reopen',
      description: 'Restart this cancelled project privately.',
      tone: 'secondary',
      nextState: { status: 'active', visibility: 'private' },
    });
  } else {
    actions.push(
      {
        id: 'pause',
        label: 'Pause',
        description: 'Pause active work without removing project history.',
        tone: 'secondary',
        nextState: { status: 'paused', visibility: keepVisibility },
      },
      {
        id: 'complete',
        label: 'Complete',
        description: 'Mark this project as completed.',
        tone: 'primary',
        nextState: { status: 'completed', visibility: keepVisibility },
      },
      {
        id: 'cancel',
        label: 'Cancel',
        description: 'Stop this project and remove it from public surfaces.',
        tone: 'danger',
        nextState: { status: 'cancelled', visibility: 'private' },
      },
    );
  }

  if (status !== 'cancelled') {
    actions.push(visibility === 'public'
      ? {
          id: 'hide',
          label: 'Hide',
          description: 'Keep the project state but remove it from public surfaces.',
          tone: 'secondary',
          nextState: { status, visibility: 'private' },
        }
      : {
          id: 'show',
          label: 'Show',
          description: 'Keep the project state and show it on the public website after the next deploy.',
          tone: 'secondary',
          nextState: { status, visibility: 'public' },
        });
  }

  return {
    status,
    visibility,
    statusLabel: titleCase(status),
    visibilityLabel: titleCase(visibility),
    actions,
  };
};

const ideaLifecycle = (status: string, visibility: string): LifecycleView => {
  const actions: LifecycleAction[] = [];

  if (status === 'published') {
    actions.push(
      {
        id: 'unpublish',
        label: 'Unpublish',
        description: 'Take the idea offline and continue validation privately.',
        tone: 'secondary',
        nextState: { status: 'validating', visibility: 'private' },
      },
      {
        id: 'conclude',
        label: 'Conclude',
        description: 'Close this idea as a concluded research thread.',
        tone: 'secondary',
        nextState: { status: 'concluded', visibility: 'private' },
      },
    );
  } else if (status === 'concluded') {
    actions.push({
      id: 'validate',
      label: 'Reopen',
      description: 'Reopen this idea for validation.',
      tone: 'secondary',
      nextState: { status: 'validating', visibility: 'private' },
    });
  } else if (status === 'validating') {
    actions.push(
      {
        id: 'publish',
        label: 'Publish',
        description: 'Publish the validated idea publicly.',
        tone: 'primary',
        nextState: { status: 'published', visibility: 'public' },
      },
      {
        id: 'conclude',
        label: 'Conclude',
        description: 'Close this idea as a concluded research thread.',
        tone: 'secondary',
        nextState: { status: 'concluded', visibility: 'private' },
      },
    );
  } else if (status === 'experimenting') {
    actions.push(
      {
        id: 'validate',
        label: 'Validate',
        description: 'Move this idea from experiment to validation.',
        tone: 'primary',
        nextState: { status: 'validating', visibility: 'private' },
      },
      {
        id: 'conclude',
        label: 'Conclude',
        description: 'Close this idea as a concluded research thread.',
        tone: 'secondary',
        nextState: { status: 'concluded', visibility: 'private' },
      },
    );
  } else if (status === 'hypothesis') {
    actions.push(
      {
        id: 'experiment',
        label: 'Experiment',
        description: 'Start testing this hypothesis.',
        tone: 'primary',
        nextState: { status: 'experimenting', visibility: 'private' },
      },
      {
        id: 'publish',
        label: 'Publish',
        description: 'Publish this idea publicly.',
        tone: 'secondary',
        nextState: { status: 'published', visibility: 'public' },
      },
    );
  } else {
    actions.push(
      {
        id: 'hypothesis',
        label: 'Form hypothesis',
        description: 'Move this draft idea into a testable hypothesis.',
        tone: 'primary',
        nextState: { status: 'hypothesis', visibility: 'private' },
      },
      {
        id: 'publish',
        label: 'Publish',
        description: 'Publish this idea publicly.',
        tone: 'secondary',
        nextState: { status: 'published', visibility: 'public' },
      },
    );
  }

  return {
    status,
    visibility,
    statusLabel: titleCase(status),
    visibilityLabel: titleCase(visibility),
    actions,
  };
};

export const contentLifecycleFor = (
  kind: ContentKind,
  rawStatus: string | null | undefined,
  rawVisibility: string | null | undefined,
): LifecycleView => {
  const visibility = normalize(rawVisibility, 'private');

  if (kind === 'blog' || kind === 'episode') {
    return proseLifecycle(normalize(rawStatus, 'draft'), visibility);
  }
  if (kind === 'project') {
    return projectLifecycle(normalize(rawStatus, 'active'), visibility);
  }
  if (kind === 'idea') {
    return ideaLifecycle(normalize(rawStatus, 'draft'), visibility);
  }

  return {
    status: normalize(rawStatus, 'draft'),
    visibility,
    statusLabel: titleCase(normalize(rawStatus, 'draft')),
    visibilityLabel: titleCase(visibility),
    actions: [],
  };
};

export const contentStateSummary = (
  kind: ContentKind,
  status: string | null | undefined,
  visibility: string | null | undefined,
) => {
  const lifecycle = contentLifecycleFor(kind, status, visibility);
  return `${lifecycle.statusLabel} · ${lifecycle.visibilityLabel}`;
};

export const seriesLifecycleFor = (
  episodes: Array<{ status: string | null | undefined; visibility: string | null | undefined }>,
): SeriesLifecycleView => {
  const normalized = episodes.map((episode) => ({
    status: normalize(episode.status, 'draft'),
    visibility: normalize(episode.visibility, 'private'),
  }));
  const statusSet = new Set(normalized.map((episode) => episode.status));
  const visibilitySet = new Set(normalized.map((episode) => episode.visibility));
  const status = statusSet.size === 1
    ? normalized[0]?.status === 'published'
      ? 'published'
      : normalized[0]?.status === 'archived'
        ? 'archived'
        : 'draft'
    : 'mixed';
  const visibility = visibilitySet.size === 1
    ? normalized[0]?.visibility === 'public' ? 'public' : 'private'
    : 'mixed';
  const allPublicPublished = normalized.length > 0
    && normalized.every((episode) => episode.status === 'published' && episode.visibility === 'public');
  const allArchived = normalized.length > 0
    && normalized.every((episode) => episode.status === 'archived');
  const actions: SeriesLifecycleAction[] = allPublicPublished
    ? [
        {
          id: 'unpublish-all',
          label: 'Unpublish all',
          description: 'Take every episode in this series offline and return them to draft.',
          tone: 'secondary',
          nextState: { status: 'draft', visibility: 'private' },
        },
        {
          id: 'archive-all',
          label: 'Archive all',
          description: 'Archive every episode in this series.',
          tone: 'secondary',
          nextState: { status: 'archived', visibility: 'private' },
        },
      ]
    : [
        {
          id: 'publish-all',
          label: allArchived ? 'Publish all' : 'Publish all',
          description: 'Publish every episode in this series and make them public.',
          tone: 'primary',
          nextState: { status: 'published', visibility: 'public' },
        },
        {
          id: 'archive-all',
          label: 'Archive all',
          description: 'Archive every episode in this series.',
          tone: 'secondary',
          nextState: { status: 'archived', visibility: 'private' },
        },
      ];

  return {
    status,
    visibility,
    statusLabel: status === 'mixed' ? 'Mixed' : titleCase(status),
    visibilityLabel: visibility === 'mixed' ? 'Mixed visibility' : titleCase(visibility),
    actions,
  };
};
