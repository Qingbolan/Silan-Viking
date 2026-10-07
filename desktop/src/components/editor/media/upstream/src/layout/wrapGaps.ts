import type { WrapSide } from "../format/v2.ts";

/**
 * Keeps CodeMirror's height map true around wrapped layouts in live preview (docs/DESIGN.md,
 * section 4). The plans are made from measurements, so they are pure and tested without a DOM.
 *
 * CodeMirror adds up the heights of the editor's top-level elements to know where each one is. A
 * wrapped layout's widget is a zero-height anchor that the layout floats out of, and the lines
 * beside the float have their own, measured heights, so the sum stays right. An element that cannot
 * sit beside the float, though (a widget too wide for the room left, or one that clears floats), is
 * pushed below it, and that push belongs to no element: everything after it would be placed too
 * high, and clicks and arrow keys would land on the wrong line. A spacer in front of such an element,
 * as high as the push, turns the push into a height CodeMirror measures.
 */

/** One top-level element of the editor's content, in document order, in document pixels. */
export interface FlowBox {
  /** Document position of the element. */
  pos: number;
  /** Where the element is drawn. */
  top: number;
  height: number;
  /** Where CodeMirror's height map puts it. */
  mapTop: number;
  /** A spacer planned earlier. */
  spacer: boolean;
  /** Bottom edge of the margin boxes of the floats inside the element, if any. */
  floatBottom: number | null;
  /**
   * The host of stand-ins: no height of its own, and at the position of the line after it. Only its
   * floats count; as an element it would make that line look like a second child of one widget.
   */
  standIn?: boolean;
}

export interface Gap {
  /** Document position of the element the spacer goes in front of. */
  pos: number;
  height: number;
}

const TOLERANCE = 1;

/**
 * The spacers the measured elements need. An element pushed below a float gets one as high as the
 * push. An existing spacer grows when its element is pushed further, shrinks when the float no
 * longer reaches as far, and goes once the float ends above it. Spacers are only ever made for
 * elements next to a float; anything else that moves the height map is CodeMirror's business.
 */
export function planGaps(boxes: readonly FlowBox[]): Gap[] {
  const gaps: Gap[] = [];
  let floatBottom = Number.NEGATIVE_INFINITY;
  // Height this plan adds that the height map does not have yet.
  let pending = 0;
  let spacer: FlowBox | null = null;
  let lastContentPos: number | null = null;

  for (const box of boxes) {
    if (box.standIn) {
      if (box.floatBottom !== null) {
        floatBottom = Math.max(floatBottom, box.floatBottom);
      }
      continue;
    }
    if (box.spacer) {
      if (spacer && spacer.pos === box.pos) {
        // Several block widgets can share a document position. Treat their old spacers as one
        // physical gap; otherwise the first one's height is counted again on every measurement.
        spacer = { pos: spacer.pos, top: spacer.top, height: box.top + box.height - spacer.top,
          mapTop: spacer.mapTop, spacer: true, floatBottom: null };
      } else {
        if (spacer) {
          gaps.push({ pos: spacer.pos, height: Math.round(spacer.height) });
        }
        spacer = box;
      }
      continue;
    }

    if (box.pos === lastContentPos) {
      // CodeMirror maps separate DOM children of a block widget to the same position and gives
      // each the same mapTop. The later child's offset includes the earlier child's height, so it
      // cannot be interpreted as a new gap in the document height map.
      if (spacer) {
        pending -= spacer.height;
        spacer = null;
      }
    } else if (spacer) {
      const pushed = box.top - (spacer.top + spacer.height);
      let height = spacer.height;
      if (pushed > TOLERANCE) {
        height += pushed;
      } else if (floatBottom < spacer.top + spacer.height - TOLERANCE) {
        height = Math.max(0, floatBottom - spacer.top);
      }
      pending += height - spacer.height;
      if (height > TOLERANCE) {
        gaps.push({ pos: box.pos, height: Math.round(height) });
      }
      spacer = null;
    } else {
      const expected = box.mapTop + pending;
      const drift = box.top - expected;
      if (drift > TOLERANCE && expected < floatBottom) {
        gaps.push({ pos: box.pos, height: Math.round(drift) });
        pending += drift;
      }
    }
    lastContentPos = box.pos;

    if (box.floatBottom !== null) {
      floatBottom = Math.max(floatBottom, box.floatBottom);
    }
  }

  // A spacer at the end of what was measured keeps its height until its element is measured too.
  if (spacer) {
    gaps.push({ pos: spacer.pos, height: Math.round(spacer.height) });
  }
  return gaps;
}

/**
 * The elements to plan spacers for, out of the runs CodeMirror draws apart from each other around
 * what it has not drawn: the run holding `viewportFrom`. CodeMirror also draws the cursor's line on
 * its own, far from the viewport; planned together, the spacers of every line between them, not
 * drawn and not measured, went (measured: a 98px spacer, and the note moved by as much). Floats drawn
 * in the runs before still reach into this one and count, carried by a host of no height.
 */
export function viewportRun(runs: ReadonlyArray<readonly FlowBox[]>, viewportFrom: number): FlowBox[] {
  const index = runs.findIndex((run) => run.some((box) => !box.standIn && box.pos >= viewportFrom));
  const run = runs[index];
  if (!run) {
    return [];
  }
  let carried: number | null = null;
  for (const before of runs.slice(0, index)) {
    for (const box of before) {
      if (box.floatBottom !== null) {
        carried = carried === null ? box.floatBottom : Math.max(carried, box.floatBottom);
      }
    }
  }
  return carried === null ? [...run] : [{ pos: 0, top: 0, height: 0, mapTop: 0, spacer: false, floatBottom: carried, standIn: true }, ...run];
}

/** A wrapped layout's float, measured from the top of its anchor, in pixels. */
export interface FloatSize {
  side: WrapSide;
  /** From the anchor's top to the layout's top edge (its border box). */
  layoutTop: number;
  layoutHeight: number;
  /** Width of the layout's border box. */
  width: number;
  /** Margin between the layout and the text. */
  margin: number;
  marginBottom: number;
  /** Margin above the layout's border box: its float starts that much higher. */
  marginTop?: number;
  /**
   * The line the layout starts beside (its document position), and how far below that line's top
   * it starts. A stand-in follows that line rather than its anchor: the lines between may change
   * height undrawn, and the text beside it would then move against it. CodeMirror draws the
   * cursor's line on its own without the viewport's decorations: a heading so drawn is 18px
   * lower, and the lines beside the float took other breaks, moving the note by up to 160px.
   */
  refPos?: number;
  refOffset?: number;
}

/** A layout's float as last measured, with where it was. */
export interface PlacedFloat {
  /** Document position of its anchor. */
  from: number;
  /** The skip it was drawn with. */
  skip: number;
  size: FloatSize;
}

/**
 * The float of a revision of a layout that nothing has measured yet (an edit made in its stand-in),
 * from the last one measured; null once its anchor has moved. The skip moves it by whole lines, the
 * way it is drawn and set by dragging (`lineHeight` each); its side leaves where it starts as it was.
 * Its width and height are measured on the stand-in.
 */
export function carryFloat(placed: PlacedFloat, from: number, side: WrapSide, skip: number, lineHeight: number): FloatSize | null {
  if (placed.from !== from) {
    return null;
  }
  const layoutTop = Math.max(0, placed.size.layoutTop + (skip - placed.skip) * lineHeight);
  const { refOffset } = placed.size;
  return { ...placed.size, side, layoutTop, ...(refOffset === undefined ? {} : { refOffset: refOffset + layoutTop - placed.size.layoutTop }) };
}

/**
 * A layout's float as last measured, moved with the note's text: where its anchor is and the line
 * it starts beside. Text typed above the anchor moves both; left where it was, an edit made later
 * in the stand-in found no earlier revision at its anchor and the stand-in went.
 */
export function mapPlaced(placed: PlacedFloat, mapPos: (pos: number) => number): PlacedFloat {
  return { ...placed, from: mapPos(placed.from), size: mapFloat(placed.size, mapPos) };
}

export function mapFloat(size: FloatSize, mapPos: (pos: number) => number): FloatSize {
  return size.refPos === undefined ? size : { ...size, refPos: mapPos(size.refPos) };
}

/**
 * Where the anchor of a stand-in's layout is taken to be: from the line it starts beside, now at
 * `refTop`, when it was measured with one, so that it keeps its place beside that line; else
 * `anchorTop`.
 */
export function standInAnchorTop(size: FloatSize, anchorTop: number, refTop: number | null): number {
  return refTop !== null && size.refOffset !== undefined ? refTop + size.refOffset - size.layoutTop : anchorTop;
}

export interface ProxyPlan {
  /** Height of an empty, zero-width float above the stand-in, when the layout starts below the line. */
  sandbag: number;
  /** Height of the stand-in, bottom margin included. */
  height: number;
  /** How much of the layout lies above the stand-in's top and is cut off. */
  shift: number;
}

/**
 * A stand-in for a float whose anchor lies above the part of the note CodeMirror has drawn, placed
 * in front of the first line drawn, which starts at `lineTop`: the part of the float at or below that line,
 * or null when the float ends above it. Without it, the lines beside the float lose their wrap until
 * the anchor is drawn, then jump. With it, the lines sit where they would beside the real float.
 */
/** A stand-in in live preview: the layout itself, with the top margin it is drawn with. */
export interface LiveProxyPlan extends ProxyPlan {
  /** The layout's own top margin, or less to pull it up over the line it starts above. */
  marginTop: number;
}

/**
 * A stand-in drawn as the layout itself, keeping its top margin: its float, which the lines beside
 * it go around, starts where the real one does, not `marginTop` lower. A list item or a quote laid out
 * on its own beside it narrows as soon as it overlaps the float by a pixel, so a few pixels decide
 * whether it takes one line or several (measured: 4px moved the note by 96px). The sandbag holds the
 * lines above the margin; a layout whose margin starts above the line goes up by less margin.
 */
export function liveProxy(plan: ProxyPlan, marginTop: number): LiveProxyPlan {
  if (plan.shift > 0) {
    return { ...plan, marginTop: -plan.shift };
  }
  return plan.sandbag >= marginTop ? { ...plan, sandbag: plan.sandbag - marginTop, marginTop } : { ...plan, sandbag: 0, marginTop: plan.sandbag };
}

/**
 * The stand-ins in front of one line, in the order they are drawn. CSS places no float above one
 * drawn before it, so a sandbag starts where the stand-ins before it do, not at the line: each
 * sandbag is only what is left below them, as the skips of floats sharing an anchor are. Without
 * it a stand-in after a lower one was pushed down by that one's whole height (measured: 412px).
 * `floor` is where floats drawn before the line already start, below it: a layout drawn apart above
 * the line (CodeMirror always draws the cursor's line) comes before every stand-in.
 */
export function stackProxies<Plan extends ProxyPlan>(plans: readonly Plan[], floor = 0): Plan[] {
  return plans.map((plan) => {
    if (plan.shift > 0) {
      return plan;
    }
    const sandbag = Math.max(0, plan.sandbag - floor);
    floor = Math.max(floor, plan.sandbag);
    return { ...plan, sandbag };
  });
}

export function planProxy(anchorTop: number, size: FloatSize, lineTop: number): ProxyPlan | null {
  const layoutTop = anchorTop + size.layoutTop;
  const bottom = layoutTop + size.layoutHeight + size.marginBottom;
  if (bottom <= lineTop + TOLERANCE) {
    return null;
  }
  const visibleTop = Math.max(layoutTop, lineTop);
  return { sandbag: Math.max(0, layoutTop - lineTop), height: bottom - visibleTop, shift: visibleTop - layoutTop };
}
