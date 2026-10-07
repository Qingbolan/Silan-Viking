import assert from "node:assert/strict";
import test from "node:test";

import { sourceAssertionsMatch } from "../src/layout/sourceAssertions.ts";

const lines = ["Intro", "", "<!-- vml -->", "![[a.png]]", "<!-- /vml -->", "Body"];

test("an empty read set always matches", () => {
  assert.equal(sourceAssertionsMatch(lines, []), true);
  assert.equal(sourceAssertionsMatch([], []), true);
});

test("assertions match when every line is identical at its position", () => {
  assert.equal(sourceAssertionsMatch(lines, [
    { fromLine: 2, lines: ["<!-- vml -->", "![[a.png]]", "<!-- /vml -->"] },
    { fromLine: 0, lines: ["Intro"] },
  ]), true);
});

test("a changed line fails the whole read set", () => {
  assert.equal(sourceAssertionsMatch(lines, [
    { fromLine: 0, lines: ["Intro"] },
    { fromLine: 3, lines: ["![[b.png]]"] },
  ]), false);
});

test("assertions are checked at their line, never relocated by searching", () => {
  assert.equal(sourceAssertionsMatch(lines, [{ fromLine: 2, lines: ["![[a.png]]"] }]), false);
});

test("whitespace differences are not normalised away", () => {
  assert.equal(sourceAssertionsMatch(lines, [{ fromLine: 0, lines: ["Intro "] }]), false);
});

test("out-of-range, negative and empty assertions are rejected", () => {
  assert.equal(sourceAssertionsMatch(lines, [{ fromLine: 5, lines: ["Body", "extra"] }]), false);
  assert.equal(sourceAssertionsMatch(lines, [{ fromLine: 6, lines: ["Body"] }]), false);
  assert.equal(sourceAssertionsMatch(lines, [{ fromLine: -1, lines: ["Intro"] }]), false);
  assert.equal(sourceAssertionsMatch(lines, [{ fromLine: 0, lines: [] }]), false);
});
