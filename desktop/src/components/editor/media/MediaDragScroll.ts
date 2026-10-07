/** Owns one pointer-drag animation loop; no document mutation occurs here. */
export class MediaDragScroll {
  private frame = 0;
  private point = { x: 0, y: 0 };
  constructor(private readonly root: HTMLElement, private readonly refresh: (x: number, y: number) => void) {}
  update(x: number, y: number) {
    this.point = { x, y };
    if (!this.frame) this.frame = requestAnimationFrame(() => this.tick());
  }
  stop() { cancelAnimationFrame(this.frame); this.frame = 0; }
  private tick() {
    this.frame = 0;
    const { x, y } = this.point;
    let host: HTMLElement | null = this.root;
    while (host) {
      if (host.scrollHeight > host.clientHeight && /auto|scroll/.test(getComputedStyle(host).overflowY)) break;
      host = host.parentElement;
    }
    host ||= document.scrollingElement as HTMLElement;
    const bounds = host === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : host.getBoundingClientRect();
    const dy = y < bounds.top + 48 ? -Math.min(18, (bounds.top + 48 - y) / 3) : y > bounds.bottom - 48 ? Math.min(18, (y - bounds.bottom + 48) / 3) : 0;
    if (dy) { host.scrollTop += dy; this.refresh(x, y); }
    this.frame = requestAnimationFrame(() => this.tick());
  }
}
