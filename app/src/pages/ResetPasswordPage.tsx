import { FormEvent, useEffect, useState } from "react";
import { auth } from "../lib/api";
import { isDemo, supabase } from "../lib/supabase";
import { checkPassword } from "../lib/password";
import PasswordMeter from "../components/PasswordMeter";

/**
 * Landing page for the "forgot password" email link.
 *
 * Supabase turns the recovery token in the URL fragment into a short-lived
 * session, which is what authorises the password change. Without that session
 * this page can do nothing — so a stranger opening the URL cannot reset anyone.
 */
export default function ResetPasswordPage() {
  const [ready, setReady] = useState(isDemo);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const verdict = checkPassword(password);
  const mismatch = confirm.length > 0 && password !== confirm;

  useEffect(() => {
    if (isDemo) return;
    // detectSessionInUrl consumes the recovery token; give it a moment, then
    // confirm a session actually materialised.
    const check = async () => {
      const { data } = await supabase!.auth.getSession();
      setReady(Boolean(data.session));
    };
    void check();
    const { data } = supabase!.auth.onAuthStateChange(() => void check());
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!verdict.ok) { setError(verdict.problem); return; }
    if (password !== confirm) { setError("The two passwords don't match."); return; }

    setBusy(true);
    try {
      await auth.updatePassword(password);
      // Force a fresh sign-in so any other device using the old password is
      // logged out rather than silently carrying on.
      await auth.signOut();
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <div className="auth-box">
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 46 }}>🔑</div>
          <h1>Choose a new password</h1>
        </div>

        {done ? (
          <div className="card" style={{ textAlign: "center" }}>
            <h2>Password updated</h2>
            <p className="sub" style={{ marginTop: 8 }}>
              You've been signed out everywhere. Sign in with your new password.
            </p>
            <button className="full" style={{ marginTop: 18 }}
                    onClick={() => { window.location.href = "/"; }}>
              Go to sign in
            </button>
          </div>
        ) : !ready ? (
          <div className="card" style={{ textAlign: "center" }}>
            <h2>Link expired</h2>
            <p className="sub" style={{ marginTop: 8 }}>
              This reset link is no longer valid. Request a new one from the sign-in
              page — links last one hour.
            </p>
            <button className="full ghost" style={{ marginTop: 18 }}
                    onClick={() => { window.location.href = "/"; }}>
              Back to sign in
            </button>
          </div>
        ) : (
          <form className="card" onSubmit={submit}>
            {error && <div className="error" role="alert">{error}</div>}

            <label htmlFor="np">New password</label>
            <input id="np" type="password" required autoComplete="new-password"
                   value={password} onChange={(e) => setPassword(e.target.value)} />
            <PasswordMeter verdict={verdict} />

            <label htmlFor="nc">Confirm new password</label>
            <input id="nc" type="password" required autoComplete="new-password"
                   value={confirm} onChange={(e) => setConfirm(e.target.value)}
                   aria-invalid={mismatch} />
            {mismatch && (
              <p className="sub" style={{ color: "#b3261e", marginTop: 6 }}>
                The two passwords don't match.
              </p>
            )}

            <button className="full" type="submit" style={{ marginTop: 18 }}
                    disabled={busy || !verdict.ok || mismatch || !confirm}>
              {busy ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
