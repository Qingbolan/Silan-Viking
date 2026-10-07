import test from "node:test";
import assert from "node:assert/strict";

import {
  continueList,
  cycleTask,
  indentLine,
  insertTag,
  internalLink,
  keyName,
  lineDiff,
  linkQueryAt,
  markdownLink,
  outdentLine,
  setHeading,
  toggleBullet,
  toggleFormatting,
  toggleNumbered,
  toggleQuote,
  toggleTask,
} from "../src/markdown/columnEditing.ts";

// What the note's editor of Obsidian 1.13.7 does in the same places (docs/DESIGN.md, section 4.2).

test("Tab indents the whole line after its quote markers, and Shift+Tab takes a level out", () => {
  assert.equal(indentLine("abc", "\t"), "\tabc");
  assert.equal(indentLine("- abc", "\t"), "\t- abc");
  assert.equal(indentLine("## abc", "\t"), "\t## abc");
  assert.equal(indentLine("> abc", "\t"), "> \tabc");
  assert.equal(indentLine("> - abc", "\t"), "> \t- abc");
  assert.equal(indentLine("", "\t"), "\t");
  assert.equal(outdentLine("\tabc", "\t", 4), "abc");
  assert.equal(outdentLine("\t\tabc", "\t", 4), "\tabc");
  assert.equal(outdentLine("    abc", "\t", 4), "abc");
  assert.equal(outdentLine("  abc", "\t", 4), "abc");
  assert.equal(outdentLine("> \t- abc", "\t", 4), "> - abc");
  assert.equal(outdentLine("> - abc", "\t", 4), "> - abc");
  assert.equal(outdentLine("abc", "\t", 4), "abc");
  assert.equal(outdentLine("      abc", "    ", 4), "  abc");
});

test("Enter continues a list item or a quote with the same markers, the next number and an unchecked box", () => {
  assert.deepEqual(continueList("- 项一", 4, "\t"), { from: 4, to: 4, insert: "\n- ", cursor: 7 });
  assert.deepEqual(continueList("\t* 子项", 5, "\t"), { from: 5, to: 5, insert: "\n\t* ", cursor: 9 });
  assert.deepEqual(continueList("9. 九", 4, "\t"), { from: 4, to: 4, insert: "\n10. ", cursor: 9 });
  assert.deepEqual(continueList("1) 一", 4, "\t"), { from: 4, to: 4, insert: "\n2) ", cursor: 8 });
  assert.deepEqual(continueList("- [x] 完成", 8, "\t"), { from: 8, to: 8, insert: "\n- [ ] ", cursor: 15 });
  assert.deepEqual(continueList("> 引用", 4, "\t"), { from: 4, to: 4, insert: "\n> ", cursor: 7 });
  assert.deepEqual(continueList("> - 引用里的项", 9, "\t"), { from: 9, to: 9, insert: "\n> - ", cursor: 14 });
  // In the middle of an item, the rest of it goes into the new one.
  assert.deepEqual(continueList("- 前后", 3, "\t"), { from: 3, to: 3, insert: "\n- ", cursor: 6 });
});

test("Enter on an empty item moves it up a level when nested and ends the list or quote otherwise", () => {
  assert.deepEqual(continueList("\t- ", 3, "\t"), { from: 0, to: 1, insert: "", cursor: 2 });
  assert.deepEqual(continueList("    - ", 6, "  "), { from: 0, to: 4, insert: "  ", cursor: 4 });
  assert.deepEqual(continueList("- ", 2, "\t"), { from: 0, to: 2, insert: "", cursor: 0 });
  assert.deepEqual(continueList("- [ ]", 5, "\t"), { from: 0, to: 5, insert: "", cursor: 0 });
  assert.deepEqual(continueList("> - ", 4, "\t"), { from: 2, to: 4, insert: "", cursor: 2 });
  assert.deepEqual(continueList("> ", 2, "\t"), { from: 0, to: 2, insert: "", cursor: 0 });
  assert.deepEqual(continueList("> > ", 4, "\t"), { from: 0, to: 4, insert: "> ", cursor: 2 });
});

test("Enter elsewhere is an ordinary line break", () => {
  assert.equal(continueList("普通文字", 2, "\t"), null);
  assert.equal(continueList("- 项", 1, "\t"), null);
  assert.equal(continueList("1.5 倍", 5, "\t"), null);
});

test("Ctrl+B and the like put markers around a selection, on each of its lines, or take away the ones just inside or around it", () => {
  assert.deepEqual(toggleFormatting("abc def", 4, 7, "**", [], null), {
    changes: [{ from: 4, to: 4, insert: "**" }, { from: 7, to: 7, insert: "**" }],
    anchor: 6,
    head: 9,
  });
  const bold = "abc **def** g";
  const markers = [{ from: 4, to: 6 }, { from: 9, to: 11 }];
  const unbolded = { changes: [{ from: 4, to: 6, insert: "" }, { from: 9, to: 11, insert: "" }], anchor: 4, head: 7 };
  assert.deepEqual(toggleFormatting(bold, 6, 9, "**", markers, null), unbolded);
  assert.deepEqual(toggleFormatting(bold, 4, 11, "**", markers, null), unbolded);
  // Italic inside bold text goes in beside the bold markers, which are not italic's.
  assert.deepEqual(toggleFormatting(bold, 6, 9, "*", [], null), {
    changes: [{ from: 6, to: 6, insert: "*" }, { from: 9, to: 9, insert: "*" }],
    anchor: 7,
    head: 10,
  });
  // A selection over two lines gets markers on each of them.
  assert.deepEqual(toggleFormatting("abc\ndef", 1, 6, "~~", [], null), {
    changes: [
      { from: 1, to: 1, insert: "~~" },
      { from: 3, to: 3, insert: "~~" },
      { from: 4, to: 4, insert: "~~" },
      { from: 6, to: 6, insert: "~~" },
    ],
    anchor: 3,
    head: 12,
  });
});

test("without a selection, the formatting around the cursor comes out, the word at the cursor gets it, or an empty pair goes in and out", () => {
  const bold = "abc **def** g";
  const markers = [{ from: 4, to: 6 }, { from: 9, to: 11 }];
  const word = { from: 6, to: 9 };
  assert.deepEqual(toggleFormatting(bold, 7, 7, "**", markers, word), {
    changes: [{ from: 4, to: 6, insert: "" }, { from: 9, to: 11, insert: "" }],
    anchor: 5,
    head: 5,
  });
  // Right before the closing marker the cursor steps over it; right after the opening one nothing happens.
  assert.deepEqual(toggleFormatting(bold, 9, 9, "**", markers, word), { changes: [], anchor: 11, head: 11 });
  assert.deepEqual(toggleFormatting(bold, 6, 6, "**", markers, word), { changes: [], anchor: 6, head: 6 });

  // The word at the cursor gets the markers; at its end the cursor ends up after them.
  const wrapped = [{ from: 2, to: 2, insert: "**" }, { from: 5, to: 5, insert: "**" }];
  assert.deepEqual(toggleFormatting("x abc y", 4, 4, "**", [], { from: 2, to: 5 }), { changes: wrapped, anchor: 6, head: 6 });
  assert.deepEqual(toggleFormatting("x abc y", 2, 2, "**", [], { from: 2, to: 5 }), { changes: wrapped, anchor: 4, head: 4 });
  assert.deepEqual(toggleFormatting("x abc y", 5, 5, "**", [], { from: 2, to: 5 }), { changes: wrapped, anchor: 9, head: 9 });
  // Chinese text without spaces is one word, as the note's editor takes it.
  assert.deepEqual(toggleFormatting("中文句子测试", 2, 2, "*", [], { from: 0, to: 6 }), {
    changes: [{ from: 0, to: 0, insert: "*" }, { from: 6, to: 6, insert: "*" }],
    anchor: 3,
    head: 3,
  });

  assert.deepEqual(toggleFormatting("x  y", 2, 2, "**", [], null), { changes: [{ from: 2, to: 2, insert: "****" }], anchor: 4, head: 4 });
  assert.deepEqual(toggleFormatting("a****b", 3, 3, "**", [], null), { changes: [{ from: 1, to: 5, insert: "" }], anchor: 1, head: 1 });
  assert.deepEqual(toggleFormatting("a**b", 2, 2, "*", [], null), { changes: [{ from: 1, to: 3, insert: "" }], anchor: 1, head: 1 });
  // An empty bold pair is not taken for an italic one.
  assert.deepEqual(toggleFormatting("a****b", 3, 3, "*", [], null), { changes: [{ from: 3, to: 3, insert: "**" }], anchor: 4, head: 4 });
});

test("Ctrl+K makes a Markdown link of the selection, an address included, and the link commands put in [[ ]] and #", () => {
  assert.deepEqual(markdownLink("see text", 4, 8), { changes: [{ from: 4, to: 8, insert: "[text]()" }], anchor: 11, head: 11 });
  assert.deepEqual(markdownLink("x https://a.b", 2, 13), { changes: [{ from: 2, to: 13, insert: "[https://a.b]()" }], anchor: 16, head: 16 });
  assert.deepEqual(markdownLink("ab", 1, 1), { changes: [{ from: 1, to: 1, insert: "[]()" }], anchor: 2, head: 2 });

  assert.deepEqual(internalLink("x abc y", 2, 5, false), { changes: [{ from: 2, to: 5, insert: "[[abc]]" }], anchor: 7, head: 7 });
  assert.deepEqual(internalLink("x abc y", 4, 4, false), { changes: [{ from: 4, to: 4, insert: "[[]]" }], anchor: 6, head: 6 });
  assert.deepEqual(internalLink("x ", 2, 2, true), { changes: [{ from: 2, to: 2, insert: "![[]]" }], anchor: 5, head: 5 });
  assert.deepEqual(insertTag(2, 5), { changes: [{ from: 2, to: 2, insert: "#" }], anchor: 3, head: 3 });
});

test("the list, task, quote and heading commands rewrite lines as in the note's editor", () => {
  const lines: Record<string, string> = {
    plain: "abc",
    list: "- abc",
    task: "- [ ] abc",
    done: "- [x] abc",
    numbered: "1. abc",
    quote: "> abc",
    heading: "## abc",
    nested: "  - abc",
    empty: "",
  };
  const expected: Record<string, Record<string, string>> = {
    toggleTask: {
      plain: "- [ ] abc", list: "- [ ] abc", task: "- [x] abc", done: "- [ ] abc", numbered: "1. [ ] abc",
      quote: "> - [ ] abc", heading: "- [ ] ## abc", nested: "  - [ ] abc", empty: "- [ ] ",
    },
    cycleTask: {
      plain: "- abc", list: "- [ ] abc", task: "- [x] abc", done: "- abc", numbered: "1. [ ] abc",
      quote: "> - abc", heading: "- ## abc", nested: "  - [ ] abc", empty: "- ",
    },
    toggleBullet: {
      plain: "- abc", list: "abc", task: "- abc", done: "- abc", numbered: "- abc",
      quote: "> - abc", heading: "- ## abc", nested: "  abc", empty: "- ",
    },
    toggleNumbered: {
      plain: "1. abc", list: "1. abc", task: "1. abc", done: "1. abc", numbered: "abc",
      quote: "> 1. abc", heading: "1. ## abc", nested: "  1. abc", empty: "1. ",
    },
    toggleQuote: {
      plain: "> abc", list: "> - abc", task: "> - [ ] abc", done: "> - [x] abc", numbered: "> 1. abc",
      quote: "abc", heading: "> ## abc", nested: ">   - abc", empty: "> ",
    },
    heading2: {
      plain: "## abc", list: "## - abc", task: "## - [ ] abc", done: "## - [x] abc", numbered: "## 1. abc",
      quote: "> ## abc", heading: "## abc", nested: "  ## - abc", empty: "## ",
    },
    heading0: {
      plain: "abc", list: "- abc", task: "- [ ] abc", done: "- [x] abc", numbered: "1. abc",
      quote: "> abc", heading: "abc", nested: "  - abc", empty: "",
    },
  };
  const commands: Record<string, (line: string) => string> = {
    toggleTask,
    cycleTask,
    toggleBullet,
    toggleNumbered: (line) => toggleNumbered([line])[0] ?? "",
    toggleQuote,
    heading2: (line) => setHeading(line, 2),
    heading0: (line) => setHeading(line, 0),
  };
  for (const [command, run] of Object.entries(commands)) {
    for (const [name, line] of Object.entries(lines)) {
      assert.equal(run(line), expected[command]?.[name], `${command} on ${name}`);
    }
  }
  assert.deepEqual(toggleNumbered(["abc", "def"]), ["1. abc", "2. def"]);
});

test("a rewritten line changes only between the parts it shares with the old one", () => {
  assert.deepEqual(lineDiff("abc", "- [ ] abc"), { from: 0, to: 0, insert: "- [ ] " });
  assert.deepEqual(lineDiff("- [x] abc", "- abc"), { from: 2, to: 6, insert: "" });
  assert.deepEqual(lineDiff("- [ ] abc", "- [x] abc"), { from: 3, to: 4, insert: "x" });
  assert.equal(lineDiff("abc", "abc"), null);
});

test("the link typed after [[ is found up to the cursor, with the ]] after it", () => {
  assert.deepEqual(linkQueryAt("x [[te]]", 6), { from: 2, text: "te", to: 8, embed: false });
  assert.deepEqual(linkQueryAt("x ![[pic", 8), { from: 3, text: "pic", to: 8, embed: true });
  assert.deepEqual(linkQueryAt("[[note#head]]", 11), { from: 0, text: "note#head", to: 13, embed: false });
  assert.deepEqual(linkQueryAt("x [[]]", 4), { from: 2, text: "", to: 6, embed: false });
  assert.equal(linkQueryAt("[[a]] b", 7), null);
  assert.equal(linkQueryAt("[[a|b", 5), null);
  assert.equal(linkQueryAt("x [a", 4), null);
  assert.equal(linkQueryAt("x [[", 3), null);
});

test("link completion leaves existing aliases and image sizes alone", () => {
  for (const line of ["[[old|alias]]", "![[old.png|40]]", "![[old.png|40x60]]", "[[old|unfinished"]) {
    const start = line.indexOf("[[") + 2;
    const pipe = line.indexOf("|");
    for (let at = start; at <= pipe; at += 1) {
      assert.equal(linkQueryAt(line, at), null, `${line} at ${at}`);
    }
  }
  // The rest of an ordinary target is replaced; a pipe after the closed link is unrelated.
  assert.deepEqual(linkQueryAt("[[old]] | prose", 3), { from: 0, text: "o", to: 7, embed: false });
  assert.deepEqual(linkQueryAt("![[old.png]]", 5), { from: 1, text: "ol", to: 12, embed: true });
});

test("Obsidian's hotkeys are named as CodeMirror's keymaps name keys", () => {
  assert.equal(keyName(["Mod"], "B"), "Mod-b");
  assert.equal(keyName(["Mod", "Shift"], "l"), "Mod-Shift-l");
  assert.equal(keyName(["Alt"], "ArrowUp"), "Alt-ArrowUp");
  assert.equal(keyName([], "F5"), "F5");
  assert.equal(keyName(["Ctrl"], " "), "Ctrl-Space");
  assert.equal(keyName(["Mod"], ""), null);
});
