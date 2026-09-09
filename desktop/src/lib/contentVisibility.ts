export type DocumentStateInput = { visibility: string; pinned?: boolean };
export type VisibilityActionId = 'make-public' | 'make-private';
export type VisibilityActionGroup = 'visibility';
export type VisibilityAction = {
  id: VisibilityActionId;
  group: VisibilityActionGroup;
  label: string;
  description: string;
  tone: 'primary' | 'secondary';
  nextState: DocumentStateInput;
};
export type VisibilityView = {
  visibility: string;
  visibilityLabel: string;
  actions: VisibilityAction[];
};
export type SeriesVisibilityAction = VisibilityAction;
export type SeriesVisibilityView = VisibilityView;

const visibilityActions = (visibility: string): VisibilityAction[] =>
  (['public', 'private'] as const).filter(value => value !== visibility).map(value => ({
    id: value === 'public' ? 'make-public' : 'make-private',
    group: 'visibility',
    label: value === 'public' ? 'Make public' : 'Make private',
    description: value === 'public' ? 'Include in the next website deployment.' : 'Keep this content private.',
    tone: value === 'public' ? 'primary' : 'secondary',
    nextState: { visibility: value },
  }));

export const contentVisibilityFor = (visibility: string): VisibilityView => ({
  visibility,
  visibilityLabel: visibility === 'public' ? 'Public' : 'Private',
  actions: visibilityActions(visibility),
});
export const contentStateSummary = (visibility: string) => contentVisibilityFor(visibility).visibilityLabel;
export const hasDocumentStateChanges = (current: DocumentStateInput, next: DocumentStateInput) =>
  current.visibility !== next.visibility || (next.pinned != null && Boolean(current.pinned) !== next.pinned);
export const seriesVisibilityFor = (episodes: Array<{ visibility: string }>): SeriesVisibilityView => {
  const visibility = episodes.length && episodes.every(e => e.visibility === 'public') ? 'public'
    : episodes.every(e => e.visibility === 'private') ? 'private' : 'mixed';
  return { visibility, visibilityLabel: visibility === 'mixed' ? 'Mixed visibility' : contentStateSummary(visibility), actions: visibilityActions(visibility) };
};
