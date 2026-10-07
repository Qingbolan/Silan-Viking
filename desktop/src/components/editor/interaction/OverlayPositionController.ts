export type OverlayPlacement = 'above' | 'below' | 'inside';

export type OverlayPosition = {
  left: number;
  placement: OverlayPlacement;
  top: number;
  visible: boolean;
};

export type OverlayPositionOptions = {
  edge?: number;
  gap?: number;
  minTop?: number | (() => number);
  strategy?: 'outside' | 'inside-top';
};

type OverlayLifecycle = 'idle' | 'measuring' | 'anchored' | 'disposed';

export function calculateOverlayPosition(
  container: DOMRect,
  anchor: DOMRect,
  overlay: { width: number; height: number },
  options: OverlayPositionOptions = {},
): OverlayPosition {
  const edge = options.edge ?? 8;
  const gap = options.gap ?? 8;
  const configuredMinTop = typeof options.minTop === 'function'
    ? options.minTop()
    : options.minTop;
  const minTop = configuredMinTop ?? edge;
  const maximumLeft = Math.max(edge, container.width - overlay.width - edge);
  const left = Math.max(
    edge,
    Math.min(anchor.left - container.left + (anchor.width - overlay.width) / 2, maximumLeft),
  );
  const above = anchor.top - container.top - overlay.height - gap;
  const below = anchor.bottom - container.top + gap;
  const maximumTop = Math.max(minTop, container.height - overlay.height - edge);
  if (
    options.strategy === 'inside-top'
    && anchor.height >= overlay.height + gap * 2
  ) {
    return {
      left,
      placement: 'inside',
      top: Math.max(
        minTop,
        Math.min(anchor.top - container.top + gap, maximumTop),
      ),
      visible: overlay.width > 0 && overlay.height > 0,
    };
  }
  const placement: OverlayPlacement = above >= minTop ? 'above' : 'below';
  const preferredTop = placement === 'above' ? above : below;
  return {
    left,
    placement,
    top: Math.max(minTop, Math.min(preferredTop, maximumTop)),
    visible: overlay.width > 0 && overlay.height > 0,
  };
}

/**
 * Measures the main toolbar in the same coordinate system used by contextual
 * overlays. Hosts may move or resize the toolbar without forcing table,
 * image, and selection plugins to repeat a guessed pixel offset.
 */
export function readEditorToolbarInset(
  container: HTMLElement,
  includeToolbar: boolean,
  gap = 4,
  edge = 8,
) {
  if (!includeToolbar) return edge;
  const toolbar = container.parentElement?.querySelector<HTMLElement>('.novel-toolbar');
  if (!toolbar || toolbar.dataset.placement === 'caret') return edge;
  const containerBounds = container.getBoundingClientRect();
  const toolbarBounds = toolbar.getBoundingClientRect();
  return Math.max(edge, toolbarBounds.bottom - containerBounds.top + gap);
}

/**
 * Owns one overlay's measurement lifecycle. All editor overlays use the same
 * scroll container coordinate system and are hidden until the first real
 * measurement, preventing the visible top-left flash from guessed dimensions.
 */
export class OverlayPositionController {
  readonly #container: HTMLElement;
  readonly #overlay: HTMLElement;
  readonly #readAnchor: () => DOMRect | null;
  readonly #options: OverlayPositionOptions;
  readonly #onPosition: (position: OverlayPosition) => void;
  readonly #observedElements: readonly HTMLElement[];
  #lifecycle: OverlayLifecycle = 'idle';
  #frame = 0;
  #observer: ResizeObserver | null = null;

  constructor({
    container,
    overlay,
    readAnchor,
    options,
    observedElements,
    onPosition,
  }: {
    container: HTMLElement;
    overlay: HTMLElement;
    readAnchor: () => DOMRect | null;
    options?: OverlayPositionOptions;
    observedElements?: readonly HTMLElement[];
    onPosition: (position: OverlayPosition) => void;
  }) {
    this.#container = container;
    this.#overlay = overlay;
    this.#readAnchor = readAnchor;
    this.#options = options || {};
    this.#observedElements = observedElements || [];
    this.#onPosition = onPosition;
  }

  connect() {
    if (this.#lifecycle !== 'idle') return;
    this.#lifecycle = 'measuring';
    this.#container.addEventListener('scroll', this.schedule, true);
    window.addEventListener('resize', this.schedule);
    this.#observer = new ResizeObserver(this.schedule);
    this.#observer.observe(this.#container);
    this.#observer.observe(this.#overlay);
    this.#observedElements.forEach((element) => this.#observer?.observe(element));
    this.schedule();
  }

  schedule = () => {
    if (this.#lifecycle === 'disposed' || this.#frame) return;
    this.#frame = window.requestAnimationFrame(() => {
      this.#frame = 0;
      const anchor = this.#readAnchor();
      if (!anchor || !anchor.width && !anchor.height) {
        this.#onPosition({ left: 0, placement: 'above', top: 0, visible: false });
        return;
      }
      this.#lifecycle = 'anchored';
      this.#onPosition(calculateOverlayPosition(
        this.#container.getBoundingClientRect(),
        anchor,
        {
          height: this.#overlay.offsetHeight,
          width: this.#overlay.offsetWidth,
        },
        this.#options,
      ));
    });
  };

  dispose() {
    if (this.#lifecycle === 'disposed') return;
    this.#lifecycle = 'disposed';
    this.#container.removeEventListener('scroll', this.schedule, true);
    window.removeEventListener('resize', this.schedule);
    this.#observer?.disconnect();
    this.#observer = null;
    if (this.#frame) window.cancelAnimationFrame(this.#frame);
    this.#frame = 0;
  }
}
