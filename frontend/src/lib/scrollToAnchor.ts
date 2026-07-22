const selectorLike = (target: string): boolean =>
  target.startsWith('#') ||
  target.startsWith('.') ||
  target.startsWith('[') ||
  target.includes(' ');

const resolveAnchor = (target: string | HTMLElement): HTMLElement | null => {
  if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) return target;
  if (typeof target !== 'string') return null;
  if (selectorLike(target)) return document.querySelector<HTMLElement>(target);
  return document.getElementById(target);
};

export const scrollToAnchor = (target: string | HTMLElement, offset = 24) => {
  const el = resolveAnchor(target);
  if (!el) return;
  const scrollRoot = document.querySelector('#browser-window') as HTMLElement | null;
  if (scrollRoot) {
    const top =
      el.getBoundingClientRect().top -
      scrollRoot.getBoundingClientRect().top +
      scrollRoot.scrollTop -
      offset;
    scrollRoot.scrollTo({ top, behavior: 'smooth' });
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};
