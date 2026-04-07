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
  status: "Applied",
  jobUrl: "https://...",
  jobText: "Job description...",
  location: "City, Country",
  recruiter: { name: "Recruiter Name" },
  fitAnalysis: { ... },            // optional, from FitCheck
  interviewDates: [],
  recruiterInteractions: [],
  notes: "",
  interviewRounds: [],
  attachments: "",
  source: "hostname"
}
```

### Duplicate Check
```
POST /extension/import-job/duplicate-check
Authorization: Bearer <accessToken>
Body: { title, company, url }
```
Returns whether an application with matching title/company/URL already exists.

## Analysis Endpoints

### FitCheck
```
POST /extension/llm
Authorization: Bearer <accessToken>
Body: { mode: "fitcheck", jobText: "...", ... }
```
Returns LLM-powered job fit analysis. See [fitcheck.md](fitcheck.md) for response format.
