/**
 * Section commit rules shared by the dock button and the commit preview.
 * The Commit button never disappears: it is disabled with a reason when
 * nothing can be committed, and enabled actions open the preview instead of
 * committing directly.
 */

export type SectionCommitAvailability = {
  enabled: boolean;
  reason: string | null;
};

export const defaultSectionCommitMessage = (scope: string) => `release: ${scope} updates`;

export function sectionCommitAvailability({
  label,
  changeCount,
  unsavedCount,
  message,
}: {
  label: string;
  /** Uncommitted files in the section; null while unknown. */
  changeCount: number | null;
  unsavedCount: number;
  /** The commit message; omitted by entry points that only open the preview. */
  message?: string;
}): SectionCommitAvailability {
  if (changeCount === null) {
    return { enabled: false, reason: `Checking ${label} for uncommitted changes…` };
  }
  if (changeCount === 0) {
    return { enabled: false, reason: `No uncommitted ${label} changes to commit` };
  }
  if (unsavedCount > 0) {
    return {
      enabled: false,
      reason: `Save ${unsavedCount} open Markdown edit${unsavedCount === 1 ? '' : 's'} before committing`,
    };
  }
  if (message !== undefined && !message.trim()) {
    return { enabled: false, reason: 'Write a commit message' };
  }
  return { enabled: true, reason: null };
}
