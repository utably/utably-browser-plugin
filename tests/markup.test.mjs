// popup.html structure. A stray </div> once closed the capture form early
// and every field after it showed on the Profile and Saved tabs too.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../popup.html", import.meta.url), "utf8");
const markup = html.replace(/<!--[\s\S]*?-->/g, "");

test("popup.html opens and closes the same number of <div>s", () => {
  const opened = (markup.match(/<div\b/g) || []).length;
  const closed = (markup.match(/<\/div>/g) || []).length;
  assert.equal(closed, opened);
});

test("no element closes before its parent's section ends: every </div> has an open <div>", () => {
  let depth = 0;
  for (const tag of markup.match(/<div\b|<\/div>/g) || []) {
    depth += tag === "</div>" ? -1 : 1;
    assert.ok(depth >= 0, "a </div> closes more than was opened");
  }
});
