// The profile tab's document list, grouped and named the way the app's
// library is: job versions (one per application), masters, uploads, and the
// versions of archived applications last, behind their own toggle.
//
// The server says where each document belongs (`group`, `archived`,
// `projectName`, `companyName`, `jobTitle`) and gives it a readable file
// name; an older server sends none of that, so its exports count as
// masters and everything else as an upload.

export const DOCUMENT_GROUPS = ["version", "master", "upload"];

// Kinds that drop into application forms; photos and bulk exports don't.
const VISIBLE_KINDS = new Set(["cv", "coverletter", "appendix", "certificate", "testimonial", "reference"]);
const EXPORT_KINDS = new Set(["cv", "coverletter", "appendix"]);

function groupOf(doc) {
  if (DOCUMENT_GROUPS.includes(doc?.group)) return doc.group;
  return EXPORT_KINDS.has(doc?.kind) ? "master" : "upload";
}

/**
 * `{ groups: [{ id, items }], archived: [] }` — groups in DOCUMENT_GROUPS
 * order, empty ones left out; the server's order kept inside each.
 */
export function groupDocuments(documents) {
  const byGroup = new Map(DOCUMENT_GROUPS.map((id) => [id, []]));
  const archived = [];
  for (const doc of Array.isArray(documents) ? documents : []) {
    if (!doc || !VISIBLE_KINDS.has(doc.kind)) continue;
    if (doc.archived) archived.push(doc);
    else byGroup.get(groupOf(doc)).push(doc);
  }
  return {
    groups: DOCUMENT_GROUPS.map((id) => ({ id, items: byGroup.get(id) })).filter((g) => g.items.length),
    archived,
  };
}

/**
 * The row's two lines. A version is named by its application ("Utably ·
 * Engineer"), a master by its project, an upload by its file name; the
 * second line says what the document is and when it was made.
 *
 * @param {object} doc
 * @param {{ kindLabel: (kind: string) => string, formatDate: (iso: string) => string }} fmt
 */
export function documentLines(doc, { kindLabel, formatDate }) {
  const group = groupOf(doc);
  const kind = kindLabel(doc.kind) || doc.kind;
  const date = doc.lastModified ? formatDate(doc.lastModified) : "";
  if (group === "version") {
    const title = [doc.companyName, doc.jobTitle].filter(Boolean).join(" · ") || doc.projectName || doc.name;
    const from = doc.companyName && doc.projectName ? doc.projectName : "";
    return { title, detail: [kind, from, date].filter(Boolean).join(" · ") };
  }
  if (group === "master") {
    return { title: doc.projectName || doc.name, detail: [kind, date].filter(Boolean).join(" · ") };
  }
  return { title: doc.name, detail: [kind, date].filter(Boolean).join(" · ") };
}
