import test from "node:test";
import assert from "node:assert/strict";

import { scanMarkdownLines, type LineContext } from "../src/markdown/lineContext.ts";

function scan(...lines: string[]): LineContext[] {
  return scanMarkdownLines(lines);
}

test("plain lines are text", () => {
  assert.deepEqual(scan("# Title", "![[a.png]]", ""), ["text", "text", "text"]);
});

test("backtick fence marks its delimiters and body as code", () => {
  assert.deepEqual(
    scan("a", "```js", "![[x.png]]", "```", "b"),
    ["text", "code", "code", "code", "text"],
  );
});

test("tilde fence is recognized", () => {
  assert.deepEqual(scan("~~~markdown", "![[x.png]]", "~~~", "b"), ["code", "code", "code", "text"]);
});

test("a longer fence is not closed by a shorter one inside it", () => {
  assert.deepEqual(
    scan("````md", "```js", "x", "```", "````", "after"),
    ["code", "code", "code", "code", "code", "text"],
  );
});

test("a fence is only closed by the same marker", () => {
  assert.deepEqual(scan("~~~", "```", "~~~", "t"), ["code", "code", "code", "text"]);
});

test("an unclosed fence runs to the end of the document", () => {
  assert.deepEqual(scan("t", "```", "![[x.png]]", "more"), ["text", "code", "code", "code"]);
});

test("backticks followed by more backticks on one line are inline code", () => {
  assert.deepEqual(scan("```a```", "t"), ["text", "text"]);
});

test("a closing fence may carry trailing spaces but no info string", () => {
  assert.deepEqual(scan("```", "``` js", "```  ", "t"), ["code", "code", "code", "text"]);
});

test("a quoted fence line does not close a top-level fence", () => {
  assert.deepEqual(scan("```", "> ```", "still code", "```", "t"), ["code", "code", "code", "code", "text"]);
});

test("a fence inside a callout is recognized", () => {
  assert.deepEqual(
    scan("> [!note]", "> ```", "> x", "> ```", "t"),
    ["text", "code", "code", "code", "text"],
  );
});

test("a fence nested in a list item is recognized at deeper indentation", () => {
  assert.deepEqual(
    scan("- a", "  - b", "    ```", "    ![[x.png]]", "    ```", "t"),
    ["text", "text", "code", "code", "code", "text"],
  );
});

test("a fence opened on the same line as a list marker is recognized", () => {
  assert.deepEqual(
    scan("- ```js", "  console.log(1)", "  ```", "正文", "```md", "<!-- vml -->", "```", "t"),
    ["code", "code", "code", "text", "code", "code", "code", "text"],
  );
  assert.deepEqual(scan("1. ~~~", "   x", "   ~~~", "t"), ["code", "code", "code", "text"]);
});

test("a list-marker fence line inside a code block does not close it", () => {
  assert.deepEqual(scan("```", "- ```", "x", "```", "t"), ["code", "code", "code", "code", "text"]);
});

test("a top-level fence closes on up to three spaces of indentation, not four", () => {
  assert.deepEqual(scan("```", "   ```", "t"), ["code", "code", "text"]);
  assert.deepEqual(scan("```", "    ```", "t"), ["code", "code", "code"]);
});

test("fence content is never interpreted", () => {
  assert.deepEqual(scan("```", "<!--", "$$", "%%", "```", "t"), ["code", "code", "code", "code", "code", "text"]);
});

test("frontmatter at the top of the document", () => {
  assert.deepEqual(
    scan("---", "cover: ![[a.png]]", "---", "t"),
    ["frontmatter", "frontmatter", "frontmatter", "text"],
  );
});

test("an unclosed --- on the first line is not frontmatter", () => {
  assert.deepEqual(scan("---", "a"), ["text", "text"]);
});

test("--- blocks later in the document are not frontmatter", () => {
  assert.deepEqual(scan("t", "---", "a", "---"), ["text", "text", "text", "text"]);
});

test("math blocks", () => {
  assert.deepEqual(scan("$$", "x", "$$", "t"), ["math", "math", "math", "text"]);
  assert.deepEqual(scan("$$x = 1$$", "t"), ["math", "text"]);
  assert.deepEqual(
    scan("$$\\begin{aligned}", "a", "\\end{aligned}$$", "t"),
    ["math", "math", "math", "text"],
  );
});

test("a single-line HTML comment is text", () => {
  assert.deepEqual(scan("<!-- vml -->", "t"), ["text", "text"]);
});

test("a multi-line HTML comment is a comment up to its first -->", () => {
  assert.deepEqual(scan("<!--", "hidden", "-->", "t"), ["comment", "comment", "comment", "text"]);
  // HTML comments do not nest: the inner --> ends the outer comment.
  assert.deepEqual(scan("<!--", "<!-- vml -->", "-->"), ["comment", "comment", "text"]);
});

test("an HTML comment that closes and reopens on one line stays open", () => {
  assert.deepEqual(scan("<!--", "a --> b <!--", "c", "-->", "t"), ["comment", "comment", "comment", "comment", "text"]);
});

test("Obsidian %% comments", () => {
  assert.deepEqual(scan("%%", "![[x.png]]", "%%", "t"), ["comment", "comment", "comment", "text"]);
  assert.deepEqual(scan("a %%hidden%% b"), ["text"]);
});

test("an unmatched %% inside a line does not open a multi-line comment", () => {
  assert.deepEqual(
    scan("## 用 %% 注释掉的块", "", "%%", "<!-- vml -->", "%%", "<!-- vml -->"),
    ["comment", "text", "comment", "comment", "comment", "text"],
  );
});

test("comment markers inside inline code are ignored", () => {
  assert.deepEqual(scan("use `%%` or `<!--` here", "t"), ["text", "text"]);
});

test("CRLF line endings", () => {
  assert.deepEqual(scan("```\r", "x\r", "```\r", "t\r"), ["code", "code", "code", "text"]);
});
