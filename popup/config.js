export const STAGE_CONNECT_URL = {
  prod: "https://app.utably.com/extension/connect",
  dev: "https://app.dev.utably.com/extension/connect",
  test: "https://app.test.utably.com/extension/connect",
};

export const STAGE_APP_URL = {
  prod: "https://app.utably.com",
  dev: "https://app.dev.utably.com",
  test: "https://app.test.utably.com",
};

// Mirrors STAGE_API_BASE in background.js — "local" talks to the dev API.
export const STAGE_API_BASE = {
  prod: "https://api.utably.com",
  dev: "https://api.dev.utably.com",
  test: "https://api.test.utably.com",
  local: "https://api.dev.utably.com",
};

export const DEFAULT_LOCAL_PORT = "5173";

export const EXTRACTION_SCRIPT_FILES = [
  "webpages/common.js",
  "webpages/googlejobs.js",
  "webpages/linkedin.js",
  "webpages/indeed.js",
  "webpages/glassdoor.js",
  "webpages/ziprecruiter.js",
  "webpages/monster.js",
  "webpages/careerbuilder.js",
  "webpages/dice.js",
  "webpages/wellfound.js",
  "webpages/handshake.js",
  "webpages/builtin.js",
  "webpages/usajobs.js",
  "webpages/ukPortals.js",
  "webpages/atsHosted.js",
  "webpages/generic.js",
  "webpages/router.js",
];
