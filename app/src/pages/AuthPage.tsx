import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../lib/api";
import { useSession } from "../lib/session";
import { isDemo } from "../lib/supabase";
import { demo } from "../lib/demo";
import { checkPassword, isValidEmail, MIN_LENGTH } from "../lib/password";
import PasswordMeter from "../components/PasswordMeter";
import { CatLockup } from "../components/CatLogo";

type Mode = "signin" | "signup" | "forgot";

export default function AuthPage({ initialMode = "signin" }: { initialMode?: Mode }) {
  const { refresh, unconfirmed } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(initialMode);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);   // confirmation sent
  const [resetSent, setResetSent] = useState(false);
  const [resent, setResent] = useState(false);

  const verdict = checkPassword(password, email);
  const mismatch = confirm.length > 0 && password !== confirm;

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPassword("");
    setConfirm("");
    setResetSent(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "forgot") {
        await auth.requestPasswordReset(email.trim());
        setResetSent(true);
      } else if (mode === "signup") {
        // Both checks are UX only — Supabase Auth enforces the real policy.
        if (!verdict.ok) {
          setError(verdict.problem ?? `Use at least ${MIN_LENGTH} characters.`);
          return;
        }
        if (password !== confirm) {
          setError("The two passwords don't match.");
          return;
        }
        await auth.signUp(email.trim(), password);
        setSentTo(email.trim());
      } else {
        await auth.signIn(email.trim(), password);
        await refresh();
      }
    } catch (err) {
      const msg = (err as Error).message ?? "";
      // Deliberately generic on sign-in: distinguishing "wrong password" from
      // "no such account" would let an attacker enumerate registered emails.
      if (mode === "signin") {
        setError(/not confirmed|confirm/i.test(msg)
          ? "Confirm your email address first — check your inbox."
          : "Email or password is incorrect.");
      } else {
        setError(msg || "Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  }

  /* ---------- after signup: waiting for confirmation ---------- */
  if (sentTo) {
    return (
      <Shell>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>📬</div>
          <h2 style={{ marginTop: 8 }}>Confirm your email</h2>
          <p className="sub" style={{ marginTop: 8 }}>
            We sent a link to <strong>{sentTo}</strong>. Click it to activate your account.
          </p>
          <p className="sub" style={{ marginTop: 12, fontSize: 12.5 }}>
            You can't sign in until it's confirmed, and unconfirmed accounts are
            deleted after 24 hours.
          </p>

          <button className="full ghost" style={{ marginTop: 18 }} disabled={resent}
                  onClick={async () => {
                    try { await auth.resendConfirmation(sentTo); setResent(true); }
                    catch { setResent(true); }
                  }}>
            {resent ? "Email re-sent ✓" : "Resend the email"}
          </button>

          {isDemo && (
            <button className="full" style={{ marginTop: 9 }}
                    onClick={async () => { await demo.confirmEmail(); await refresh(); }}>
              Simulate confirmation (demo only)
            </button>
          )}

          <button className="link" style={{ marginTop: 16 }}
                  onClick={() => { setSentTo(null); switchMode("signin"); }}>
            Back to sign in
          </button>
        </div>
      </Shell>
    );
  }

  /* ---------- forgot password: link sent ---------- */
  if (resetSent) {
    return (
      <Shell>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>🔑</div>
          <h2 style={{ marginTop: 8 }}>Check your inbox</h2>
          <p className="sub" style={{ marginTop: 8 }}>
            If an account exists for <strong>{email.trim()}</strong>, we've sent a
            link to reset the password. It expires in one hour.
          </p>
          <button className="full ghost" style={{ marginTop: 18 }}
                  onClick={() => switchMode("signin")}>
            Back to sign in
          </button>
        </div>
      </Shell>
    );
  }

  /* ---------- the form ---------- */
  return (
    <Shell>
      <form className="card" onSubmit={submit}>
        <h2>
          {mode === "signin" ? "Welcome back"
            : mode === "signup" ? "Create your account"
            : "Reset your password"}
        </h2>

        {mode === "forgot" && (
          <p className="sub" style={{ marginTop: 6 }}>
            Enter your email and we'll send you a link.
          </p>
        )}

        {unconfirmed && mode === "signin" && !error && (
          <div className="error" role="alert" style={{ marginTop: 14 }}>
            That account hasn't been confirmed yet. Check your inbox for the link.
          </div>
        )}
        {error && <div className="error" role="alert" style={{ marginTop: 14 }}>{error}</div>}

        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="email" required inputMode="email"
               value={email} onChange={(e) => setEmail(e.target.value)}
               placeholder="you@example.com" />

        {mode !== "forgot" && (
          <>
            <label htmlFor="password">Password</label>
            <input id="password" type="password" required
                   autoComplete={mode === "signin" ? "current-password" : "new-password"}
                   value={password} onChange={(e) => setPassword(e.target.value)} />
          </>
        )}

        {mode === "signup" && (
          <>
            <PasswordMeter verdict={verdict} />

            <label htmlFor="confirm">Confirm password</label>
            <input id="confirm" type="password" required autoComplete="new-password"
                   value={confirm} onChange={(e) => setConfirm(e.target.value)}
                   aria-invalid={mismatch} />
            {mismatch && (
              <p className="sub" style={{ color: "#b3261e", marginTop: 6 }}>
                The two passwords don't match.
              </p>
            )}
          </>
        )}

        <button className="full" type="submit" style={{ marginTop: 18 }}
                disabled={busy || (mode === "signup" && (!verdict.ok || mismatch || !confirm))}>
          {busy ? "Please wait…"
            : mode === "signin" ? "Sign in"
            : mode === "signup" ? "Create account"
            : "Send reset link"}
        </button>

        <div style={{ textAlign: "center", marginTop: 16, display: "grid", gap: 8 }}>
          {mode === "signin" && (
            <>
              <button type="button" className="link" onClick={() => switchMode("signup")}>
                Need an account? Sign up
              </button>
              <button type="button" className="link" onClick={() => switchMode("forgot")}>
                Forgot your password?
              </button>
            </>
          )}
          {mode !== "signin" && (
            <button type="button" className="link" onClick={() => switchMode("signin")}>
              Back to sign in
            </button>
          )}
          <button type="button" className="link" style={{ color: "var(--ink-soft)" }}
                  onClick={() => navigate("/")}>
            ← Back
          </button>
        </div>

        {isDemo && mode === "signin" && (
          <p className="sub" style={{ textAlign: "center", marginTop: 12, fontSize: 12 }}>
            Demo mode: any email and password works.
          </p>
        )}
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="center">
      <div className="auth-box">
        <div style={{ marginBottom: 20 }}>
          <CatLockup markSize={76} wordSize={26} />
        </div>
        {children}
      </div>
    </div>
  );
}
