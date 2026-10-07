import test from "node:test";
import assert from "node:assert/strict";

import { planMergeWithNext } from "../src/commands/plans.ts";
import { blockWrap, findV2Blocks, readBlockValign, serializeOpener, type V2Block } from "../src/format/v2.ts";
import { planWrap } from "../src/input/insertion.ts";
import { applyEditsToText, onlyColumnTextDiffers, planColumnText, planModelEdit, planMoveOut, planUnwrap, type BlockEdit } from "../src/layout/edits.ts";
import {
  effectiveWidth,
  hasText,
  maxBlockWidth,
  metaFromModel,
  modelFromBlock,
  moveItem,
  removeItem,
  setBlockWidth,
  setRowHeight,
  setSkip,
  setValign,
  setWrap,
} from "../src/layout/model.ts";
import { planPlacement } from "../src/layout/placement.ts";

function block(lines: readonly string[], index = 0): V2Block {
  const found = findV2Blocks(lines)[index];
  assert.ok(found, `expected block #${index}`);
  return found;
}

function apply(lines: readonly string[], edits: ReadonlyArray<BlockEdit | null> | null): string[] {
  assert.ok(edits);
  const planned = edits.filter((edit): edit is BlockEdit => edit !== null);
  assert.equal(planned.length, edits.length, "expected every edit to be planned");
  const result = applyEditsToText(lines.join("\n"), planned);
  assert.ok(result.ok, `expected success, got ${JSON.stringify(result)}`);
  return result.text.split("\n");
}

const note = [
  "前文", // 0
  "", // 1
  '<!-- vml {"v":2,"width":0.5,"rows":[{"height":300}]} -->', // 2
  "## 左侧标题", // 3
  "", // 4
  "左侧第一段，", // 5
  "第二行。  ", // 6
  "![[a.png]] ![[b.png]]", // 7
  "", // 8
  "![[c.png]]", // 9
  "右侧文字", // 10
  "", // 11
  "- 列表", // 12
  "<!-- /vml -->", // 13
  "", // 14
  "后文", // 15
];

test("text before the first row goes left of the media and text after the last row right", () => {
  const found = block(note);
  assert.equal(found.invalidLine, null);
  assert.deepEqual(found.rows.map((row) => row.line), [7, 9]);
  assert.deepEqual(found.leftText, { from: 3, to: 6, lines: note.slice(3, 7) });
  assert.deepEqual(found.rightText, { from: 10, to: 12, lines: note.slice(10, 13) });

  const model = modelFromBlock(found);
  assert.deepEqual(model.text, { left: "## 左侧标题\n\n左侧第一段，\n第二行。  ", right: "右侧文字\n\n- 列表" });
  // Row settings belong to rows only; text lines are not counted.
  assert.deepEqual(model.rows.map((row) => row.height), [300, null]);

  // Anything but media embeds is text: a note embed, or media with words after it.
  const mixed = block(["<!-- vml -->\r", "![[a.png]]\r", "![[笔记]]\r", "![[b.png]] 说明\r", "<!-- /vml -->\r"]);
  assert.equal(mixed.leftText, null);
  assert.deepEqual(mixed.rightText?.lines, ["![[笔记]]", "![[b.png]] 说明"]);

  const plain = block(["<!-- vml -->", "![[a.png]]", "<!-- /vml -->"]);
  assert.deepEqual([plain.leftText, plain.rightText, hasText(modelFromBlock(plain))], [null, null, false]);
});

test("a layout with text does not float, and its wrap settings stay as written", () => {
  const opener = '<!-- vml {"v":2,"width":0.3,"wrap":"left","skip":2} -->';
  const withText = block([opener, "说明", "![[a.png]]", "<!-- /vml -->"]);
  const model = modelFromBlock(withText);
  assert.equal(blockWrap(withText), null);
  assert.deepEqual([model.wrap, model.skip, hasText(model)], [null, null, true]);
  assert.equal(setWrap(model, "right"), model);
  assert.equal(setSkip(model, 3), model);
  assert.equal(serializeOpener(metaFromModel(model)), opener);
  assert.equal(serializeOpener(metaFromModel(setBlockWidth(model, 0.5))), opener.replace("0.3", "0.5"));

  assert.equal(blockWrap(block([opener, "![[a.png]]", "<!-- /vml -->"])), "left");
});

test("text beside the media leaves it a default width and a cap", () => {
  const model = modelFromBlock(block(["<!-- vml -->", "![[a.png]]", "说明", "<!-- /vml -->"]));
  assert.deepEqual([effectiveWidth(model), maxBlockWidth(model), setBlockWidth(model, 1).width], [0.4, 0.8, 0.8]);
});

test("new rows keep the text beside them exactly as written", () => {
  const found = block(note);
  const model = modelFromBlock(found);

  const moved = moveItem(model, { row: 1, index: 0 }, { kind: "beside", position: { row: 0, index: 1 }, side: "after" });
  assert.deepEqual(apply(note, [planModelEdit(found, moved)]), [
    ...note.slice(0, 3),
    ...note.slice(3, 7),
    "![[a.png]] ![[b.png]] ![[c.png]]",
    ...note.slice(10),
  ]);

  // A settings change still rewrites only the opening comment.
  const taller = apply(note, [planModelEdit(found, setRowHeight(model, 1, 260))]);
  assert.deepEqual(taller.filter((line, index) => line !== note[index]), ['<!-- vml {"v":2,"width":0.5,"rows":[{"height":300},{"height":260}]} -->']);

  // CRLF stays CRLF, the text lines included.
  const crlf = note.join("\r\n");
  const result = applyEditsToText(crlf, [planModelEdit(block(crlf.split("\n")), moved) as BlockEdit]);
  assert.ok(result.ok);
  assert.equal(result.text, apply(note, [planModelEdit(found, moved)]).join("\r\n"));
});

test("a layout losing its last embed leaves its text as plain paragraphs", () => {
  const lines = ["<!-- vml -->", "左", "![[a.png]]", "右", "<!-- /vml -->"];
  const found = block(lines);
  const taken = removeItem(modelFromBlock(found), { row: 0, index: 0 });
  assert.ok(taken);
  assert.deepEqual(apply(lines, [planModelEdit(found, taken.model)]), ["左", "", "右"]);
  assert.deepEqual(apply(lines, [planMoveOut(found, taken.model, taken.item.embed)]), ["左", "", "右", "", "![[a.png]]"]);

  const two = ["<!-- vml -->", "![[a.png]] ![[b.png]]", "右", "<!-- /vml -->"];
  const rest = removeItem(modelFromBlock(block(two)), { row: 0, index: 1 });
  assert.ok(rest);
  assert.deepEqual(apply(two, [planMoveOut(block(two), rest.model, rest.item.embed)]), [
    "<!-- vml -->",
    "![[a.png]]",
    "右",
    "<!-- /vml -->",
    "",
    "![[b.png]]",
  ]);
});

test("text typed in the layout replaces only its side's lines, and only when the block reads back as meant", () => {
  const found = block(note);
  const typed = planColumnText(found, "right", "改过的右侧文字\n\n- 列表\n- 新的一项\n");
  assert.equal(typed.fits, true);
  assert.deepEqual(apply(note, [typed.edit]), [...note.slice(0, 10), "改过的右侧文字", "", "- 列表", "- 新的一项", "", ...note.slice(13)]);
  // The same text, blank lines around it aside, writes nothing.
  assert.deepEqual(planColumnText(found, "left", "\n## 左侧标题\n\n左侧第一段，\n第二行。  \n\n"), { fits: true, edit: null });

  // A side without text gets its first lines at the top of the body (left) or at its bottom (right).
  const plain = ["前文", "<!-- vml -->", "![[a.png]]", "<!-- /vml -->"];
  assert.deepEqual(apply(plain, [planColumnText(block(plain), "left", "左").edit]), ["前文", "<!-- vml -->", "左", "![[a.png]]", "<!-- /vml -->"]);
  assert.deepEqual(apply(plain, [planColumnText(block(plain), "right", "右\n第二行").edit]), ["前文", "<!-- vml -->", "![[a.png]]", "右", "第二行", "<!-- /vml -->"]);
  assert.deepEqual(planColumnText(block(plain), "right", "  \n"), { fits: true, edit: null });

  // No text takes the side's lines out.
  const both = ["<!-- vml -->", "左", "![[a.png]]", "右", "<!-- /vml -->"];
  assert.deepEqual(apply(both, [planColumnText(block(both), "left", "").edit]), ["<!-- vml -->", "![[a.png]]", "右", "<!-- /vml -->"]);

  // Text that would change what the block is does not fit, and nothing is written.
  for (const text of ["右\n![[b.png]]", "```\n代码", "<!-- /vml -->", "<!-- vml -->", "%%"]) {
    assert.deepEqual(planColumnText(block(both), "right", text), { fits: false, edit: null }, text);
  }
  assert.deepEqual(planColumnText(block(['<!-- vml {"v":3} -->', "右", "![[a.png]]", "<!-- /vml -->"]), "left", "x"), { fits: false, edit: null });
});

test("a change to the note that is only the typed text keeps the layout as it is", () => {
  const before = block(["<!-- vml -->", "左", "![[a.png]]", "右", "<!-- /vml -->"]);
  const typed = block(["<!-- vml -->", "左边改了", "第二行", "![[a.png]]", "右", "<!-- /vml -->"]);
  assert.equal(onlyColumnTextDiffers(before, typed, "left", ["左边改了", "第二行", ""]), true);
  assert.equal(onlyColumnTextDiffers(before, typed, "left", ["左边改了"]), false);
  assert.equal(onlyColumnTextDiffers(before, typed, "right", ["右"]), false);
  const settings = block(['<!-- vml {"v":2,"width":0.5} -->', "左边改了", "第二行", "![[a.png]]", "右", "<!-- /vml -->"]);
  assert.equal(onlyColumnTextDiffers(before, settings, "left", ["左边改了", "第二行"]), false);
  const rows = block(["<!-- vml -->", "左", "![[b.png]]", "右", "<!-- /vml -->"]);
  assert.equal(onlyColumnTextDiffers(before, rows, "left", ["左"]), false);
});

test("unwrapping and moving a layout keep its text; merging leaves layouts with text alone", () => {
  const found = block(note);
  assert.deepEqual(apply(note, [planUnwrap(found)]), [...note.slice(0, 2), ...note.slice(3, 13), ...note.slice(14)]);

  // A layout with text moves verbatim, and dropped beside the text it still does not float.
  const moved = apply(note, planPlacement(note, found, { line: 0, wrap: "left", skip: 2 }));
  assert.deepEqual(moved, [...note.slice(2, 14), "", "前文", "", "后文"]);

  const pair = ["<!-- vml -->", "![[a.png]]", "说明", "<!-- /vml -->", "", "<!-- vml -->", "![[b.png]]", "<!-- /vml -->"];
  assert.equal(planMergeWithNext(pair, 0), null);
  assert.equal(planMergeWithNext(pair.slice(4).concat(["", ...pair.slice(0, 4)]), 1), null);

  // New media below a layout with text get a layout of their own.
  const dropped = ["<!-- vml -->", "![[a.png]]", "说明", "<!-- /vml -->", "", "![[new.png]]"];
  assert.deepEqual(planWrap(dropped, [5], { mergeWithPrevious: true }), { from: 5, to: 5, replacement: ["<!-- vml -->", "![[new.png]]", "<!-- /vml -->"] });
});

test("text lines up with the media at the top, in the middle or at the bottom", () => {
  assert.deepEqual(["top", "center", "bottom", "middle", 1, undefined].map(readBlockValign), [null, "center", "bottom", null, null, null]);

  const lines = ['<!-- vml {"v":2,"valign":"center"} -->', "说明", "![[a.png]]", "<!-- /vml -->"];
  const model = modelFromBlock(block(lines));
  assert.equal(model.valign, "center");
  assert.equal(setValign(model, "center"), model);
  assert.equal(serializeOpener(metaFromModel(setValign(model, "top"))), "<!-- vml -->");
  // A settings change: only the opening comment is rewritten.
  assert.deepEqual(apply(lines, [planModelEdit(block(lines), setValign(model, "bottom"))]), ['<!-- vml {"v":2,"valign":"bottom"} -->', ...lines.slice(1)]);

  // Without text beside the media it means nothing: it cannot be set, and goes when the comment is written.
  const plain = modelFromBlock(block(['<!-- vml {"v":2,"valign":"bottom"} -->', "![[a.png]]", "<!-- /vml -->"]));
  assert.equal(setValign(plain, "center"), plain);
  assert.equal(serializeOpener(metaFromModel(plain)), "<!-- vml -->");
});
