import test from "node:test";
import assert from "node:assert/strict";

import { findV2Blocks } from "../src/format/v2.ts";
import { drawnFrom, isStale } from "../src/layout/drawn.ts";
import { DRAWN_TOKEN, captionParagraphStart, captionText, collectRefs, equationLabel, equationLabels, mayHaveRefs, numberMarkdown, refText } from "../src/markdown/crossref.ts";
import { scanMarkdownLines } from "../src/markdown/lineContext.ts";

const note = [
  '<!-- vml {"v":2,"rows":[{"captions":["Scaling. {#fig:scaling}"]}]} -->', // 0
  "![[a.png]]", // 1
  "<!-- /vml -->", // 2
  "As @fig:scaling and @tbl:results show, see @eq:lm.", // 3
  "", // 4
  "$$", // 5
  String.raw`p(x) = \prod_i p(s_i) \label{eq:lm}`, // 6
  "$$", // 7
  "", // 8
  "| a | b |", // 9
  "| - | - |", // 10
  "", // 11
  "Results on many datasets.", // 12
  "Second line. {#tbl:results}", // 13
  "", // 14
  "```", // 15
  "Not a label {#fig:code}", // 16
  "```", // 17
  "Inline `{#fig:inline}` is code; a repeat {#fig:scaling} counts once.", // 18
  "", // 19
  "A second figure {#fig:second}", // 20
];

test("labels are numbered in the order of the note, per kind, outside code", () => {
  const index = collectRefs(note);
  assert.deepEqual(
    Array.from(index.targets.values(), (target) => [target.id, target.number, target.line]),
    [["fig:scaling", 1, 0], ["eq:lm", 1, 6], ["tbl:results", 1, 13], ["fig:second", 2, 20]],
  );
  assert.equal(index.signature, "fig:scaling=1 eq:lm=1 tbl:results=1 fig:second=2");
  assert.equal(mayHaveRefs("plain text"), false);
});

test("references and captions read in the note's language", () => {
  const index = collectRefs(note);
  const fig = index.targets.get("fig:second");
  const eq = index.targets.get("eq:lm");
  assert.ok(fig && eq);
  assert.deepEqual([refText(fig, "en"), refText(eq, "en"), refText(fig, "zh"), refText(eq, "zh")], ["Figure 2", "Eq. (1)", "图 2", "式 (1)"]);
  assert.deepEqual([captionText(fig, "en"), captionText(fig, "zh")], ["Figure 2.", "图 2"]);
});

test("markdown is drawn with numbers: captions, references and equation tags", () => {
  const index = collectRefs(note);
  const drawn = numberMarkdown(note.slice(3).join("\n"), index, "en").split("\n");

  assert.equal(drawn[0], 'As <span class="vml-ref" data-vml-ref="fig:scaling">Figure 1</span> and <span class="vml-ref" data-vml-ref="tbl:results">Table 1</span> show, see <span class="vml-ref" data-vml-ref="eq:lm">Eq. (1)</span>.');
  assert.equal(drawn[3], String.raw`p(x) = \prod_i p(s_i) \tag{1}`);
  // The caption's number starts its paragraph; its label goes.
  assert.equal(drawn[9], '<span class="vml-caption-label" data-vml-label="tbl:results">Table 1.</span> Results on many datasets.');
  assert.equal(drawn[10], "Second line.");
  // Code stays as written.
  assert.equal(drawn[13], "Not a label {#fig:code}");
  assert.ok(drawn[15]?.startsWith('<span class="vml-caption-label" data-vml-label="fig:scaling">Figure 1.</span> Inline `{#fig:inline}` is code'));
});

test("unknown references read ??, tagged equations keep their tag but lose their label, list and quote markers stay first", () => {
  const index = collectRefs(["$$ x \\label{eq:a} \\tag{A} $$", "- item {#fig:b}"]);
  assert.equal(numberMarkdown("see @fig:missing", index, "zh"), 'see <span class="vml-ref is-unresolved" data-vml-ref="fig:missing">??</span>');
  // Labels never reach MathJax.
  assert.equal(numberMarkdown("$$ x \\label{eq:a} \\tag{A} $$", index, "en"), "$$ x  \\tag{A} $$");
  assert.equal(numberMarkdown("- item {#fig:b}", index, "zh"), '- <span class="vml-caption-label" data-vml-label="fig:b">图 1</span> item');
  // Not a reference: an e-mail address, or a label without a kind.
  assert.equal(numberMarkdown("mail a@fig:b or @foo:b", index, "en"), "mail a@fig:b or @foo:b");
});

test("reading view redraws layouts when the numbers change", () => {
  const blocks = findV2Blocks(["<!-- vml -->", "文字 @fig:a", "<!-- /vml -->"]);
  assert.equal(isStale(drawnFrom(blocks, "en fig:a=1"), drawnFrom(blocks, "en fig:a=2")), true);
  assert.equal(isStale(drawnFrom(blocks, "en fig:a=1"), drawnFrom(blocks, "en fig:a=1")), false);
  assert.equal(drawnFrom(blocks).comments, "<!-- vml -->\n<!-- /vml -->");
});

test("display equations are listed in order with their labels, for references to find them drawn", () => {
  const markdown = [String.raw`$$ a \label{eq:one} $$`, "text", "$$", "b", "$$", "$$", String.raw`c \label{eq:three}`, "$$", "```", String.raw`$$ \label{eq:code} $$`, "```"].join("\n");
  assert.deepEqual(equationLabels(markdown), ["eq:one", null, "eq:three"]);
});

test("adjacent single-line and multiline equations each receive their own number", () => {
  const source = [String.raw`$$ a \label{eq:a} $$`, String.raw`$$ b \label{eq:b} $$`, "$$", String.raw`c \label{eq:c}`, "$$"].join("\n");
  const drawn = numberMarkdown(source, collectRefs(source.split("\n")), "en");
  assert.equal(drawn, [String.raw`$$ a \tag{1} $$`, String.raw`$$ b \tag{2} $$`, "$$", String.raw`c \tag{3}`, "$$"].join("\n"));
});

test("caption prefixes stay out of adjacent headings, lists, quotes and tables", () => {
  for (const before of ["# Heading", "---", "| a | b |\n| --- | --- |\n| 1 | 2 |", "a | b\n--- | ---\n1 | 2", "> Different paragraph."]) {
    const source = `${before}\nCaption {#fig:a}`;
    assert.equal(numberMarkdown(source, collectRefs(source.split("\n")), "en"), `${before}\n<span class="vml-caption-label" data-vml-label="fig:a">Figure 1.</span> Caption`);
  }
  const lines = ["- First item", "- Caption starts", "  and continues {#fig:a}"];
  assert.equal(captionParagraphStart(lines, scanMarkdownLines(lines), 2), 1);
  const quote = ["> Paragraph", ">", "> Caption {#fig:a}"];
  assert.equal(captionParagraphStart(quote, scanMarkdownLines(quote), 2), 2);
});

test("drawn text takes for a label exactly what numbering counts as one", () => {
  const labelsIn = (text: string) => Array.from(text.matchAll(DRAWN_TOKEN), (match) => match[1] ?? match[3]);
  // A label may not end in "." or ":": in "{#fig:a.}" the dot ends the sentence, and nothing is numbered.
  for (const text of ["Caption {#fig:a.}", "Caption {#tbl:x:}", "Caption {#fig:ok}", "See @fig:ok.", "See @eq:ok:"]) {
    const counted = Array.from(collectRefs([text]).targets.keys());
    const drawn = labelsIn(text).filter((label) => !label?.startsWith("eq:") && text.includes(`{#${label}}`));
    assert.deepEqual(drawn, counted, text);
  }
  assert.deepEqual(labelsIn("See @fig:ok. and @eq:ok:"), ["fig:ok", "eq:ok"]);
  assert.deepEqual(labelsIn("mail a@fig:b"), []);

  assert.equal(equationLabel(String.raw`x \label{eq:loss}`), "eq:loss");
  assert.equal(equationLabel(String.raw`x \label{eq:loss.}`), undefined);
  assert.equal(collectRefs(["$$", String.raw`x \label{eq:loss.}`, "$$"]).targets.size, 0);
});
