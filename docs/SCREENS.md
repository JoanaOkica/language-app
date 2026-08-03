# App Screens

Captured from the running React app (`app/`) in demo mode at 460 px width.
Warm cream + orange theme, five-tab navigation, customisable avatars.

### Account lifecycle

| | |
|---|---|
| **Sign-up validation**<br>Weak password blocked, with one fix at a time.<br><img src="screens/a1-signup-weak.png" width="330"> | **Confirm password**<br>Mismatch blocks submission.<br><img src="screens/a2-signup-mismatch.png" width="330"> |
| **Strong password accepted**<br>Meter turns green and submit unlocks.<br><img src="screens/a3-signup-strong.png" width="330"> | **Confirmation gate**<br>No session until the email is verified; 24-hour expiry stated.<br><img src="screens/a4-confirm-gate.png" width="330"> |
| **Forgot password**<br>Neutral wording — never reveals whether an account exists.<br><img src="screens/a7-forgot-password.png" width="330"> | **Reset password**<br>Same policy as sign-up, typed twice.<br><img src="screens/a8-reset-password.png" width="330"> |

### The app

| | |
|---|---|
| **1. Sign in**<br>Generic failure message so accounts cannot be enumerated.<br><img src="screens/01-signin.png" width="330"> | **2. Set up your den**<br>Avatar picker, language chips, and plain-English levels.<br><img src="screens/02-onboarding.png" width="330"> |
| **3. Today**<br>Daily XP goal, week strip, four action tiles, today's words, league.<br><img src="screens/03-today.png" width="330"> | **4. Plan**<br>Describe your day → FRED packs the words you'll need.<br><img src="screens/04-plan.png" width="330"> |
| **5. Repeated routine**<br>Same day described twice adds nothing — and says so.<br><img src="screens/05-plan-repeat.png" width="330"> | **6. Your words**<br>One card per word; "café" carries 3 contexts, not 3 duplicates.<br><img src="screens/06-words.png" width="330"> |
| **7. Talk — FRED**<br>Unchanged speaking coach: record, transcribe, score.<br><img src="screens/07-fred.png" width="330"> | **8. Games**<br>Four mini-games built from the learner's own vocabulary.<br><img src="screens/08-games.png" width="330"> |
| **9. Sentence Builder**<br>Tap the words into the right order.<br><img src="screens/09-game-builder.png" width="330"> | **10. Friends**<br>Search by username, accept requests, compare streaks.<br><img src="screens/10-friends.png" width="330"> |
| **11. Challenges**<br>FRED sprints against a friend, scored server-side.<br><img src="screens/11-challenges.png" width="330"> | **12. Your den**<br>Avatar, languages, level, privacy — and account deletion.<br><img src="screens/12-den.png" width="330"> |
| **13. Delete account**<br>Type-to-confirm before permanent erasure.<br><img src="screens/13-delete-account.png" width="330"> | |

## Navigation

Five tabs, matching the reference design:

| Tab | Route | Purpose |
|-----|-------|---------|
| Today | `/` | Dashboard: goal, streak, tiles, today's words |
| Plan | `/plan` | Describe your day, get vocabulary |
| Talk | `/talk` | FRED, the speaking coach |
| Games | `/games` | Word Match · Quick Quiz · Echo Fox · Sentence Builder |
| Friends | `/friends` | Social graph and leaderboard |

`/words`, `/challenges` and `/den` are reached from the Today tiles, the
"See all" link, and the avatar button in the header.

## Flow

```mermaid
flowchart LR
    A[Sign in] --> B[Set up den]
    B --> C[Today]
    C --> D[Plan]
    D -->|words| E[Your words]
    C --> F[Talk / FRED]
    C --> G[Games]
    C --> H[Challenges]
    C --> I[Friends]
    H -->|sprint| F
    G -->|XP| C
```

## Reproducing these

```bash
cd app && npm install && npm run dev
```

With no `.env` the app runs in demo mode against an in-memory store, so every
screen is reachable without a Supabase project.
