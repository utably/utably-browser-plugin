import test from "node:test";
import assert from "node:assert/strict";
import { buildDocumentTree, editorUrl, filterDocumentTree, versionTitle } from "../popup/documents.js";

const library = [
  {
    projectId: "main",
    projectName: "Main CV",
    favorite: true,
    thumbUrl: "https://s3.example/thumb_cv.jpg",
    versions: [
      { applicationId: "a1", companyName: "Utably", companyDomain: "utably.com", jobTitle: "Engineer", state: "draft" },
      { applicationId: "a2", companyName: "Utably", jobTitle: "Designer", state: "sent", archived: true },
    ],
  },
  { projectId: "empty", projectName: "Englisch", versions: [] },
];
const attachments = [
  { key: "k1", kind: "coverletter", group: "master", projectId: "main" },
  { key: "k2", kind: "cv", group: "master", projectId: "main" },
  { key: "k3", kind: "cv", group: "version", projectId: "main", applicationId: "a1" },
  { key: "k4", kind: "cv", group: "version", projectId: "main", applicationId: "a2", archived: true },
  { key: "k5", kind: "certificate", group: "upload", name: "Zeugnis Müller.pdf" },
  { key: "k6", kind: "image", group: "upload", name: "me.jpg" },
];

test("masters in the library's order, documents and versions under them", () => {
  const tree = buildDocumentTree(attachments, library);
  assert.deepEqual(tree.masters.map((m) => m.projectId), ["main", "empty"]);
  const main = tree.masters[0];
  assert.deepEqual(main.docs.map((d) => d.key), ["k2", "k1"]); // CV before the letter
  assert.deepEqual(main.versions.map((v) => [v.applicationId, v.docs.map((d) => d.key)]), [["a1", ["k3"]]]);
  assert.deepEqual(main.archivedVersions.map((v) => v.applicationId), ["a2"]);
  assert.deepEqual(tree.masters[1].docs, []); // listed even without a PDF (edit link)
  assert.equal(main.thumbUrl, "https://s3.example/thumb_cv.jpg");
  assert.equal(tree.masters[1].thumbUrl, "");
  assert.equal(main.versions[0].companyDomain, "utably.com");
  assert.deepEqual(tree.uploads.map((d) => d.key), ["k5"]); // photos hidden
});

test("a master deleted in the app is not shown, even though its PDFs remain", () => {
  const stale = [...attachments, { key: "k7", kind: "cv", group: "master", projectId: "deleted" }];
  assert.deepEqual(buildDocumentTree(stale, library).masters.map((m) => m.projectId), ["main", "empty"]);
});

test("an older server without a library still groups by the files", () => {
  const tree = buildDocumentTree(attachments.map(({ group, ...d }) => ({ ...d, projectName: "Main CV" })), null);
  assert.equal(tree.masters.length, 1);
  assert.deepEqual(tree.uploads.map((d) => d.key), ["k5"]);
});

test("filter: master name keeps its versions; company / role finds versions, archived included; uploads by name", () => {
  const tree = buildDocumentTree(attachments, library);
  assert.deepEqual(filterDocumentTree(tree, "main").masters.map((m) => m.projectId), ["main"]);
  const designer = filterDocumentTree(tree, "designer utably");
  assert.deepEqual(designer.masters[0].versions.map((v) => v.applicationId), ["a2"]);
  assert.deepEqual(designer.uploads, []);
  assert.deepEqual(filterDocumentTree(tree, "muller").uploads.map((d) => d.key), ["k5"]);
  assert.equal(filterDocumentTree(tree, "").masters.length, 2);
});

test("editor links follow the app's routes", () => {
  assert.equal(editorUrl("https://app.utably.com/", "main"), "https://app.utably.com/editor/main");
  assert.equal(editorUrl("https://app.utably.com", "main", "a1"), "https://app.utably.com/editor/main?for=a1");
  assert.equal(editorUrl("", "main"), "");
  assert.equal(versionTitle({ companyName: "Utably", jobTitle: "Engineer" }), "Utably · Engineer");
});
