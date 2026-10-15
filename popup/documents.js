// The profile tab's documents, laid out like the app's /utably-editor
// library: each master, and under it one version per application; opening a
// row shows its CV, cover letter and appendix. Uploads come last. Archived
// applications' versions stay behind a per-master toggle.
//
// The server sends `library` (masters → versions, already in the app's
// order) and `attachments` (the files, each with projectId / applicationId /
// group). An older server sends only the files; the tree is then built from
// them alone.

// Kinds that drop into application forms; photos and bulk exports don't.
const VISIBLE_KINDS = new Set(["cv", "coverletter", "appendix", "certificate", "testimonial", "reference"]);
const EXPORT_KINDS = new Set(["cv", "coverletter", "appendix"]);
const KIND_ORDER = ["cv", "coverletter", "appendix"];

function groupOf(doc) {
  if (["version", "master", "upload"].includes(doc?.group)) return doc.group;
  return EXPORT_KINDS.has(doc?.kind) ? "master" : "upload";
}

const byKind = (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);

/**
 * → { masters: [{ projectId, projectName, favorite, thumbUrl, docs, versions, archivedVersions }], uploads }
 * Versions: { applicationId, companyName, companyDomain, jobTitle, state, archived, docs }.
 */
export function buildDocumentTree(attachments, library) {
  const docs = (Array.isArray(attachments) ? attachments : []).filter((d) => d && VISIBLE_KINDS.has(d.kind));
  const uploads = docs.filter((d) => groupOf(d) === "upload");
  const exports = docs.filter((d) => groupOf(d) !== "upload");

  const masters = new Map();
  const masterOf = (projectId, projectName = "") => {
    const id = String(projectId || "");
    if (!masters.has(id)) {
      masters.set(id, { projectId: id, projectName, favorite: false, thumbUrl: "", docs: [], versions: new Map() });
    }
    const m = masters.get(id);
    if (!m.projectName && projectName) m.projectName = projectName;
    return m;
  };
  const versionOf = (master, applicationId, seed = {}) => {
    const id = String(applicationId || "");
    if (!master.versions.has(id)) {
      master.versions.set(id, {
        applicationId: id,
        companyName: seed.companyName || "",
        companyDomain: seed.companyDomain || "",
        jobTitle: seed.jobTitle || "",
        state: seed.state || "",
        archived: Boolean(seed.archived),
        docs: [],
      });
    }
    return master.versions.get(id);
  };

  // The app's order first, when the server sent it.
  for (const m of Array.isArray(library) ? library : []) {
    if (!m?.projectId) continue;
    const master = masterOf(m.projectId, m.projectName || "");
    master.favorite = Boolean(m.favorite);
    master.thumbUrl = typeof m.thumbUrl === "string" ? m.thumbUrl : "";
    for (const v of Array.isArray(m.versions) ? m.versions : []) {
      if (v?.applicationId) versionOf(master, v.applicationId, v);
    }
  }

  // With a library, a master that is not in it was deleted in the app; its
  // old PDFs are still stored but no longer shown.
  const live = Array.isArray(library) ? new Set(masters.keys()) : null;
  for (const doc of exports) {
    if (live && !live.has(String(doc.projectId || ""))) continue;
    const master = masterOf(doc.projectId || doc.key, doc.projectName || "");
    if (groupOf(doc) === "version") {
      // A version whose application is gone still keeps its files.
      const version = versionOf(master, doc.applicationId || `file:${doc.key}`, doc);
      version.docs.push(doc);
    } else {
      master.docs.push(doc);
    }
  }

  return {
    masters: [...masters.values()].map((m) => {
      const versions = [...m.versions.values()].map((v) => ({ ...v, docs: v.docs.sort(byKind) }));
      return {
        projectId: m.projectId,
        projectName: m.projectName,
        favorite: m.favorite,
        thumbUrl: m.thumbUrl,
        docs: m.docs.sort(byKind),
        versions: versions.filter((v) => !v.archived),
        archivedVersions: versions.filter((v) => v.archived),
      };
    }),
    uploads,
  };
}

function fold(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Only what matches every word of `query`: a master by its name (then with
 * all its versions), a version by company or job title, an upload by file
 * name. Archived versions match too, so a search finds them.
 */
export function filterDocumentTree(tree, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return tree;
  const hit = (...texts) => {
    const hay = fold(texts.filter(Boolean).join(" "));
    return words.every((w) => hay.includes(w));
  };
  const masters = [];
  for (const m of tree.masters) {
    if (hit(m.projectName)) {
      masters.push(m);
      continue;
    }
    const match = (v) => hit(v.companyName, v.jobTitle, m.projectName);
    const versions = m.versions.filter(match);
    const archivedVersions = m.archivedVersions.filter(match);
    if (versions.length || archivedVersions.length) {
      // Found archived versions are shown, not hidden behind the toggle.
      masters.push({ ...m, versions: [...versions, ...archivedVersions], archivedVersions: [] });
    }
  }
  return { masters, uploads: tree.uploads.filter((d) => hit(d.name)) };
}

/** A version's title: "Utably · Engineer", else whatever names it. */
export function versionTitle(version) {
  return [version.companyName, version.jobTitle].filter(Boolean).join(" · ") || version.docs?.[0]?.name || "";
}

/** The editor link for a master or one of its versions (jobVersionPath). */
export function editorUrl(appUrl, projectId, applicationId = "") {
  const base = String(appUrl || "").replace(/\/+$/, "");
  if (!base || !projectId) return "";
  const path = `${base}/editor/${encodeURIComponent(projectId)}`;
  if (!applicationId || String(applicationId).startsWith("file:")) return path;
  return `${path}?${new URLSearchParams({ for: applicationId }).toString()}`;
}
