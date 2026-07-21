// Shared guest-identity storage for comments/likes made without an account.
// Read by CompactComments and LoginPromptModal so a guest who picks a name
// once is never asked again anywhere on the site.
export interface StoredCommenter {
  authorName: string;
  authorEmail: string;
}

const COMMENTER_KEY = 'article-commenter-v1';

export const readCommenter = (): StoredCommenter => {
  try {
    const stored = JSON.parse(localStorage.getItem(COMMENTER_KEY) ?? '{}');
    return {
      authorName: typeof stored.authorName === 'string' ? stored.authorName : '',
      authorEmail: typeof stored.authorEmail === 'string' ? stored.authorEmail : '',
    };
  } catch {
    return { authorName: '', authorEmail: '' };
  }
};

export const persistCommenter = (commenter: StoredCommenter) => {
  try {
    localStorage.setItem(COMMENTER_KEY, JSON.stringify(commenter));
  } catch {
    // A blocked storage API must not prevent commenting.
  }
};

export const hasStoredCommenter = (commenter: StoredCommenter): boolean =>
  Boolean(commenter.authorName && commenter.authorEmail);
