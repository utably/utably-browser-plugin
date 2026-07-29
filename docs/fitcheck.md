# FitCheck — AI Job Fit Analysis

FitCheck is an LLM-powered feature that analyzes how well a job posting matches the user's Utably profile.

## How It Works

1. User clicks **FitCheck** button in the side panel after auto-filling a job posting
2. Extension sends the job details (title, company, location, description, source URL) to `POST /extension/llm` (mode: "fitcheck") — the user profile is never sent from the browser
3. Backend joins the job details with the profile stored in the user's account and runs the analysis via AWS Bedrock (eu-north-1)
4. Results are displayed in the side panel with visual indicators

## Response Structure

```javascript
{
  fitSummary: "Overall assessment text",
  trafficLight: "perfect" | "good" | "partial" | "review",
  confidence: 0-100,
  strengths: ["Top strength 1", "Top strength 2"],
  gaps: ["Concern 1", "Concern 2"],
  qualificationAnalysis: {
    signals: [{ label, match: true/false }]
  },
  skillsBreakdown: {
    matching: ["skill1", "skill2"],
    gaps: ["skill3"],
    bonus: ["skill4"]
  },
  preferencesAlignment: {
    salary: "match" | "partial" | "unknown",
    location: "match" | "partial" | "mismatch",
    remote: "match" | "partial" | "mismatch"
  },
  personalityFit: "Work style assessment text",
  generatedAt: "ISO timestamp"
}
```

## UI Rendering

- **Traffic light badge**: Color-coded indicator (green/yellow/orange/red)
- **Fit score**: Numerical score (0-100) with label
- **Qualification signals**: Checkmarks and crosses for each qualification
- **Skills breakdown**: Three columns — matching, gaps, bonus
- **Preferences**: Icons for salary, location, remote alignment
- **Summary**: Top strengths and concerns

## Tier Gating

- **Premium users**: Full FitCheck results
- **Free/Basic users**: Limited insights with locked sections and upgrade banner linking to subscription page
- Backend returns tier-aware response; frontend renders accordingly

## Caching

- Results are cached in `chrome.storage.local` under `utablyFitCheckCache`
- **TTL**: 24 hours per entry
- **Max entries**: 20 (LRU eviction)
- **Cache key**: Job URL or `title::company` composite
- Stale entries are pruned on each new analysis
