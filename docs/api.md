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
and other application fields are **not returned** — those stay on the web
app side. Plugin renders read-only cards; mutations happen via the web app.

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
