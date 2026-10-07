import test from "node:test";
import assert from "node:assert/strict";

import { findV2Blocks } from "../src/format/v2.ts";
import { lineChangeEdit, blockAt, planMergeWithNext, planWrapSelection, selectedLines } from "../src/commands/plans.ts";
import { applyEditsToEditor, applyEditsToText, applyLineChanges } from "../src/layout/edits.ts";
import { MemoryEditor } from "./support/memoryEditor.ts";

test("wrapping a selection gathers its media lines into one block", () => {
  const lines = ["前文", "![[a.png]]", "", "![[b.png]] ![[c.png]]", "后文"];
  const change = planWrapSelection(lines, 3, 1);
  assert.ok(change);

  assert.deepEqual(applyLineChanges(lines, [change]), ["前文", "<!-- vml -->", "![[a.png]] ![[b.png]] ![[c.png]]", "<!-- /vml -->", "后文"]);
});

test("a selection with an existing block, or nothing in it, is not wrapped", () => {
  assert.equal(planWrapSelection(["<!-- vml -->", "![[a.png]]", "<!-- /vml -->"], 0, 2), null);
  assert.equal(planWrapSelection(["", ""], 0, 1), null);
});

test("merging joins the next block when only blank lines separate them", () => {
  const lines = ['<!-- vml {"v":2,"rows":[{"height":300}]} -->', "![[a.png]]", "<!-- /vml -->", "", "<!-- vml -->", "![[b.png]] ![[c.png]]", "<!-- /vml -->"];
  const change = planMergeWithNext(lines, 1);
  assert.ok(change);

  assert.deepEqual(applyLineChanges(lines, [change]), [
    '<!-- vml {"v":2,"rows":[{"height":300}]} -->',
    "![[a.png]]",
    "![[b.png]] ![[c.png]]",
    "<!-- /vml -->",
  ]);
  assert.equal(planMergeWithNext(lines, 5), null);
  assert.equal(planMergeWithNext(lines, 3), null);
});

test("blocks separated by text, or that cannot be edited, are not merged", () => {
  assert.equal(planMergeWithNext(["<!-- vml -->", "![[a.png]]", "<!-- /vml -->", "正文", "<!-- vml -->", "![[b.png]]", "<!-- /vml -->"], 0), null);
  assert.equal(planMergeWithNext(["<!-- vml -->", "![[a.png]]", "<!-- /vml -->", '<!-- vml {"v":3} -->', "![[b.png]]", "<!-- /vml -->"], 0), null);
});

test("merging never drops a setting of the next block", () => {
  const block = (opener: string, embed: string) => [opener, embed, "<!-- /vml -->"];
  const merge = (first: string, next: string) => planMergeWithNext([...block(first, "![[a.png]]"), "", ...block(next, "![[b.png]]")], 0);

  // Settings the next block alone has, or has otherwise, would be lost: no merge.
  assert.equal(merge("<!-- vml -->", '<!-- vml {"v":2,"width":0.5} -->'), null);
  assert.equal(merge('<!-- vml {"v":2,"wrap":"left"} -->', '<!-- vml {"v":2,"wrap":"right"} -->'), null);
  assert.equal(merge("<!-- vml -->", '<!-- vml {"v":2,"future":1} -->'), null);
  // The same settings, or none in the next block, merge into the first block's.
  assert.deepEqual(merge('<!-- vml {"v":2,"width":0.5,"align":"center"} -->', '<!-- vml {"v":2,"width":0.5} -->')?.replacement,
    ['<!-- vml {"v":2,"width":0.5,"align":"center"} -->', "![[a.png]]", "![[b.png]]", "<!-- /vml -->"]);
  assert.deepEqual(merge('<!-- vml {"v":2,"width":0.5} -->', "<!-- vml -->")?.replacement,
    ['<!-- vml {"v":2,"width":0.5} -->', "![[a.png]]", "![[b.png]]", "<!-- /vml -->"]);
  // Row settings travel with their rows.
  assert.deepEqual(merge("<!-- vml -->", '<!-- vml {"v":2,"rows":[{"height":300}]} -->')?.replacement,
    ['<!-- vml {"v":2,"rows":[{},{"height":300}]} -->', "![[a.png]]", "![[b.png]]", "<!-- /vml -->"]);
});

test("a selection ending at the start of a line does not take that line", () => {
  assert.deepEqual(selectedLines({ line: 1, ch: 0 }, { line: 3, ch: 0 }), { from: 1, to: 2 });
  assert.deepEqual(selectedLines({ line: 1, ch: 2 }, { line: 3, ch: 1 }), { from: 1, to: 3 });
  // Backwards, or within one line, it is the same.
  assert.deepEqual(selectedLines({ line: 3, ch: 0 }, { line: 1, ch: 0 }), { from: 1, to: 2 });
  assert.deepEqual(selectedLines({ line: 2, ch: 0 }, { line: 2, ch: 0 }), { from: 2, to: 2 });

  const lines = ["para one", "para two", "# Heading"];
  const { from, to } = selectedLines({ line: 0, ch: 0 }, { line: 2, ch: 0 });
  assert.deepEqual(planWrapSelection(lines, from, to)?.replacement, ['<!-- vml {"v":2,"type":"text"} -->', "para one", "para two", "<!-- /vml -->"]);
});

test("indented media lines are not wrapped by the command", () => {
  assert.equal(planWrapSelection(["- item", "", "    ![[a.png]]", "", "- next"], 2, 2), null);
  assert.equal(planWrapSelection(["Text", "", "    ![[a.png]]", "    ![[b.png]]"], 2, 3), null);
  // Starting on an indented line, text or media, would take it out of the list item above.
  assert.equal(planWrapSelection(["- item", "", "    ![[a.png]]", "    more of the item"], 2, 3), null);
  assert.equal(planWrapSelection(["- item", "  continued", "Text"], 1, 2), null);
});

test("with text selected too, indented media lines stay text, verbatim", () => {
  const wrapped = (lines: string[], from: number, to: number) => {
    const change = planWrapSelection(lines, from, to);
    assert.ok(change, lines.join(" / "));
    const after = applyLineChanges(lines, [change]);
    const [block] = findV2Blocks(after);
    assert.ok(block);
    return { after, block };
  };

  // An indented code block after a paragraph: still code inside a block of text, never a row.
  const code = wrapped(["Text", "", "    ![[a.png]]"], 0, 2);
  assert.deepEqual(code.after, ['<!-- vml {"v":2,"type":"text"} -->', "Text", "", "    ![[a.png]]", "<!-- /vml -->"]);
  assert.equal(code.block.rows.length, 0);
  // An image inside a list item stays in the item, indentation and all.
  const list = wrapped(["- item", "    ![[a.png]]", "- next"], 0, 2);
  assert.deepEqual(list.after.slice(1, 4), ["- item", "    ![[a.png]]", "- next"]);
  assert.equal(list.block.rows.length, 0);
  // Without indentation, text beside media still makes text columns.
  const columns = wrapped(["Text", "![[a.png]]"], 0, 1);
  assert.equal(columns.block.rows.length, 1);
  assert.equal(columns.block.meta.extra.type, undefined);
});

test("finds the block around a line", () => {
  const lines = ["正文", "<!-- vml -->", "![[a.png]]", "<!-- /vml -->"];

  assert.equal(blockAt(lines, 2)?.openLine, 1);
  assert.equal(blockAt(lines, 0), null);
});

test("a planned change is applied to the editor in one transaction", () => {
  const editor = new MemoryEditor("前文\n![[a.png]]\n后文");
  const change = planWrapSelection(editor.getValue().split("\n"), 1, 1);
  assert.ok(change);

  applyEditsToEditor(editor, [lineChangeEdit(editor.getValue().split("\n"), change)]);

  assert.equal(editor.getValue(), "前文\n<!-- vml -->\n![[a.png]]\n<!-- /vml -->\n后文");
  assert.equal(editor.transactionCount, 1);
});

test("a command's captured source is validated before it writes", () => {
  const original = ["前文", "![[a.png|240]]", "后文"];
  const change = planWrapSelection(original, 1, 1);
  assert.ok(change);
  const edit = lineChangeEdit(original, change);
  const editor = new MemoryEditor("前文\n![[renamed.png|240]]\n后文");
  assert.deepEqual(applyEditsToEditor(editor, [edit]), { ok: false, reason: "not-found" });
  assert.equal(editor.transactionCount, 0);
  assert.equal(editor.getValue(), "前文\n![[renamed.png|240]]\n后文");
});

test("wrapping complete code and equations validates their text boundary and writes one transaction", () => {
  for (const body of ['```js\nconst a = 1;\n```', '$$\nx = 1\n$$', '%%\nComment\n%%']) {
    for (const surrounding of [false, true]) {
      const text = surrounding ? `Intro\n${body}\nTail` : body;
      const lines = text.split("\n");
      const from = surrounding ? 1 : 0;
      const to = from + body.split("\n").length - 1;
      const change = planWrapSelection(lines, from, to);
      assert.ok(change);
      const edit = lineChangeEdit(lines, change);
      const editor = new MemoryEditor(text);
      assert.deepEqual(applyEditsToEditor(editor, [edit]), { ok: true });
      assert.equal(editor.transactionCount, 1);
      assert.equal(editor.getValue(), applyLineChanges(lines, [change]).join("\n"));
      assert.ok(editor.getValue().includes(body));
      const crlf = text.replaceAll("\n", "\r\n");
      const result = applyEditsToText(crlf, [lineChangeEdit(crlf.split("\n"), change)]);
      assert.ok(result.ok);
      assert.ok(result.text.includes(body.replaceAll("\n", "\r\n")));
    }
  }
});

test("wrapping does not turn a partial code or equation selection into a writable plan", () => {
  for (const lines of [['```', 'code', '```'], ['$$', 'x', '$$']]) {
    assert.equal(planWrapSelection(lines, 0, 1), null);
    assert.equal(planWrapSelection(lines, 1, 2), null);
  }
});
