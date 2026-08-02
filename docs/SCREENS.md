# App Screens

Captured from the running React app (`app/`) in demo mode, at a 460 px mobile
width. Styling is intentionally restrained for this phase — the focus is
structure, flow and security.

| | |
|---|---|
| **1. Sign in / Sign up**<br>Generic failure message so accounts cannot be enumerated.<br><img src="screens/01-signin.png" width="330"> | **2. Onboarding**<br>Username, languages and CEFR level — these drive AI difficulty.<br><img src="screens/02-onboarding.png" width="330"> |
| **3. Home**<br>Streak, Star Points, today's actions, mascot and friends leaderboard.<br><img src="screens/03-home.png" width="330"> | **4. Vocabulary task**<br>Describe an activity; the server generates level-appropriate words.<br><img src="screens/04-task-generated.png" width="330"> |
| **5. Library**<br>Alphabetical by default; sort by date added, filter by range, search.<br><img src="screens/05-library.png" width="330"> | **6. FRED**<br>Record, transcribe, score. Breakdown across pronunciation, grammar, fluency.<br><img src="screens/06-fred.png" width="330"> |
| **7. Gazelle mascot**<br>Outfits unlock from streak thresholds, validated server-side.<br><img src="screens/07-mascot.png" width="330"> | **8. Friends**<br>Search by username, accept requests, see friends' public stats.<br><img src="screens/08-friends.png" width="330"> |
| **9. Compete**<br>FRED sprint against a friend; scores are written by the server.<br><img src="screens/09-challenge.png" width="330"> | **10. Settings**<br>Profile, level, and the privacy toggle that hides you from search.<br><img src="screens/10-settings.png" width="330"> |

## Flow

```mermaid
flowchart LR
    A[Sign in] --> B[Onboarding]
    B --> C[Home]
    C --> D[New task]
    D --> E[Library]
    C --> F[FRED]
    F -->|score| C
    C --> G[Mascot]
    C --> H[Friends]
    H --> I[Compete]
    I -->|session| F
```

## Reproducing these

```bash
cd app && npm install && npm run dev
```

With no `.env` present the app starts in **demo mode** against an in-memory
store, so every screen is reachable without a Supabase project. Add
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to run against the real
backend.
