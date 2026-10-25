# API Reference

All extension API endpoints are hosted on the Utably backend. Authenticated endpoints require `Authorization: Bearer <accessToken>`.

## Authentication Endpoints

### Start Connect Session
```
POST /extension/connect/session/start
```
Initiates a polling session for the OAuth connect flow.

### Poll Session Status
```
GET /extension/connect/session/status
```
Returns connection status. When complete, provides the one-time code.

### Exchange Token
```
POST /extension/token/exchange
Body: { code: string }
```
Exchanges one-time code for access + refresh tokens.

### Refresh Token
```
POST /extension/token/refresh
Authorization: Bearer <refreshToken>
```
Returns new access token (and optionally rotated refresh token).

### Revoke Token
```
POST /extension/token/revoke
Authorization: Bearer <refreshToken>
```
Revokes all tokens and clears auth state.

## Job Import Endpoints

### Import Job
```
POST /extension/import-job
Authorization: Bearer <accessToken>
```

**Payload:**
```javascript
{
  id: "uuid-v4",
  companyName: "Company Name",      // required
  jobTitle: "Job Title",            // required
  applicationDate: "YYYY-MM-DD",
  applicationMethod: "string",
  status: "Applied",                // "Applied" or "Saved" (want-to-apply); other values are coerced to "Applied"
  jobUrl: "https://...",
  jobText: "Job description...",
  location: "City, Country",
  recruiter: { name: "Recruiter Name" },
  fitAnalysis: { ... },            // optional, from FitCheck
  interviewDates: [],
  recruiterInteractions: [],
  notes: "Free-form note from the popup's 'Further notes' field.",
  interviewRounds: [],
  attachments: "",
  source: "hostname"
}
```

`notes` is the user's free-form text from the popup's **Further notes** field (under the source URL). The backend trims and caps it at 20,000 chars and stores it on the application record's `notes` attribute, which is what the web app shows on `/applications/<id>` in the Notes panel.

**Success response (201):**
```json
{
  "id": "uuid-v4",
  "applicationLink": "https://app.utably.com/applications/<id>",
  "status": "Applied"
}
```

### Duplicate Check
```
POST /extension/import-job/duplicate-check
Authorization: Bearer <accessToken>
Body: { title, company, url }
```
Returns whether an application with matching title/company/URL already exists.

## Share Endpoints

### Park a posting to share with a friend
```
POST /extension/share-drafts
Authorization: Bearer <accessToken>
```

Backs the popup's **Send to a friend** action, which passes a posting to a
friend without saving it as an application first.

The extension deliberately does **not** perform the share itself. Writing into
another user's inbox is a cross-user capability, and the access token lives in
browser storage; a stolen token must not gain reach beyond its own account. So
this endpoint only parks the posting in the caller's own partition — the same
trust level `/extension/import-job` already has — and the web app performs the
actual share under the user's session, with the recipients picked there.

The draft is not an application: it does not appear in the user's application
list, does not count toward the application quota, and awards no XP. It carries
a short TTL (15 minutes by default) so an abandoned draft disappears on its own,
and it is deleted once it has been shared.

**Payload** (posting fields only — anything else is dropped server side):
```javascript
{
  jobTitle: "Job Title",        // required
  companyName: "Company Name",  // required
  jobUrl: "https://...",        // must be http(s)
  location: "City, Country",
  positionLevel: "Senior",      // optional; the extension does not send this
  jobText: "Job description..."
}
```

`positionLevel` exists so a parked posting can carry the same field set as a
share made from an application in the web app. The extension has no
seniority field, so it is `null` on anything the extension parks.

**Success response (201):**
```json
{
  "draftId": "uuid-v4",
  "shareUrl": "https://app.utably.com/friends/share?draft=<draftId>",
  "expiresIn": 900
}
```

The extension builds the tab URL itself rather than using `shareUrl`, for the
same reason it builds `applicationLink` itself: the backend does not know about
a locally configured stage port.

Rate limited per user per minute, on a separate counter from
`/extension/import-job` so parking a draft never consumes the daily import
allowance.

### Read a parked posting
```
GET /extension/share-drafts/{id}
Authorization: Bearer <accessToken>
```

Returns the parked posting so the web app can show what is about to be shared.
Owner-scoped by key — a draft id on its own reaches nothing. Expired drafts
return 404 even before the TTL sweep removes them.

**Success response (200):**
```javascript
{
  draft: {
    draftId: "uuid-v4",
    jobTitle: "Job Title",
    companyName: "Company Name",
    jobUrl: "https://..." ,
    location: "City, Country",
    positionLevel: null,
    jobText: "Job description...",
    createdAt: "2026-08-18T10:00:00.000Z"
  }
}
```

## Profile Endpoints

### Get fillable profile
```
GET /extension/profile
Authorization: Bearer <accessToken>
```

Returns a minimised, fillable subset of the user's Utably profile for the autofill flow. Server side adds:

- `Cache-Control: private, no-store, max-age=0`
- `Pragma: no-cache`
- Per-user per-minute rate cap (separate counter from `/extension/import-job`)
- A structured CloudWatch audit log line (`extension.profile.read`) for DSGVO Art. 30 records of processing

**Success response (200):**
```javascript
{
  contact: {
    firstName: "Ada",
    lastName: "Lovelace",
    middleName: "",
    academicTitle: "",
    email: "ada@example.com",
    phone: "+44 20 7946 0958",
    dateOfBirth: "",
    nationality: ""
  },
  address: {
    street: "10 Downing Street",
    houseNumber: "",
    city: "London",
    zip: "SW1A 2AA",
    country: "GB"
  },
  links: {
    linkedin: "https://www.linkedin.com/in/...",
    github: "",
    website: ""
  },
  experience: [
    { id, company, title, location, startDate, endDate, isCurrent, description }
    // up to 10 entries, most recent first
  ],
  education: [
    { id, institution, degree, field, gpa, location, startDate, endDate, currentlyAttending }
    // up to 10 entries
  ],
  skills: {
    hard: ["Python", "TypeScript", ...],   // up to 50
    soft: [...],                            // up to 50
    other: [...],                           // up to 50
    languages: [...]                        // up to 30
  },
  updatedAt: "2026-05-15T12:34:56.789Z"
}
```

**Rate-limited response (429):**
```json
{
  "error": "RATE_LIMITED",
  "message": "Profile read rate limit reached. Please retry shortly.",
  "details": {
    "code": "EXT_PROFILE_MINUTE_RATE_LIMIT",
    "retryAt": "2026-05-15T12:35:00.000Z",
    "limit": 20
  }
}
```

The response shape is deliberately **strictly smaller** than the full Utably
profile. Fields that are not needed for form autofill (preferences,
publications, references, awards, motivation, career compass, etc.) are not
returned. Adding fields requires a backend change and a documentation update
here.

### List saved applications
```
GET /extension/applications
Authorization: Bearer <accessToken>
```

Returns the user's saved/applied jobs for the Saved tab. Headers:

- `Cache-Control: private, no-store, max-age=0`
- `Pragma: no-cache`
- Per-user per-minute rate cap (shared counter with `/extension/profile`)
- Audit log line `extension.applications.list` (CloudWatch, DSGVO Art. 30)

**Success response (200):**
```javascript
{
  applications: [
    {
      id: "uuid-v4",
      jobTitle: "Senior Product Designer",
      companyName: "Stripe",
      location: "Berlin · Hybrid",
      status: "Applied",           // "Saved" | "Applied" | "Interview" | "Offer" | "Rejected"
      applicationDate: "2026-05-12",
      jobUrl: "https://stripe.com/jobs/listing/...",
      source: "linkedin.com",
      createdAt: "2026-05-12T09:30:00.000Z",
      updatedAt: "2026-05-13T08:14:21.000Z"
    }
    // ... newest first
  ]
}
```

Notes, interview rounds, fitAnalysis, recruiter interactions, attachments,
and other application fields are **not returned** — those are fetched
per-application via `GET /extension/applications/{id}` when the Saved tab
opens or re-runs FitCheck. The Saved tab itself renders read-only cards
plus a status `<select>` and a FitCheck score chip.

### Get one saved application
```
GET /extension/applications/{id}
Authorization: Bearer <accessToken>
```

Returns the full application record for the Saved tab's FitCheck rerun
flow. Headers + rate posture identical to the list endpoint; audit log line
`extension.applications.get`.

**Success response (200):**
```javascript
{
  application: {
    id: "uuid-v4",
    jobTitle: "Senior Product Designer",
    companyName: "Stripe",
    location: "Berlin · Hybrid",
    status: "Applied",
    jobUrl: "https://stripe.com/jobs/listing/...",
    jobText: "Job description text used for FitCheck...",
    fitAnalysis: { /* see fitcheck.md */ },
    // ...remaining fields
  }
}
```

The plugin only reads `jobText` (FitCheck input) and `fitAnalysis`
(currently stored shape) from this response.

### Update one saved application
```
PATCH /extension/applications/{id}
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Partial update. The plugin sends one of two payload shapes:

```javascript
// Status change (Saved-tab status select)
{ "status": "Applied" }

// FitCheck rerun (Saved-tab fit chip)
{ "fitAnalysis": { /* see fitcheck.md */ } }
```

`status` is validated against the whitelist `"Saved" | "Applied" |
"Interview" | "Offer" | "Rejected"`. Any other value returns 400.

`fitAnalysis` is stored as-is; the plugin remaps the LLM output before
sending so the persisted shape matches what `/extension/applications/{id}`
will return on the next fetch.

Each mutation is audit-logged (`extension.applications.update` with the
changed-fields list) and rate-limited from the same per-user counter as
the other extension reads.

**Success response (200):** the updated application, same shape as
`GET /extension/applications/{id}`.

### List personal attachments
```
GET /extension/attachments
Authorization: Bearer <accessToken>
```

Returns the user's personal-data file index for the Attachments section on
the profile tab. Lists files under `users/{userId}/personal-data/`,
filtered to office/image extensions (pdf/doc/docx/txt/rtf/png/jpg/jpeg/
webp/gif/heic). Capped at 50 items. Each item includes a presigned S3 URL
with a 5-minute TTL. Same Cache-Control, rate cap, and audit log shape as
applications.

**Success response (200):**
```javascript
{
  attachments: [
    {
      key: "users/{userId}/personal-data/cv/resume-2026.pdf",
      name: "resume-2026.pdf",
      kind: "cv",                // "cv" | "document" | "certificate" | "image" | "export"
      mime: "application/pdf",
      size: 412345,
      lastModified: "2026-05-10T11:33:26.295Z",
      presignedUrl: "https://utably.s3.eu-north-1.amazonaws.com/users/.../resume-2026.pdf?X-Amz-..."
    }
    // ... CVs first, then documents/certificates/images
  ]
}
```

The `presignedUrl` is the only path by which file bytes leave Utably's
perimeter. The plugin fetches it from the **service worker** (not from the
content script) when the user clicks **Upload to page** or **Download**.
See `docs/fill.md` for the injection mechanism.

## Analysis Endpoints

### FitCheck
```
POST /extension/llm
Authorization: Bearer <accessToken>
Body: { mode: "fitcheck", jobText: "...", ... }
```
Returns LLM-powered job fit analysis. See [fitcheck.md](fitcheck.md) for response format.
