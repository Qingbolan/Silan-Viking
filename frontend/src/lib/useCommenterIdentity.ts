import { useCallback, useEffect, useState } from 'react';
import {
  ensureCommenter,
  readCommenter,
  subscribeToCommenter,
  updateCommenterName,
} from './commenterIdentity';

export const useCommenterIdentity = () => {
  const [commenter, setCommenter] = useState(readCommenter);

  useEffect(() => {
    const unsubscribe = subscribeToCommenter(setCommenter);
    void ensureCommenter().then(setCommenter);
    return unsubscribe;
  }, []);

  const setAuthorName = useCallback((authorName: string) => {
    setCommenter(updateCommenterName(authorName));
  }, []);

  return { commenter, setAuthorName };
};
