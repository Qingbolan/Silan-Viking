import test from "node:test";
import assert from "node:assert/strict";

import { planMergeWithNext, planWrapSelection } from "../src/commands/plans.ts";
import { blockWrap, findV2Blocks, hasTextColumns, isDrawable, isTextBlock, type V2Block } from "../src/format/v2.ts";
import { planWrap } from "../src/input/insertion.ts";
import { drawnFrom } from "../src/layout/drawn.ts";
import { applyEditsToText, applyLineChanges, isEditable, keepListOpen, planColumnText, planOffsetChanges, planModelEdit, planUnwrap, type BlockEdit } from "../src/layout/edits.ts";
import {
  effectiveWidth,
  isTextOnly,
  maxBlockWidth,
  metaFromModel,
  modelFromBlock,
  setBlockWidth,
  setSkip,
  setTextLayout,
  setValign,
  setWrap,
  textLayoutOf,
} from "../src/layout/model.ts";
import { planPlacement } from "../src/layout/placement.ts";

function block(lines: readonly string[], index = 0): V2Block {
  const found = findV2Blocks(lines)[index];
  assert.ok(found, `expected block #${index}`);
  return found;
}

function apply(lines: readonly string[], edits: ReadonlyArray<BlockEdit | null>): string[] {
  const planned = edits.filter((edit): edit is BlockEdit => edit !== null);
  assert.equal(planned.length, edits.length, "expected every edit to be planned");
  const result = applyEditsToText(lines.join("\n"), planned);
  assert.ok(result.ok, `expected success, got ${JSON.stringify(result)}`);
  return result.text.split("\n");
}

const TEXT_OPENER = '<!-- vml {"v":2,"type":"text"} -->';

const note = [
  "前文", // 0
  '<!-- vml {"v":2,"wrap":"right"} -->', // 1
  "## 旁注", // 2
  "", // 3
  "一段文字，", // 4
  "- 列表", // 5
  "<!-- /vml -->", // 6
  "后文", // 7
];

test("a block with text and no media is a text block, drawn as one column", () => {
  const found = block(note);

  assert.equal(found.invalidLine, null);
  assert.ok(isTextBlock(found));
  assert.ok(isDrawable(found));
  assert.ok(isEditable(found));
  assert.equal(hasTextColumns(found), false);
  assert.deepEqual(found.leftText, { from: 2, to: 5, lines: ["## 旁注", "", "一段文字，", "- 列表"] });
  assert.equal(found.rightText, null);
  // A line whose embed is not media is text too.
  assert.ok(isTextBlock(block(["<!-- vml -->", "![[笔记]]", "<!-- /vml -->"])));
});

test("an empty block is not drawn, and blocks with media are no text blocks", () => {
  const empty = block(["<!-- vml -->", "", "<!-- /vml -->"]);
  assert.equal(isTextBlock(empty), false);
  assert.equal(isDrawable(empty), false);

  const columns = block(["<!-- vml -->", "左", "![[a.png]]", "<!-- /vml -->"]);
  assert.equal(isTextBlock(columns), false);
  assert.ok(hasTextColumns(columns));
});

test("a text block floats like media: wrap, skip and width apply to its text", () => {
  const found = block(note);
  const model = modelFromBlock(found);

  assert.equal(blockWrap(found), "right");
  assert.ok(isTextOnly(model));
  assert.equal(model.wrap, "right");
  assert.equal(model.text.left, "## 旁注\n\n一段文字，\n- 列表");
  assert.equal(effectiveWidth(model), 0.4);
  assert.equal(maxBlockWidth(model), 0.8);

  const standing = setWrap(model, null);
  assert.equal(effectiveWidth(standing), null);
  assert.equal(maxBlockWidth(standing), 1);
  assert.equal(setBlockWidth(standing, 0.6).width, 0.6);

  const skipped = setSkip(setWrap(model, "left"), 2);
  assert.deepEqual(metaFromModel(skipped).extra, { width: 0.4, wrap: "left", skip: 2 });
  // Its text has no media to line up with.
  assert.equal(setValign(model, "center"), model);
});

test("changing a text block's settings rewrites only its opening comment", () => {
  const found = block(note);
  const left = setWrap(modelFromBlock(found), "left");

  assert.deepEqual(apply(note, [planModelEdit(found, left)]), [
    "前文",
    '<!-- vml {"v":2,"width":0.4,"wrap":"left"} -->',
    ...note.slice(2),
  ]);
  assert.equal(planModelEdit(found, modelFromBlock(found)), null);
});

test("text typed in a text block replaces its lines, and it is never emptied", () => {
  const found = block(note);
  const plan = planColumnText(found, "left", "\n新的旁注\n\n第二段\n");
  assert.ok(plan.fits);
  assert.ok(plan.edit);
  assert.deepEqual(apply(note, [plan.edit]), ["前文", note[1], "新的旁注", "", "第二段", "<!-- /vml -->", "后文"]);

  assert.deepEqual(planColumnText(found, "left", "## 旁注\n\n一段文字，\n- 列表"), { fits: true, edit: null });
  assert.deepEqual(planColumnText(found, "left", "  \n"), { fits: false, edit: null });
  // Media lines, a code fence or a second side would change what the block is.
  assert.deepEqual(planColumnText(found, "left", "![[a.png]]"), { fits: false, edit: null });
  assert.deepEqual(planColumnText(found, "left", "文字\n```"), { fits: false, edit: null });
  assert.deepEqual(planColumnText(found, "right", "右边"), { fits: false, edit: null });
});

test("an embed followed by other text is text, and fits in a text block", () => {
  const found = block(note);
  const plan = planColumnText(found, "left", "文字\n![[a.png]] 说明");
  assert.ok(plan.fits);
});

test("a text block is unwrapped to its text, never merged, and joined by no new media", () => {
  const found = block(note);
  assert.deepEqual(apply(note, [planUnwrap(found)]), ["前文", "## 旁注", "", "一段文字，", "- 列表", "后文"]);

  const lines = ["<!-- vml -->", "文字", "<!-- /vml -->", "", "<!-- vml -->", "![[a.png]]", "<!-- /vml -->"];
  assert.equal(planMergeWithNext(lines, 0), null);
  assert.equal(planMergeWithNext(lines, 5), null);

  const dropped = ["<!-- vml -->", "文字", "<!-- /vml -->", "![[b.png]]"];
  const change = planWrap(dropped, [3], { mergeWithPrevious: true });
  assert.ok(change);
  assert.deepEqual(applyLineChanges(dropped, [change]), [...dropped.slice(0, 3), "<!-- vml -->", "![[b.png]]", "<!-- /vml -->"]);
});

test("reading view redraws when a text block's text changes", () => {
  const before = drawnFrom(findV2Blocks(note));
  const after = drawnFrom(findV2Blocks(note.map((line) => (line === "一段文字，" ? "改过的文字，" : line))));

  assert.equal(before.texts.length, 1);
  assert.notEqual(before.texts[0], after.texts[0]);
});

test("a text block moves as a whole and floats where it is dropped", () => {
  const lines = ["<!-- vml -->", "旁注", "<!-- /vml -->", "", "第一段", "", "第二段"];
  const edits = planPlacement(lines, block(lines), { line: 6, wrap: "left", skip: 1 });
  assert.ok(edits);

  assert.deepEqual(apply(lines, edits), ["第一段", "", '<!-- vml {"v":2,"width":0.4,"wrap":"left","skip":1} -->', "旁注", "<!-- /vml -->", "第二段"]);
});

test("wrapping selected text makes a text block of the lines as they are", () => {
  const lines = ["前文", "", "第一行", "", "- 列表", "  继续", "", "后文"];
  const change = planWrapSelection(lines, 1, 6);
  assert.ok(change);

  const after = applyLineChanges(lines, [change]);
  // Text ending in a list keeps a blank line above the closing comment.
  assert.deepEqual(after, ["前文", "", TEXT_OPENER, "第一行", "", "- 列表", "  继续", "", "<!-- /vml -->", "", "后文"]);
  assert.ok(isTextBlock(block(after)));
});

test("wrapping text in the middle of a paragraph takes just the selected lines", () => {
  const lines = ["甲", "乙", "丙"];
  const change = planWrapSelection(lines, 1, 1);
  assert.ok(change);

  assert.deepEqual(applyLineChanges(lines, [change]), ["甲", TEXT_OPENER, "乙", "<!-- /vml -->", "丙"]);
});

test("wrapping text and media together makes text columns beside the media", () => {
  const lines = ["左栏", "![[a.png]] ![[b.png]]", "右栏"];
  const change = planWrapSelection(lines, 0, 2);
  assert.ok(change);

  const found = block(applyLineChanges(lines, [change]));
  assert.ok(hasTextColumns(found));
  assert.equal(found.rows.length, 1);
  assert.deepEqual([found.leftText?.lines, found.rightText?.lines], [["左栏"], ["右栏"]]);
});

test("text between two rows of media makes a block of text with figures in it", () => {
  const lines = ["![[a.png]]", "文字", "![[b.png]]"];
  const change = planWrapSelection(lines, 0, 2);
  assert.ok(change);
  const found = block(applyLineChanges(lines, [change]));
  assert.ok(isTextBlock(found));
  assert.deepEqual(found.leftText?.lines, lines);
});

test("a selection that would not read back as one editable block is not wrapped", () => {
  // A code fence, math or a comment that goes on after the selection would take the closing comment in.
  assert.equal(planWrapSelection(["文字", "```", "代码", "```"], 0, 2), null);
  assert.equal(planWrapSelection(["文字", "$$", "x", "$$"], 0, 1), null);
  assert.equal(planWrapSelection(["文字", "%%", "注释", "%%"], 0, 2), null);
  // Layout comments in the selection, or a block around it.
  assert.equal(planWrapSelection(["文字", "<!-- /vml -->"], 0, 1), null);
  assert.equal(planWrapSelection(["文字", "<!-- vml -->", "![[a.png]]", "<!-- /vml -->"], 0, 2), null);
  assert.equal(planWrapSelection(["<!-- vml -->", "文字", "<!-- /vml -->"], 1, 1), null);
});

test("a selection of media alone still gathers its embeds into rows", () => {
  const lines = ["![[a.png]]", "", "![[b.png]]"];
  const change = planWrapSelection(lines, 0, 2);
  assert.ok(change);

  assert.deepEqual(applyLineChanges(lines, [change]), ["<!-- vml -->", "![[a.png]] ![[b.png]]", "<!-- /vml -->"]);
});

test("a list right above the closing comment is kept apart from it", () => {
  assert.deepEqual(keepListOpen(["段落", "- 项"]), ["段落", "- 项", ""]);
  assert.deepEqual(keepListOpen(["1. 项", "   续行"]), ["1. 项", "   续行", ""]);
  assert.deepEqual(keepListOpen(["- 项", "", "段落"]), ["- 项", "", "段落"]);
  assert.deepEqual(keepListOpen(["> 引用"]), ["> 引用"]);

  const found = block(note);
  // Typed text ending in a list gets the blank line; the block reads back with the typed text.
  const plan = planColumnText(found, "left", "旁注\n- 新项");
  assert.ok(plan.edit);
  const after = apply(note, [plan.edit]);
  assert.deepEqual(after.slice(2, 6), ["旁注", "- 新项", "", "<!-- /vml -->"]);
  assert.deepEqual(block(after).leftText?.lines, ["旁注", "- 新项"]);

  // A new right column too, but not a left one, whose next line is media.
  const columns = ["<!-- vml -->", "![[a.png]]", "<!-- /vml -->"];
  const right = planColumnText(block(columns), "right", "- 项");
  assert.ok(right.edit);
  assert.deepEqual(apply(columns, [right.edit]), ["<!-- vml -->", "![[a.png]]", "- 项", "", "<!-- /vml -->"]);
  const left = planColumnText(block(columns), "left", "- 项");
  assert.ok(left.edit);
  assert.deepEqual(apply(columns, [left.edit]), ["<!-- vml -->", "- 项", "![[a.png]]", "<!-- /vml -->"]);
});

test("code, math and comments are wrapped with the text around them", () => {
  const lines = ["文字", "```", "![[a.png]]", "```", "$$", "x^2 \\tag{1}", "$$", "%%", "注释", "%%"];
  const change = planWrapSelection(lines, 0, lines.length - 1);
  assert.ok(change);
  const found = block(applyLineChanges(lines, [change]));
  assert.ok(isTextBlock(found));
  assert.deepEqual(found.leftText?.lines, lines);
});

test("in a block of text, media lines are figures in the text", () => {
  const lines = [TEXT_OPENER, "正文", "![[a.png]]", "*图 1.* 说明", "", "![[b.png]] ![[c.png]]", "<!-- /vml -->"];
  const found = block(lines);
  assert.ok(isTextBlock(found));
  assert.equal(found.rows.length, 0);
  assert.deepEqual(found.leftText?.lines, lines.slice(1, -1));

  const model = modelFromBlock(found);
  assert.equal(model.allText, true);
  assert.equal(metaFromModel(model).extra.type, "text");

  // Typing a media line keeps the block as it is.
  const plan = planColumnText(found, "left", "正文\n![[d.png]]");
  assert.ok(plan.fits);
  assert.ok(plan.edit);
  // An untyped block of text would turn into text beside media.
  assert.equal(planColumnText(block(note), "left", "正文\n![[d.png]]").fits, false);
});

test("the text of a layout flows through columns and lines up as set", () => {
  const opener = '<!-- vml {"v":2,"type":"text","cols":2,"gap":1.5,"textAlign":"justify","size":0.9,"align":"center","width":0.8} -->';
  const found = block([opener, "文字", "<!-- /vml -->"]);
  const model = modelFromBlock(found);
  assert.deepEqual(textLayoutOf(model), { cols: 2, gap: 1.5, textAlign: "justify", size: 0.9, align: "center" });
  assert.deepEqual(metaFromModel(model).extra, { width: 0.8, type: "text", cols: 2, gap: 1.5, textAlign: "justify", size: 0.9, align: "center" });

  // Defaults are not stored; one column takes the gap along; values are kept in range.
  const plain = setTextLayout(model, { cols: 1, textAlign: "left", size: 1, align: "left" });
  assert.deepEqual(metaFromModel(plain).extra, { width: 0.8, type: "text" });
  assert.deepEqual(textLayoutOf(setTextLayout(model, { cols: 9, gap: 20, size: 5 })), { cols: 4, gap: 6, textAlign: "justify", size: 2, align: "center" });

  // Invalid values read as unset; columns are for text alone.
  const odd = modelFromBlock(block(['<!-- vml {"v":2,"cols":1.5,"gap":-1,"textAlign":"top","size":0,"align":"left"} -->', "文字", "<!-- /vml -->"]));
  assert.deepEqual(textLayoutOf(odd), { cols: 1, gap: null, textAlign: "left", size: 1, align: "left" });
  const beside = modelFromBlock(block(["<!-- vml -->", "文字", "![[a.png]]", "<!-- /vml -->"]));
  assert.equal(setTextLayout(beside, { cols: 2 }).cols, null);

  // Only the opening comment changes.
  const edit = planModelEdit(found, setTextLayout(model, { cols: 3 }));
  assert.ok(edit);
  assert.deepEqual([edit.start, edit.end], [0, 0]);
});

test("edits are planned as offset changes for typing into the note's editor", () => {
  const text = note.join("\n");
  const plan = planColumnText(block(note), "left", "新的旁注");
  assert.ok(plan.edit);
  const planned = planOffsetChanges(text, [plan.edit]);
  assert.ok(planned.ok);
  let result = text;
  for (const change of [...planned.changes].reverse()) {
    result = result.slice(0, change.from) + change.insert + result.slice(change.to);
  }
  assert.equal(result, apply(note, [plan.edit]).join("\n"));

  // Taking lines out removes their line break too.
  const removal = planOffsetChanges("甲\n乙\n丙", [{ anchorLine: 1, anchorLines: ["乙"], start: 0, end: 0, replacement: [] }]);
  assert.deepEqual(removal, { ok: true, changes: [{ from: 2, to: 4, insert: "" }] });
  assert.deepEqual(planOffsetChanges("甲", [{ anchorLine: 0, anchorLines: ["乙"], start: 0, end: 0, replacement: [] }]), { ok: false, reason: "not-found" });
});
