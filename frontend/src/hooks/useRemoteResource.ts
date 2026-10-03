import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/utils';

export type RemoteResourceStatus = 'loading' | 'ready' | 'not-found' | 'error';

export interface RemoteResource<T> {
  data: T | null;
  error: unknown;
  status: RemoteResourceStatus;
  reload: () => void;
}

/**
 * Canonical lifecycle for one route-backed API resource.
 *
 * A detail page must distinguish a missing public object from a temporary
 * transport failure. Keeping that state machine here prevents each route
 * from collapsing both cases into the same “not found” panel.
 */
export const useRemoteResource = <T>(
  resourceKey: string | undefined,
  load: () => Promise<T | null>,
  keepPreviousData = false,
): RemoteResource<T> => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState<RemoteResourceStatus>('loading');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    if (!resourceKey) {
      setData(null);
      setError(null);
      setStatus('not-found');
      return () => {
        active = false;
      };
    }

    if (!keepPreviousData) setData(null);
    setError(null);
    setStatus('loading');

    void load()
      .then((value) => {
        if (!active) return;
        if (value === null) {
          setData(null);
          setStatus('not-found');
          return;
        }
        setData(value);
        setStatus('ready');
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setData(null);
        setError(cause);
        setStatus(cause instanceof ApiError && cause.status === 404 ? 'not-found' : 'error');
      });

    return () => {
      active = false;
    };
  }, [keepPreviousData, load, reloadToken, resourceKey]);

  const reload = useCallback(() => setReloadToken((value) => value + 1), []);

  return { data, error, status, reload };
};
