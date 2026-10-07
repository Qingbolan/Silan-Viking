import test from "node:test";
import assert from "node:assert/strict";

import { hangingPrefix, styleLine, tokenStyle, type Token } from "../src/markdown/columnStyle.ts";

// Token names as Obsidian 1.13.7's Markdown language gives them (docs/DESIGN.md, section 4.2).
const tokens = (list: Array<[string, number, number]>): Token[] => list.map(([name, from, to]) => ({ name, from, to }));

test("a token of Obsidian's Markdown language gets the classes the note's editor gives it", () => {
  assert.deepEqual(tokenStyle("HyperMD-header_HyperMD-header-1"), { line: ["HyperMD-header", "HyperMD-header-1"], text: [] });
  assert.deepEqual(tokenStyle("formatting_formatting-header_formatting-header-1_header_header-1"), {
    line: [],
    text: ["cm-formatting", "cm-formatting-header", "cm-formatting-header-1", "cm-header", "cm-header-1"],
  });
  assert.deepEqual(tokenStyle("hmd-internal-link_link-has-alias"), { line: [], text: ["cm-hmd-internal-link", "cm-link-has-alias"] });
  assert.deepEqual(tokenStyle("hashtag_hashtag-end_meta_tag-").text, ["cm-hashtag", "cm-hashtag-end", "cm-meta", "cm-tag-"]);
  assert.deepEqual(tokenStyle("HyperMD-list-line_HyperMD-list-line-1_HyperMD-task-line").line, ["HyperMD-list-line", "HyperMD-list-line-1", "HyperMD-task-line"]);
});

test("heading markers show while a selection touches the line, bold markers while one touches the bold text", () => {
  const heading = tokens([
    ["HyperMD-header_HyperMD-header-2", 0, 12],
    ["formatting_formatting-header_formatting-header-2_header_header-2", 0, 3],
    ["header_header-2", 3, 7],
    ["formatting_formatting-strong_header_header-2_strong", 7, 9],
    ["header_header-2_strong", 9, 10],
    ["formatting_formatting-strong_header_header-2_strong", 10, 12],
  ]);
  const text = "## 标题二 **粗**";
  assert.deepEqual(styleLine(heading, text, []), {
    line: ["HyperMD-header", "HyperMD-header-2"],
    marks: [{ from: 3, to: 7, classes: ["cm-header", "cm-header-2"] }, { from: 9, to: 10, classes: ["cm-header", "cm-header-2", "cm-strong"] }],
    hidden: [{ from: 0, to: 3 }, { from: 7, to: 9 }, { from: 10, to: 12 }],
    task: null,
    math: [],
    embeds: [],
  });
  assert.deepEqual(styleLine(heading, text, [{ from: 1, to: 1 }]).hidden, [{ from: 7, to: 9 }, { from: 10, to: 12 }]);
  assert.deepEqual(styleLine(heading, text, [{ from: 12, to: 12 }]).hidden, []);
  // A selection that reaches over the line from the lines around it touches everything on it.
  assert.deepEqual(styleLine(heading, text, [{ from: -5, to: 20 }]).hidden, []);
});

test("a link shows as its text alone, underlined, until a selection touches it; embeds are handed on as they are", () => {
  const text = "[链接文字](https://a.b) 和 [[目标|别名]] 和 [[目标]]";
  const links = tokens([
    ["formatting_formatting-link_link", 0, 1],
    ["link", 1, 5],
    ["formatting_formatting-link_link", 5, 6],
    ["formatting_formatting-link-string_string_url", 6, 7],
    ["string_url", 7, 18],
    ["formatting_formatting-link-string_string_url", 18, 19],
    ["formatting-link_formatting-link-start", 22, 24],
    ["hmd-internal-link_link-has-alias", 24, 26],
    ["hmd-internal-link_link-alias-pipe", 26, 27],
    ["hmd-internal-link_link-alias", 27, 29],
    ["formatting-link_formatting-link-end", 29, 31],
    ["formatting-link_formatting-link-start", 34, 36],
    ["hmd-internal-link", 36, 38],
    ["formatting-link_formatting-link-end", 38, 40],
  ]);
  const away = styleLine(links, text, []);
  assert.deepEqual(away.marks, [
    { from: 1, to: 5, classes: ["cm-link", "cm-underline"] },
    { from: 27, to: 29, classes: ["cm-hmd-internal-link", "cm-link-alias", "cm-underline"] },
    { from: 36, to: 38, classes: ["cm-hmd-internal-link", "cm-underline"] },
  ]);
  assert.deepEqual(away.hidden, [
    { from: 0, to: 1 }, { from: 5, to: 6 }, { from: 6, to: 7 }, { from: 7, to: 18 }, { from: 18, to: 19 },
    { from: 22, to: 24 }, { from: 24, to: 26 }, { from: 26, to: 27 }, { from: 29, to: 31 },
    { from: 34, to: 36 }, { from: 38, to: 40 },
  ]);
  // Only the link the cursor is in shows its source.
  const inAlias = styleLine(links, text, [{ from: 25, to: 25 }]);
  assert.deepEqual(inAlias.hidden, [
    { from: 0, to: 1 }, { from: 5, to: 6 }, { from: 6, to: 7 }, { from: 7, to: 18 }, { from: 18, to: 19 },
    { from: 34, to: 36 }, { from: 38, to: 40 },
  ]);
  assert.deepEqual(inAlias.marks.find((mark) => mark.from === 27), { from: 27, to: 29, classes: ["cm-hmd-internal-link", "cm-link-alias"] });

  const embed = tokens([
    ["formatting-embed_formatting-link_formatting-link-start", 0, 3],
    ["hmd-embed_hmd-internal-link", 3, 17],
    ["formatting-link_formatting-link-end", 17, 19],
  ]);
  const drawn = styleLine(embed, "![[square-1x1.png]]", []);
  assert.deepEqual(drawn.hidden, []);
  assert.deepEqual(drawn.embeds, [{ from: 0, to: 19, target: "square-1x1.png" }]);
  assert.deepEqual(styleLine(embed, "![[square-1x1.png]]", [{ from: 19, to: 19 }]).embeds, []);
  assert.deepEqual(styleLine(tokens([["url", 4, 23]]), "裸网址 https://example.com", []).marks, [{ from: 4, to: 23, classes: ["cm-url", "cm-underline"] }]);
});

test("inline math is drawn rendered while no selection touches it", () => {
  const text = "式 $x^2$ 和 $y$";
  const math = tokens([
    ["formatting_formatting-math_formatting-math-begin_keyword_math", 2, 3],
    ["math_variable-2", 3, 4],
    ["math_tag", 4, 5],
    ["math_number", 5, 6],
    ["formatting_formatting-math_formatting-math-end_keyword_math_math-", 6, 7],
    ["formatting_formatting-math_formatting-math-begin_keyword_math", 10, 11],
    ["math_variable-2", 11, 12],
    ["formatting_formatting-math_formatting-math-end_keyword_math_math-", 12, 13],
  ]);
  assert.deepEqual(styleLine(math, text, []).math, [{ from: 2, to: 7, tex: "x^2" }, { from: 10, to: 13, tex: "y" }]);
  assert.deepEqual(styleLine(math, text, [{ from: 4, to: 4 }]).math, [{ from: 10, to: 13, tex: "y" }]);
});

test("bullets and numbers are drawn as such whatever the selection; a task's box stands in for its markers", () => {
  const item = tokens([
    ["HyperMD-list-line_HyperMD-list-line-1", 0, 5],
    ["formatting_formatting-list_formatting-list-ul_list-1", 0, 2],
    ["list-1", 2, 5],
  ]);
  const bullet = {
    line: ["HyperMD-list-line", "HyperMD-list-line-1"],
    marks: [
      { from: 0, to: 2, classes: ["cm-formatting", "cm-formatting-list", "cm-formatting-list-ul", "cm-list-1"] },
      { from: 2, to: 5, classes: ["cm-list-1"] },
      { from: 0, to: 1, classes: ["list-bullet"] },
    ],
    hidden: [],
    task: null,
    math: [],
    embeds: [],
  };
  assert.deepEqual(styleLine(item, "- 列表项", []), bullet);
  assert.deepEqual(styleLine(item, "- 列表项", [{ from: 3, to: 3 }]), bullet);
  const nested = tokens([["hmd-list-indent_hmd-list-indent-1", 0, 1], ["formatting_formatting-list_formatting-list-ul_list-2", 1, 3], ["list-2", 3, 5]]);
  assert.deepEqual(styleLine(nested, "\t- 子项", []).marks.at(-1), { from: 1, to: 2, classes: ["list-bullet"] });
  const numbered = tokens([["formatting_formatting-list_formatting-list-ol_list-1", 0, 3], ["list-1", 3, 6]]);
  assert.deepEqual(styleLine(numbered, "1. 有序项", []).marks.at(-1), { from: 0, to: 3, classes: ["list-number"] });

  const task = tokens([
    ["HyperMD-list-line_HyperMD-list-line-1_HyperMD-task-line", 0, 8],
    ["formatting_formatting-list_formatting-list-ul_list-1", 0, 2],
    ["formatting_formatting-task_meta", 2, 5],
    ["list-1", 5, 8],
  ]);
  assert.deepEqual(styleLine(task, "- [ ] 任务", []), {
    line: ["HyperMD-list-line", "HyperMD-list-line-1", "HyperMD-task-line"],
    marks: [{ from: 5, to: 8, classes: ["cm-list-1"] }],
    hidden: [{ from: 0, to: 2 }],
    task: { from: 2, to: 5, checked: false },
    math: [],
    embeds: [],
  });
  assert.equal(styleLine(task, "- [x] 完成", []).task?.checked, true);
  // Touched, the task shows its source, without a bullet beside the brackets.
  assert.deepEqual(styleLine(task, "- [ ] 任务", [{ from: 3, to: 3 }]), {
    line: ["HyperMD-list-line", "HyperMD-list-line-1", "HyperMD-task-line"],
    marks: [
      { from: 0, to: 2, classes: ["cm-formatting", "cm-formatting-list", "cm-formatting-list-ul", "cm-list-1"] },
      { from: 2, to: 5, classes: ["cm-formatting", "cm-formatting-task", "cm-meta"] },
      { from: 5, to: 8, classes: ["cm-list-1"] },
    ],
    hidden: [],
    task: null,
    math: [],
    embeds: [],
  });
});

test("quote markers turn transparent away from selections, and blank lines away from them are marked", () => {
  const quote = tokens([
    ["HyperMD-quote_HyperMD-quote-2", 0, 6],
    ["formatting_formatting-quote_formatting-quote-1_quote_quote-1", 0, 2],
    ["formatting_formatting-quote_formatting-quote-2_quote_quote-2", 2, 4],
    ["quote_quote-2", 4, 6],
  ]);
  const away = styleLine(quote, "> > 嵌套", []);
  assert.deepEqual(away.marks.slice(3), [
    { from: 0, to: 1, classes: ["cm-transparent"] },
    { from: 2, to: 3, classes: ["cm-blockquote-border", "cm-transparent"] },
  ]);
  assert.equal(styleLine(quote, "> > 嵌套", [{ from: 6, to: 6 }]).marks.length, 3);

  assert.deepEqual(styleLine([], "", []), { line: ["vml-blank-line"], marks: [], hidden: [], task: null, math: [], embeds: [] });
  assert.deepEqual(styleLine([], "", [{ from: 0, to: 0 }]).line, []);
});

test("a wrapped line hangs under its quote markers, indentation, list marker with one space and task box", () => {
  const cases: Array<[string, number]> = [
    ["- 项", 2], ["-   项", 2], ["* 项", 2], ["1) 项", 3], ["10. 项", 4], ["- [ ] 任务", 6], ["\t\t- 项", 4], ["-", 1],
    ["> 引用", 2], ["> > 引用", 4], ["> - [ ] 任务", 8], [">", 1], ["  续行", 2], ["\t续行", 1],
    ["普通", 0], ["## 标题", 0], ["1.5 倍", 0], ["**粗**", 0], ["", 0],
  ];
  for (const [line, prefix] of cases) {
    assert.equal(hangingPrefix(line), prefix, JSON.stringify(line));
  }
});
