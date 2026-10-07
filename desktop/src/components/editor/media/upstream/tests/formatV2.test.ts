import test from "node:test";
import assert from "node:assert/strict";

import {
  findV2Blocks,
  mediaKindOf,
  parseMeta,
  resolveRow,
  resolveRowMeta,
  serializeBlock,
  serializeOpener,
  type V2Block,
} from "../src/format/v2.ts";

const doc = [
  '<!-- vml {"v":2,"rows":[{"height":240,"widths":[1,1.4]},{"width":0.6}]} -->', // 0
  "![[a.png]]![[b.png|300]]", // 1
  "![[c.png]]", // 2
  "<!-- /vml -->", // 3
  "  <!-- vml -->", // 4: indented, not an opener
  "![[a.png]]", // 5
  "<!-- /vml -->", // 6: closer without opener
  "<!-- vml -->", // 7
  "![[note]]", // 8: not media
  "<!-- /vml -->", // 9
  "<!-- vml -->", // 10: unclosed, restarted by the next opener
  "<!-- vml -->", // 11
  "![[d.mp4]]", // 12
  "<!-- /vml -->", // 13
  "~~~", // 14
  "<!-- vml -->", // 15
  "![[a.png]]", // 16
  "<!-- /vml -->", // 17
  "~~~", // 18
];

function block(lines: string[], index = 0): V2Block {
  const found = findV2Blocks(lines)[index];
  assert.ok(found, `expected block #${index}`);
  return found;
}

test("finds blocks only at column 0 and outside code", () => {
  assert.deepEqual(
    findV2Blocks(doc).map((found) => [found.openLine, found.closeLine, found.invalidLine]),
    [[0, 3, null], [7, 9, null], [11, 13, null]],
  );
});

test("code, math and comments inside a block are its text, embeds in them included", () => {
  const fenced = block(["<!-- vml -->", "```", "![[a.png]]", "```", "<!-- /vml -->"]);
  assert.deepEqual([fenced.rows.length, fenced.invalidLine, fenced.leftText?.lines], [0, null, ["```", "![[a.png]]", "```"]]);

  const beside = block(["<!-- vml -->", "![[a.png]]", "$$", "x^2", "$$", "%%", "![[b.png]]", "%%", "<!-- /vml -->"]);
  assert.deepEqual([beside.rows.length, beside.rightText?.from, beside.rightText?.to, beside.invalidLine], [1, 2, 7, null]);
  assert.equal(block(["<!-- vml -->", "$$ x $$", "<!-- /vml -->"]).leftText?.lines[0], "$$ x $$");
});

test("a block ends only on a closing comment in plain text", () => {
  // The closing comment inside an unclosed fence is code: the block never closes.
  assert.deepEqual(findV2Blocks(["<!-- vml -->", "```", "<!-- /vml -->"]), []);
  // The next opener starts over.
  assert.equal(findV2Blocks(["<!-- vml -->", "%%", "<!-- /vml -->", "%%", "<!-- vml -->", "文字", "<!-- /vml -->"]).length, 1);
});

test("keeps exact embed source and columns, including embeds with no space between them", () => {
  const [first, second] = block(doc).rows[0]?.embeds ?? [];

  assert.deepEqual(
    [first?.raw, first?.from, first?.to, second?.raw, second?.from, second?.to],
    ["![[a.png]]", 0, 10, "![[b.png|300]]", 10, 24],
  );
  assert.equal(second?.nativeWidth, 300);
  assert.deepEqual(block(doc).lines, doc.slice(0, 4));
});

test("parses wiki targets, alt text and sizes", () => {
  const embeds = block(["<!-- vml -->", "![[folder/a b.png|示意图|300]] ![[c.png#page=2|640x480]] ![[d.webp|说明]]", CLOSE()]).rows[0]?.embeds;

  assert.deepEqual(
    embeds?.map((embed) => [embed.syntax, embed.target, embed.alt, embed.nativeWidth]),
    [["wiki", "folder/a b.png", "示意图", 300], ["wiki", "c.png", "", 640], ["wiki", "d.webp", "说明", null]],
  );
});

test("parses Markdown destinations: encoding, parentheses, angle brackets and titles", () => {
  const embeds = block([
    "<!-- vml -->",
    '![横图](attachments/with%20space.png "标题") ![](image%20(1).png) ![竖图|300](<my pic.jpg>) ![远程](https://example.com/a.webp?x=1)',
    CLOSE(),
  ]).rows[0]?.embeds;

  assert.deepEqual(
    embeds?.map((embed) => [embed.syntax, embed.target, embed.alt, embed.nativeWidth]),
    [
      ["markdown", "attachments/with space.png", "横图", null],
      ["markdown", "image (1).png", "", null],
      ["markdown", "my pic.jpg", "竖图", 300],
      ["markdown", "https://example.com/a.webp?x=1", "远程", null],
    ],
  );
});

test("text between two rows makes the block invalid", () => {
  // A line with anything but media embeds is text; text alone is a text block.
  assert.equal(block(["<!-- vml -->", "![[a.png]] 说明", CLOSE()]).invalidLine, null);
  assert.equal(block(["<!-- vml -->", "![[a.png]]", "说明", "![[b.png]]", CLOSE()]).invalidLine, 2);
  assert.equal(block(["<!-- vml -->", "左", "![[a.png]]", "![[笔记]]", "", "![[b.png]]", CLOSE()]).invalidLine, 3);
});

test("blank body lines are skipped and CRLF is tolerated", () => {
  const found = block(["<!-- vml -->\r", "\r", "![[a.png]]\r", "\r", "![[b.mov]]\r", "<!-- /vml -->\r"]);

  assert.deepEqual(found.rows.map((row) => row.line), [2, 4]);
  assert.equal(found.rows[1]?.embeds[0]?.kind, "video");
});

test("media kinds follow Obsidian's supported formats", () => {
  assert.deepEqual(
    ["a.avif", "a.BMP", "a.svg", "a.ogv", "a.mkv", "a.pdf", "a.mp3", "a"].map(mediaKindOf),
    ["image", "image", "image", "video", "video", null, null, null],
  );
});

test("metadata: missing, broken, wrong version and unknown keys", () => {
  assert.deepEqual(parseMeta(undefined), { meta: { rows: [], extra: {} }, error: null });
  assert.notEqual(parseMeta('{"rows":[{"height":').error, null);
  assert.notEqual(parseMeta("[1,2]").error, null);
  assert.match(parseMeta('{"v":3}').error ?? "", /version/);
  assert.deepEqual(parseMeta('{"v":2,"theme":"dark","rows":[{"height":300,"future":true},{}]}').meta, {
    rows: [{ height: 300, future: true }, {}],
    extra: { theme: "dark" },
  });
});

test("rows that are not a list of objects make the settings unreadable, not silently dropped", () => {
  for (const rows of ['{"0":{"height":300}}', '[{"height":300},5]', '[null]', '"tall"']) {
    const parsed = parseMeta(`{"v":2,"width":0.5,"rows":${rows}}`);
    assert.match(parsed.error ?? "", /rows/, rows);
    assert.deepEqual(parsed.meta, { rows: [], extra: {} });
  }
  // Such a block is shown but never rewritten, so its rows survive.
  const found = block(['<!-- vml {"v":2,"rows":{"0":{"height":300}}} -->', "![[a.png]]", CLOSE()]);
  assert.equal(found.rows.length, 1);
  assert.notEqual(found.metaError, null);
  assert.deepEqual(parseMeta('{"v":2,"rows":[]}'), { meta: { rows: [], extra: {} }, error: null });
});

test("broken metadata keeps the rows and reports the error", () => {
  const found = block(['<!-- vml {"rows":[{"height": -->', "![[a.png]]", CLOSE()]);

  assert.equal(found.rows.length, 1);
  assert.notEqual(found.metaError, null);
  assert.deepEqual(found.meta, { rows: [], extra: {} });
});

test("row settings fall back to defaults when missing or invalid", () => {
  const found = block(doc);

  assert.deepEqual(resolveRow(found, 0), {
    height: 240, widths: [1, 1.4], width: null, align: "center", captions: [null, null], captionAlign: "left",
  });
  assert.equal(resolveRow(found, 1).width, 0.6);
  assert.deepEqual(resolveRow(found, 5), resolveRowMeta({}, 0));

  const invalid = resolveRowMeta({ height: 5000, widths: [1], width: 2, align: "up", captions: ["only one"] }, 2);
  assert.deepEqual(invalid, {
    height: 900, widths: [1, 1], width: null, align: "center", captions: [null, null], captionAlign: "left",
  });
  assert.equal(resolveRowMeta({ widths: [1, -1] }, 2).widths[1], 1);
  assert.equal(resolveRowMeta({ width: 0.5, align: "left" }, 2).align, "center");
});

test("serializes the opener compactly and safely", () => {
  assert.equal(serializeOpener({ rows: [], extra: {} }), "<!-- vml -->");
  assert.equal(serializeOpener({ rows: [{}, {}], extra: {} }), "<!-- vml -->");
  assert.equal(
    serializeOpener({ rows: [{ height: 240, widths: [1, 1.23456] }, {}, { width: undefined }], extra: {} }),
    '<!-- vml {"v":2,"rows":[{"height":240,"widths":[1,1.235]}]} -->',
  );
  assert.equal(
    serializeOpener({ rows: [{ height: 240 }], extra: { theme: "dark" } }),
    '<!-- vml {"v":2,"theme":"dark","rows":[{"height":240}]} -->',
  );
});

test("captions containing -- cannot close the comment and survive a round trip", () => {
  const caption = "a -- b ---> c";
  const opener = serializeOpener({ rows: [{ captions: [caption] }], extra: {} });

  assert.equal(opener.indexOf("--", 4), opener.length - 3);
  assert.equal(block([opener, "![[a.png]]", CLOSE()]).meta.rows[0]?.captions?.toString(), caption);
});

test("captions containing %% keep the block detectable", () => {
  const opener = serializeOpener({ rows: [{ captions: ["增长 %% 左右"] }], extra: {} });

  assert.equal(opener.includes("%"), false);
  assert.deepEqual(block([opener, "![[a.png]]", CLOSE()]).meta.rows[0]?.captions, ["增长 %% 左右"]);
});

test("serializing a parsed block reproduces its embeds verbatim", () => {
  const found = block(doc);
  const lines = serializeBlock(found.meta, found.rows.map((row) => row.embeds));

  assert.deepEqual(lines.slice(1), ["![[a.png]] ![[b.png|300]]", "![[c.png]]", "<!-- /vml -->"]);
  assert.deepEqual(
    block(lines).rows.map((row) => row.embeds.map((embed) => embed.raw)),
    found.rows.map((row) => row.embeds.map((embed) => embed.raw)),
  );
  assert.deepEqual(block(lines).meta, found.meta);
});

function CLOSE(): string {
  return "<!-- /vml -->";
}
