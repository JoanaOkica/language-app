# Account Lifecycle

How an account is created, confirmed, recovered and destroyed — and where each
rule is actually enforced.

## 1. Sign-up

The form asks for **email, password, and the password again**. Before the
request is made the client checks that the password is:

- at least **12 characters**;
- not in the common-password blocklist (compared with trailing digits and
  punctuation stripped, so `Password2024!` is caught as `password`);
- free of keyboard/alphabet runs (`qwerty`, `1234`) and 4+ character repeats;
- built from at least **three** of {lower, upper, digit, symbol};
- not containing the local part of the email address.

A live meter shows strength and **one** thing to fix at a time. The submit
button stays disabled until the password passes and the two entries match.

> These checks are UX only. A client can bypass anything that runs on the
> client, so the authoritative policy is Supabase Auth's own minimum length,
> character requirements and **leaked-password (HaveIBeenPwned) check**, which
> must be enabled in the dashboard — see §6.

## 2. Confirmation gate

`signUp` is called with `options.data = { app: 'linguafox' }` and email
confirmations enabled, so:

- **no session is issued** — the user physically cannot enter the app;
- the UI shows a "confirm your email" screen with a **resend** button;
- `linguafox.ensure_profile()` refuses to create the profile and stats rows
  while `auth.users.email_confirmed_at is null`.

That last point matters: confirmation is enforced **in the database**, not only
by an Auth setting someone could later relax. An unconfirmed account has no
profile, so it has nothing to use.

## 3. The 24-hour expiry

`linguafox.purge_unconfirmed_signups(interval '24 hours')` deletes accounts
where **all four** hold:

| Condition | Why |
|-----------|-----|
| `raw_user_meta_data->>'app' = 'linguafox'` | Scopes the purge to our signups. `auth.users` is shared with the other projects in this Supabase instance — a blanket "delete unconfirmed users" job would delete their pending signups too. |
| `email_confirmed_at is null` | Never verified. |
| `created_at < now() - 24 hours` | Past the grace period. |
| no row in `linguafox.profiles` | Belt and braces — profiles only exist post-confirmation. |

Scheduling, in order of preference:

1. **pg_cron** — `0005_auth_lifecycle.sql` registers an hourly job automatically
   *if* the extension is installed. Enable it once with
   `create extension pg_cron with schema cron;`
2. **`purge-unconfirmed` Edge Function** — call it hourly from any external
   scheduler with an `x-purge-secret` header matching `PURGE_SECRET`.

Could a user of another app tag themselves `linguafox` to get deleted? Only
their own account, and only while unconfirmed — but an unconfirmed user has no
session and therefore cannot call `updateUser` at all. Not exploitable.

## 4. Forgotten password

1. "Forgot your password?" → `resetPasswordForEmail`, redirecting to
   `/reset-password`.
2. The confirmation copy is deliberately neutral — *"If an account exists for
   this address…"* — so the flow cannot be used to test whether an email is
   registered.
3. The link carries a recovery token that Supabase exchanges for a short-lived
   session. **That session is the authorisation.** Opening `/reset-password`
   without it shows "link expired" and can do nothing.
4. The new password goes through the same policy as sign-up, typed twice.
5. On success the user is **signed out everywhere**, so a device still holding
   the old session is evicted rather than silently continuing.

The `/reset-password` route is resolved *before* the auth gate in `App.tsx`,
because the user is not signed in when they arrive.

## 5. Deletion

Two-factor by design, because it is irreversible:

1. Type `DELETE` to confirm.
2. **Re-enter the current password.** The `delete-account` Edge Function
   verifies it server-side with a throwaway client before doing anything, so a
   stolen or borrowed session is not enough on its own.

Then storage objects are removed (foreign keys don't reach them) and the auth
user is deleted, cascading through every Linguafox table.

## 6. Dashboard settings this depends on

These live in Supabase, not in this repository, and the guarantees above assume
them:

- [ ] **Auth → Email → Confirm email: ON** (without it, signups get a session immediately)
- [ ] **Minimum password length: 12**
- [ ] **Password requirements:** lower + upper + digits (or stronger)
- [ ] **Leaked password protection: ON** (HaveIBeenPwned)
- [ ] **Rate limits** on signup / signin / recovery
- [ ] **Site URL and redirect allow-list** — must include your web origin and,
      for the Android build, `com.linguafox.app://` if you use deep links
- [ ] **SMTP configured** — the default Supabase mailer is rate-limited and not
      meant for production
