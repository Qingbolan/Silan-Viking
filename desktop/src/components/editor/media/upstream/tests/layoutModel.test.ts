import test from "node:test";
import assert from "node:assert/strict";

import { findV2Blocks, serializeBlock, type V2Block } from "../src/format/v2.ts";
import {
  canAddText,
  insertItem,
  metaFromModel,
  modelFromBlock,
  moveItem,
  removeItem,
  rowEmbeds,
  setAlign,
  setCaption,
  setRowHeight,
  setSingleWidth,
  setWeights,
  type LayoutModel,
} from "../src/layout/model.ts";

function parse(lines: string[]): V2Block {
  const [block] = findV2Blocks(lines);
  assert.ok(block);
  return block;
}

function model(lines: string[]): LayoutModel {
  return modelFromBlock(parse(lines));
}

function names(layout: LayoutModel): string[][] {
  return layout.rows.map((row) => row.items.map((item) => item.embed.target));
}

const sample = [
  '<!-- vml {"v":2,"theme":"x","rows":[{"height":240,"widths":[1,2],"captions":[null,"B"],"future":1},{"width":0.6,"align":"left"}]} -->',
  "![[a.png]] ![[b.png]]",
  "![[c.png]]",
  "<!-- /vml -->",
];

test("model round trip keeps valid settings and unknown keys", () => {
  const block = parse(sample);

  assert.deepEqual(metaFromModel(modelFromBlock(block)), block.meta);
});

test("unset and invalid settings stay out of the written metadata", () => {
  const layout = model(['<!-- vml {"rows":[{"widths":[1],"width":0.5,"height":"tall"}]} -->', "![[a.png]] ![[b.png]]", "<!-- /vml -->"]);

  assert.deepEqual(metaFromModel(layout), { rows: [{}], extra: {} });
});

test("settings for rows that no longer exist are dropped on the next write", () => {
  const layout = model(['<!-- vml {"rows":[{"height":300},{"height":400},{"height":500}]} -->', "![[a.png]]", "<!-- /vml -->"]);

  assert.deepEqual(metaFromModel(layout).rows, [{ height: 300 }]);
});

test("moves an item within its row", () => {
  const layout = model(["<!-- vml -->", "![[a.png]] ![[b.png]] ![[c.png]]", "<!-- /vml -->"]);

  assert.deepEqual(names(moveItem(layout, { row: 0, index: 0 }, { kind: "beside", position: { row: 0, index: 2 }, side: "after" })), [["b.png", "c.png", "a.png"]]);
  assert.deepEqual(names(moveItem(layout, { row: 0, index: 2 }, { kind: "beside", position: { row: 0, index: 0 }, side: "before" })), [["c.png", "a.png", "b.png"]]);
  assert.deepEqual(names(moveItem(layout, { row: 0, index: 0 }, { kind: "beside", position: { row: 0, index: 1 }, side: "before" })), [["a.png", "b.png", "c.png"]]);
});

test("moving onto itself or into the row it already fills alone is a no-op", () => {
  const layout = model(sample);

  assert.equal(moveItem(layout, { row: 0, index: 1 }, { kind: "beside", position: { row: 0, index: 1 }, side: "after" }), layout);
  assert.equal(moveItem(layout, { row: 1, index: 0 }, { kind: "newRow", beforeRow: 1 }), layout);
  assert.equal(moveItem(layout, { row: 1, index: 0 }, { kind: "newRow", beforeRow: 2 }), layout);
  assert.equal(moveItem(layout, { row: 5, index: 0 }, { kind: "newRow", beforeRow: 0 }), layout);
});

test("moving across rows carries the caption and takes the target row's average weight", () => {
  const moved = moveItem(model(sample), { row: 1, index: 0 }, { kind: "beside", position: { row: 0, index: 0 }, side: "after" });

  assert.deepEqual(names(moved), [["a.png", "c.png", "b.png"]]);
  assert.deepEqual(metaFromModel(moved).rows[0], {
    future: 1,
    height: 240,
    widths: [1, 1.5, 2],
    captions: [null, null, "B"],
  });
});

test("moving to a new row removes the emptied row and inherits the source row height", () => {
  const moved = moveItem(model(sample), { row: 0, index: 1 }, { kind: "newRow", beforeRow: 0 });

  assert.deepEqual(names(moved), [["b.png"], ["a.png"], ["c.png"]]);
  assert.deepEqual(metaFromModel(moved).rows[0], { height: 240, captions: ["B"] });

  const lastOut = moveItem(model(sample), { row: 1, index: 0 }, { kind: "newRow", beforeRow: 0 });
  assert.deepEqual(names(lastOut), [["c.png"], ["a.png", "b.png"]]);
});

test("a row never holds more than four items", () => {
  const layout = model(["<!-- vml -->", "![[a.png]] ![[b.png]] ![[c.png]] ![[d.png]]", "![[e.png]]", "<!-- /vml -->"]);
  const moved = moveItem(setRowHeight(layout, 0, 300), { row: 1, index: 0 }, { kind: "beside", position: { row: 0, index: 0 }, side: "before" });

  assert.deepEqual(names(moved), [["e.png", "a.png", "b.png", "c.png"], ["d.png"]]);
  assert.deepEqual(metaFromModel(moved).rows.map((row) => row.height), [300, 300]);
});

test("removing an item returns its embed and drops the emptied row", () => {
  const result = removeItem(model(sample), { row: 1, index: 0 });

  assert.equal(result?.item.embed.raw, "![[c.png]]");
  assert.deepEqual(names(result?.model ?? model(sample)), [["a.png", "b.png"]]);
  assert.equal(removeItem(model(sample), { row: 3, index: 0 }), null);
});

test("inserting an item taken from another layout", () => {
  const layout = model(sample);
  const item = model(["<!-- vml -->", "![[z.png]]", "<!-- /vml -->"]).rows[0]?.items[0];
  assert.ok(item);

  const beside = insertItem(layout, { ...item, caption: "Z" }, { kind: "beside", position: { row: 0, index: 1 }, side: "before" });
  assert.deepEqual(names(beside), [["a.png", "z.png", "b.png"], ["c.png"]]);
  assert.deepEqual(metaFromModel(beside).rows[0]?.widths, [1, 1.5, 2]);
  assert.deepEqual(metaFromModel(beside).rows[0]?.captions, [null, "Z", "B"]);

  assert.deepEqual(names(insertItem(layout, item, { kind: "newRow", beforeRow: 2 })), [["a.png", "b.png"], ["c.png"], ["z.png"]]);
  assert.equal(insertItem(layout, item, { kind: "beside", position: { row: 9, index: 0 }, side: "after" }), layout);
});

test("setters validate and clamp their input", () => {
  const layout = model(sample);

  assert.equal(metaFromModel(setRowHeight(layout, 1, 20)).rows[1]?.height, 80);
  assert.equal(metaFromModel(setRowHeight(layout, 1, 1234.4)).rows[1]?.height, 900);
  assert.equal(setRowHeight(layout, 1, Number.NaN), layout);
  assert.deepEqual(metaFromModel(setWeights(layout, 0, [3, 1])).rows[0]?.widths, [3, 1]);
  assert.equal(setWeights(layout, 0, [1]), layout);
  assert.equal(setWeights(layout, 0, [1, 0]), layout);
  assert.equal(metaFromModel(setSingleWidth(layout, 1, 3)).rows[1]?.width, 1);
  assert.equal(setSingleWidth(layout, 0, 0.5), layout);
  assert.equal(metaFromModel(setAlign(layout, 1, "right")).rows[1]?.align, "right");
  assert.equal(setAlign(layout, 0, "right"), layout);
  assert.deepEqual(metaFromModel(setCaption(layout, { row: 0, index: 0 }, "  A  ")).rows[0]?.captions, ["A", "B"]);
  assert.equal(metaFromModel(setCaption(layout, { row: 0, index: 1 }, "   ")).rows[0]?.captions, undefined);
});

test("single-row settings are dropped once the row holds several items", () => {
  const moved = moveItem(model(sample), { row: 0, index: 0 }, { kind: "beside", position: { row: 1, index: 0 }, side: "after" });

  assert.deepEqual(names(moved), [["b.png"], ["c.png", "a.png"]]);
  assert.deepEqual(metaFromModel(moved).rows[1], {});
});

test("serializing a changed model re-parses to the same model with embeds untouched", () => {
  const moved = moveItem(model(sample), { row: 1, index: 0 }, { kind: "newRow", beforeRow: 0 });
  const lines = serializeBlock(metaFromModel(moved), rowEmbeds(moved));
  const reparsed = modelFromBlock(parse(lines));

  assert.deepEqual(names(reparsed), names(moved));
  assert.deepEqual(metaFromModel(reparsed), metaFromModel(moved));
  assert.deepEqual(rowEmbeds(reparsed).flat().map((embed) => embed.raw), ["![[c.png]]", "![[a.png]]", "![[b.png]]"]);
});

test("text can be added beside media only while the layout does not wrap", () => {
  assert.equal(canAddText(modelFromBlock(parse(["<!-- vml -->", "![[a.png]]", "<!-- /vml -->"]))), true);
  assert.equal(canAddText(modelFromBlock(parse(['<!-- vml {"v":2,"wrap":"right"} -->', "![[a.png]]", "<!-- /vml -->"]))), false);
  assert.equal(canAddText(modelFromBlock(parse(['<!-- vml {"v":2,"type":"text"} -->', "Text", "<!-- /vml -->"]))), false);
});
