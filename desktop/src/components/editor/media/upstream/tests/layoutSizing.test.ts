import test from "node:test";
import assert from "node:assert/strict";

import { findV2Blocks, serializeOpener } from "../src/format/v2.ts";
import { positionOffset } from "../src/layout/geometry.ts";
import {
  keepSingleSizes,
  metaFromModel,
  modelFromBlock,
  resetWeights,
  rowOffset,
  scaleRows,
  setAlign,
  setBlockWidth,
  setPosition,
  type LayoutModel,
} from "../src/layout/model.ts";

function model(lines: string[]): LayoutModel {
  const [block] = findV2Blocks(lines);
  assert.ok(block);
  return modelFromBlock(block);
}

// Row 0 holds two items 240px high; row 1 holds one item at 60% width, aligned left.
const sample = [
  '<!-- vml {"v":2,"rows":[{"height":240},{"width":0.6,"align":"left"}]} -->',
  "![[a.png]] ![[b.png]]",
  "![[c.png]]",
  "<!-- /vml -->",
];

test("a single item's position reads offset first, then align, and is centered by default", () => {
  const layout = model([
    '<!-- vml {"rows":[{"align":"right"},{"offset":0.25,"align":"left"},{},{"offset":2},{"offset":0.3}]} -->',
    "![[a.png]]",
    "![[b.png]]",
    "![[c.png]]",
    "![[d.png]]",
    "![[e.png]] ![[f.png]]",
    "<!-- /vml -->",
  ]);

  assert.deepEqual(layout.rows.slice(0, 4).map(rowOffset), [1, 0.25, 0.5, 0.5]);
  assert.equal(layout.rows[4]?.offset, null);
});

test("left, center and right are stored as align; any other position as offset", () => {
  const layout = model(sample);

  assert.deepEqual(metaFromModel(setPosition(layout, 1, 0.3)).rows[1], { width: 0.6, offset: 0.3 });
  assert.deepEqual(metaFromModel(setPosition(layout, 1, 1)).rows[1], { width: 0.6, align: "right" });
  assert.deepEqual(metaFromModel(setPosition(layout, 1, 0.5)).rows[1], { width: 0.6, align: "center" });
  assert.deepEqual(metaFromModel(setPosition(layout, 1, -2)).rows[1], { width: 0.6, align: "left" });
  assert.deepEqual(metaFromModel(setAlign(setPosition(layout, 1, 0.3), 1, "right")).rows[1], { width: 0.6, align: "right" });
  assert.equal(setPosition(layout, 0, 0.3), layout);
  assert.equal(setPosition(layout, 1, Number.NaN), layout);
});

test("the block width is read from the opening comment and not stored at full width", () => {
  const layout = model(['<!-- vml {"v":2,"width":0.5} -->', "![[a.png]]", "<!-- /vml -->"]);

  assert.equal(layout.width, 0.5);
  assert.equal(serializeOpener(metaFromModel(layout)), '<!-- vml {"v":2,"width":0.5} -->');
  assert.equal(setBlockWidth(layout, 0.05).width, 0.2);
  assert.equal(setBlockWidth(layout, 0.6666).width, 0.667);
  assert.equal(serializeOpener(metaFromModel(setBlockWidth(layout, 1.4))), "<!-- vml -->");
  assert.equal(setBlockWidth(layout, Number.NaN), layout);
  assert.equal(model(['<!-- vml {"width":"wide"} -->', "![[a.png]]", "<!-- /vml -->"]).width, null);
  assert.equal(model(['<!-- vml {"width":0.1} -->', "![[a.png]]", "<!-- /vml -->"]).width, null);
});

test("scaling rows multiplies their heights and, when asked, the widths of single items", () => {
  const layout = model(sample);

  const taller = metaFromModel(scaleRows(layout, 1.5)).rows;
  assert.deepEqual(taller.map((row) => [row.height, row.width]), [[360, undefined], [undefined, 0.6]]);

  const smaller = metaFromModel(scaleRows(layout, 0.5, [null, 0.8])).rows;
  // The stored width wins over the share the item currently takes up.
  assert.deepEqual(smaller.map((row) => [row.height, row.width]), [[120, undefined], [undefined, 0.3]]);

  const natural = model(["<!-- vml -->", "![[a.png]] ![[b.png]]", "![[c.png]]", "![[d.png]]", "<!-- /vml -->"]);
  // The last item keeps its natural size: nothing says how wide it is now.
  assert.deepEqual(metaFromModel(scaleRows(natural, 2, [null, 0.7, null])).rows, [{ height: 440 }, { width: 1 }, {}]);
  assert.equal(scaleRows(layout, 0), layout);
});

test("a single item's position follows the pointer and snaps to left, center and right", () => {
  // 200px of free space; the item starts 50px from the left edge of its row.
  assert.equal(positionOffset(50, 30, 200, 8), 0.4);
  assert.equal(positionOffset(50, 45, 200, 8), 0.5);
  assert.equal(positionOffset(50, -45, 200, 8), 0);
  assert.equal(positionOffset(50, 400, 200, 8), 1);
  assert.equal(positionOffset(50, 10, 0, 8), 0.5);
});

test("corner scaling makes native and natural single sizes proportional without scaling twice", () => {
  const layout = model([
    '<!-- vml {"rows":[{},{},{"width":0.5},{"height":240}]} -->',
    "![[native.png|200]]",
    "![[natural.png]]",
    "![[proportional.png]]",
    "![[a.png]] ![[b.png]]",
    "<!-- /vml -->",
  ]);
  const resized = scaleRows(setBlockWidth(layout, 0.5), 0.5, [0.25, 0.375, 0.5, null], 1);
  // In an 800px row, 200px and 300px images become 100px and 150px in a 400px row.
  assert.deepEqual(resized.rows.slice(0, 3).map((row) => (row.width ?? 0) * 400), [100, 150, 200]);
  assert.equal(resized.rows[3]?.height, 120);
  assert.deepEqual(resized.rows.map((row) => row.items.map((item) => item.embed.raw)),
    layout.rows.map((row) => row.items.map((item) => item.embed.raw)));
  assert.equal(layout.rows[0]?.width, null);
});

test("double-clicking a column divider shares the whole row by aspect ratio again", () => {
  const layout = model([
    '<!-- vml {"v":2,"width":0.6,"rows":[{"height":240,"widths":[1,1.5,0.5],"captions":["A",null,null]},{"width":0.4}]} -->',
    "![[a.png]] ![[b.png]] ![[c.png]]",
    "![[d.png]]",
    "<!-- /vml -->",
  ]);

  // However many items the row holds; the row's other settings and the other rows stay.
  assert.deepEqual(metaFromModel(resetWeights(layout, 0)).rows, [{ height: 240, captions: ["A", null, null] }, { width: 0.4 }]);
  assert.equal(resetWeights(layout, 0).width, 0.6);
  // A row already sharing by aspect ratio, a single item and a missing row write nothing.
  const shared = resetWeights(layout, 0);
  assert.equal(resetWeights(shared, 0), shared);
  assert.equal(resetWeights(layout, 1), layout);
  assert.equal(resetWeights(layout, 5), layout);
});

test("the frame's right edge changes the block's width and keeps single items their size on screen", () => {
  const layout = model([
    '<!-- vml {"v":2,"width":0.5,"rows":[{"width":0.8},{},{"height":240}]} -->',
    "![[a.png]]",
    "![[b.png]]",
    "![[c.png]] ![[d.png]]",
    "<!-- /vml -->",
  ]);
  // A 1000px note, with a frame that takes nothing from the rows.
  const widen = (width: number) => keepSingleSizes(layout, setBlockWidth(layout, width), 1000);

  // 0.8 of a 500px row is 400px: 0.4 of a 1000px row, or 0.5 of an 800px one.
  assert.deepEqual(metaFromModel(widen(1)).rows, [{ width: 0.4 }, {}, { height: 240 }]);
  assert.equal(widen(0.8).rows[0]?.width, 0.5);
  // A block narrower than the item takes it along.
  assert.equal(widen(0.25).rows[0]?.width, 1);
  assert.equal(keepSingleSizes(layout, layout, 1000), layout);

  // A floating layout's default width counts as its width.
  const floating = model(['<!-- vml {"v":2,"wrap":"left","rows":[{"width":0.5}]} -->', "![[a.png]]", "<!-- /vml -->"]);
  assert.equal(keepSingleSizes(floating, setBlockWidth(floating, 0.8), 1000).rows[0]?.width, 0.25);
});

test("the frame's own width does not scale with the block, so single items keep their exact size", () => {
  // A full-width block in a 987px note whose frame takes 22px from its rows, as in live preview.
  const layout = model(['<!-- vml {"v":2,"rows":[{"width":0.4}]} -->', "![[a.png]]", "<!-- /vml -->"]);
  const before = 0.4 * (987 - 22);
  const narrowed = keepSingleSizes(layout, setBlockWidth(layout, 0.6), 987, 22);
  const after = (narrowed.rows[0]?.width ?? 0) * (0.6 * 987 - 22);

  assert.ok(Math.abs(after - before) < 1e-9, `${before} -> ${after}`);
  // Writing it keeps three decimals: under half a pixel off.
  assert.match(serializeOpener(metaFromModel(narrowed)), /"width":0\.677\}/);
  // A ratio of block widths alone would be off by several pixels.
  assert.ok(Math.abs(0.4 / 0.6 * (0.6 * 987 - 22) - before) > 5);
});
