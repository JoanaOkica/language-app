# Every Screen

<div align="center">
<img src="screens/logo.png" width="260" alt="Cat's Tongue">
</div>

All 33 screens and states of the app, captured from the running client at
460 px width. Regenerate any time with:

```bash
cd app && npm run dev
node scripts/screens.cjs        # writes docs/screens/ + the contact sheet
```

## Contact sheet

[![All screens](screens/all-screens.png)](screens/all-screens.png)

---

## 1 · Getting in

| | | |
|---|---|---|
| **01 Welcome**<br>The signed-out landing page: what the app does, then the two ways in.<br><img src="screens/01-welcome.png" width="230"> | **02 Sign up**<br>Email, password, and the password again.<br><img src="screens/02-signup-empty.png" width="230"> | **03 Weak password**<br>Common passwords are refused, with one thing to fix at a time.<br><img src="screens/03-signup-weak-password.png" width="230"> |
| **04 Mismatch**<br>The two entries must match before the button unlocks.<br><img src="screens/04-signup-mismatch.png" width="230"> | **05 Ready**<br>Meter turns green and sign-up is enabled.<br><img src="screens/05-signup-ready.png" width="230"> | **06 Confirm your email**<br>No session until it's verified; unconfirmed accounts expire in 24 h.<br><img src="screens/06-confirm-email-gate.png" width="230"> |
| **07 Sign in**<br>One generic failure message, so accounts cannot be enumerated.<br><img src="screens/07-signin.png" width="230"> | **08 Forgot password**<br>Enter the address to receive a link.<br><img src="screens/08-forgot-password.png" width="230"> | **09 Link sent**<br>"If an account exists…" — never confirms whether it does.<br><img src="screens/09-forgot-password-sent.png" width="230"> |
| **10 Reset password**<br>Same policy as sign-up; signs you out everywhere afterwards.<br><img src="screens/10-reset-password.png" width="230"> | **11 Set up your den**<br>Avatar, both languages, and level.<br><img src="screens/11-onboarding.png" width="230"> | |

## 2 · Daily use

| | | |
|---|---|---|
| **12 Today**<br>Daily XP goal, streak week, four actions, today's words, league.<br><img src="screens/12-today.png" width="230"> | **13 Plan (empty)**<br>Describe the day ahead in plain language.<br><img src="screens/13-plan-empty.png" width="230"> | **14 Plan (generated)**<br>Words packed for that activity, at your level.<br><img src="screens/14-plan-generated.png" width="230"> |
| **15 Repeat detected**<br>The same routine twice adds nothing — and says so.<br><img src="screens/15-plan-repeat-detected.png" width="230"> | **16 Your words**<br>One card per word, carrying every context it appeared in.<br><img src="screens/16-words.png" width="230"> | **17 Search & filter**<br>A–Z or newest first, filtered by date added.<br><img src="screens/17-words-search.png" width="230"> |

## 3 · FRED

| | |
|---|---|
| **18 Ready to speak**<br>FRED asks; you answer out loud.<br><img src="screens/18-fred-ready.png" width="230"> | **19 Scored**<br>Transcript, score, and a breakdown of pronunciation, grammar and fluency.<br><img src="screens/19-fred-scored.png" width="230"> |

## 4 · Games

| | | |
|---|---|---|
| **20 Games hub**<br>Four games, all built from your own vocabulary.<br><img src="screens/20-games-hub.png" width="230"> | **21 Word Match**<br>Pair each word with its meaning.<br><img src="screens/21-game-word-match.png" width="230"> | **22 Quick Quiz**<br>Pick the right translation, fast.<br><img src="screens/22-game-quick-quiz.png" width="230"> |
| **23 Echo Cat**<br>Hear the word in the language you're learning, then choose it.<br><img src="screens/23-game-echo-cat.png" width="230"> | **24 Sentence Builder**<br>Tap the words into the right order.<br><img src="screens/24-game-sentence-builder.png" width="230"> | **25 Result**<br>Score and XP earned — capped and awarded server-side.<br><img src="screens/25-game-result.png" width="230"> |

## 5 · Social

| | | |
|---|---|---|
| **26 Friends**<br>Requests to answer and friends to compare streaks with.<br><img src="screens/26-friends.png" width="230"> | **27 Search**<br>Find people by username; hidden profiles never appear.<br><img src="screens/27-friends-search.png" width="230"> | **28 New challenge**<br>Pick a friend and a target for a FRED sprint.<br><img src="screens/28-challenges-new.png" width="230"> |
| **29 Challenge running**<br>Scores are written by the server from real sessions.<br><img src="screens/29-challenges-active.png" width="230"> | | |

## 6 · Your den

| | | |
|---|---|---|
| **30 Den**<br>Avatar, languages, level, privacy and account actions.<br><img src="screens/30-den.png" width="230"> | **31 Any language pairing**<br>Portuguese speaker learning French — all 22 pair freely.<br><img src="screens/31-den-language-pairing.png" width="230"> | **32 Same-language guard**<br>You can't "learn" the language you already speak.<br><img src="screens/32-den-same-language-blocked.png" width="230"> |
| **33 Delete account**<br>Type `DELETE` **and** re-enter your password — a stolen session isn't enough.<br><img src="screens/33-den-delete-account.png" width="230"> | | |

---

## Navigation

| Tab | Route | Screens |
|-----|-------|---------|
| Today | `/` | 12 |
| Plan | `/plan` | 13–15 |
| Talk | `/talk` | 18–19 |
| Games | `/games`, `/games/:id` | 20–25 |
| Friends | `/friends` | 26–27 |

`/words` (16–17), `/challenges` (28–29) and `/den` (30–33) are reached from the
Today tiles, the "See all" link, and the avatar button in the header. Signed
out, `/` is the welcome page, with `/signup`, `/signin` and `/reset-password`
alongside it.
