import React from 'react';
import type { MediaWorkspacePort } from './MediaWorkspace';
const direct = /^(?:https?:|silan:|asset:|data:|blob:)/i;
class MediaResolutionSession {
  private readonly cache = new Map<string, Promise<string>>();
  private pending = new Map<string, (value: string) => void>();
  constructor(readonly workspace: MediaWorkspacePort, private readonly sourcePath: string) {}
  resolve(target: string): Promise<string> {
    if (direct.test(target)) return Promise.resolve(target);
    const cached = this.cache.get(target); if (cached) return cached;
    const promise = new Promise<string>((resolve) => {
      this.pending.set(target, resolve);
      if (this.pending.size === 1) queueMicrotask(() => void this.flush());
    });
    this.cache.set(target, promise); return promise;
  }
  private async flush() {
    const pending = this.pending; this.pending = new Map();
    const targets = [...pending.keys()];
    try {
      const resolved = await this.workspace.resolveMedia(this.sourcePath, targets);
      targets.forEach((target, index) => pending.get(target)!(resolved[index] || target));
    } catch { targets.forEach(target => pending.get(target)!(target)); }
  }
}
const Context = React.createContext<MediaResolutionSession | null>(null);
export function MediaEnvironmentProvider({ workspace, sourcePath, children }: { workspace?: MediaWorkspacePort; sourcePath?: string; children: React.ReactNode }) {
  const parent = React.useContext(Context);
  const session = React.useMemo(() => workspace && sourcePath ? new MediaResolutionSession(workspace, sourcePath) : parent, [workspace, sourcePath, parent]);
  return <Context.Provider value={session}>{children}</Context.Provider>;
}
export function useMediaWorkspace() { return React.useContext(Context)?.workspace; }
export function useResolvedMedia(target: string) {
  const session = React.useContext(Context);
  const [resolved, setResolved] = React.useState<{ target: string; url: string } | null>(null);
  React.useEffect(() => {
    let disposed = false;
    if (session) void session.resolve(target).then(url => { if (!disposed) setResolved({ target, url }); });
    return () => { disposed = true; };
  }, [target, session]);
  return resolved?.target === target ? resolved.url : target;
}
export function ResolvedMediaImage({ src = '', ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const resolved = useResolvedMedia(src);
  return <img {...props} src={resolved} />;
}
export function ResolvedMediaVideo({ src = '', ...props }: React.VideoHTMLAttributes<HTMLVideoElement>) {
  const resolved = useResolvedMedia(src);
  return <video {...props} src={resolved} />;
}
