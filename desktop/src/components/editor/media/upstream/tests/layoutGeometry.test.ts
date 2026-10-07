import test from "node:test";
import assert from "node:assert/strict";

import { dropTarget, frameResizeDirection, resizePair, weightsFromWidths, type ItemBox, type Rect, type RowBox } from "../src/layout/geometry.ts";
import { findV2Blocks } from "../src/format/v2.ts";
import { modelFromBlock } from "../src/layout/model.ts";

test("frame resizing follows the moving edge for block alignment, floats and text columns", () => {
  const block = findV2Blocks(["<!-- vml -->", "Text", "<!-- /vml -->"])[0];
  assert.ok(block);
  const model = modelFromBlock(block);
  assert.equal(frameResizeDirection(model), 1);
  assert.equal(frameResizeDirection({ ...model, align: "right" }), -1);
  assert.equal(frameResizeDirection({ ...model, align: "center" }), 2);
  assert.equal(frameResizeDirection({ ...model, align: "center", wrap: "left" }), 1);
  assert.equal(frameResizeDirection({ ...model, align: "center", wrap: "right" }), -1);
  const columns = findV2Blocks(["<!-- vml -->", "Left", "![[a.png]]", "Right", "<!-- /vml -->"])[0];
  assert.ok(columns);
  const two = modelFromBlock(columns);
  assert.equal(frameResizeDirection(two), 2);
  assert.equal(frameResizeDirection({ ...two, text: { left: "Left", right: null } }), -1);
  assert.equal(frameResizeDirection({ ...two, text: { left: null, right: "Right" } }), 1);
});

function rect(left: number, top: number, right: number, bottom: number): Rect {
  return { left, top, right, bottom };
}

// Row 0 holds two items with a 10px gap; row 1 holds one wide item, 10px below.
const rows: RowBox[] = [{ row: 0, rect: rect(0, 0, 300, 100) }, { row: 1, rect: rect(0, 110, 300, 210) }];
const items: ItemBox[] = [
  { row: 0, index: 0, rect: rect(0, 0, 145, 100) },
  { row: 0, index: 1, rect: rect(155, 0, 300, 100) },
  { row: 1, index: 0, rect: rect(0, 110, 300, 210) },
];

test("dropping on an item goes before or after it by the horizontal midpoint", () => {
  assert.deepEqual(dropTarget(40, 50, rows, items), { kind: "beside", position: { row: 0, index: 0 }, side: "before" });
  assert.deepEqual(dropTarget(120, 50, rows, items), { kind: "beside", position: { row: 0, index: 0 }, side: "after" });
});

test("the top and bottom bands of an item open a new row", () => {
  assert.deepEqual(dropTarget(200, 5, rows, items), { kind: "newRow", beforeRow: 0 });
  assert.deepEqual(dropTarget(200, 95, rows, items), { kind: "newRow", beforeRow: 1 });
  assert.deepEqual(dropTarget(100, 205, rows, items), { kind: "newRow", beforeRow: 2 });
});

test("gaps inside a row snap to the nearest item; gaps between rows open a new row", () => {
  assert.deepEqual(dropTarget(150, 50, rows, items), { kind: "beside", position: { row: 0, index: 0 }, side: "after" });
  assert.deepEqual(dropTarget(150, 105, rows, items), { kind: "newRow", beforeRow: 1 });
});

test("just above or below the layout opens a new row at that end; farther away is no target", () => {
  assert.deepEqual(dropTarget(150, -20, rows, items), { kind: "newRow", beforeRow: 0 });
  assert.deepEqual(dropTarget(150, 240, rows, items), { kind: "newRow", beforeRow: 2 });
  assert.equal(dropTarget(150, 400, rows, items), null);
  assert.equal(dropTarget(400, 50, rows, items), null);
  assert.equal(dropTarget(10, 10, [], []), null);
});

test("weights from widths average 1", () => {
  assert.deepEqual(weightsFromWidths([100, 300]), [0.5, 1.5]);
  assert.deepEqual(weightsFromWidths([120, 120, 120]), [1, 1, 1]);
});

test("resizing a column pair keeps the total and a minimum width", () => {
  assert.deepEqual(resizePair([100, 200, 50], 0, 50, 60), [150, 150, 50]);
  assert.deepEqual(resizePair([100, 200], 0, 500, 60), [240, 60]);
  assert.deepEqual(resizePair([100, 200], 0, -500, 60), [60, 240]);
  assert.deepEqual(resizePair([40, 40], 0, 30, 60), [40, 40]);
  assert.deepEqual(resizePair([100, 200], 1, 10, 60), [100, 200]);
});
