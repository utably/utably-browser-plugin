import test from "node:test";
import assert from "node:assert/strict";
import { documentLines, groupDocuments } from "../popup/documents.js";

const fmt = { kindLabel: (k) => ({ cv: "CV", coverletter: "Cover letter", certificate: "Certificate" })[k] || "", formatDate: () => "1 Oct 2026" };

test("documents group as versions, masters, uploads; archived apart; photos hidden", () => {
  const { groups, archived } = groupDocuments([
    { key: "a", kind: "cv", group: "master" },
    { key: "b", kind: "cv", group: "version" },
    { key: "c", kind: "certificate", group: "upload" },
    { key: "d", kind: "coverletter", group: "version", archived: true },
    { key: "e", kind: "image", group: "upload" },
    { key: "f", kind: "reference", group: "upload" },
  ]);
  assert.deepEqual(groups.map((g) => [g.id, g.items.map((i) => i.key)]), [
    ["version", ["b"]],
    ["master", ["a"]],
    ["upload", ["c", "f"]],
  ]);
  assert.deepEqual(archived.map((i) => i.key), ["d"]);
});

test("an older server without groups: exports are masters, the rest uploads", () => {
  const { groups } = groupDocuments([{ key: "x", kind: "cv" }, { key: "y", kind: "certificate" }]);
  assert.deepEqual(groups.map((g) => g.id), ["master", "upload"]);
});

test("rows are named by application, project or file", () => {
  assert.deepEqual(
    documentLines({ group: "version", kind: "cv", companyName: "Utably", jobTitle: "Engineer", projectName: "Main CV", lastModified: "2026-10-01" }, fmt),
    { title: "Utably · Engineer", detail: "CV · Main CV · 1 Oct 2026" },
  );
  assert.deepEqual(
    documentLines({ group: "master", kind: "coverletter", projectName: "Main CV", name: "Main-CV_coverletter.pdf" }, fmt),
    { title: "Main CV", detail: "Cover letter" },
  );
  assert.equal(documentLines({ group: "version", kind: "cv", name: "p_cv.pdf" }, fmt).title, "p_cv.pdf");
  assert.equal(documentLines({ group: "upload", kind: "certificate", name: "Zeugnis.pdf" }, fmt).title, "Zeugnis.pdf");
});
