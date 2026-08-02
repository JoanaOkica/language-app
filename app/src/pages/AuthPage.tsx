import { FormEvent, useState } from "react";
import { auth } from "../lib/api";
import { useSession } from "../lib/session";
import { isDemo } from "../lib/supabase";

export default function AuthPage() {
  const { refresh } = useSession();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side checks are for feedback only — Supabase Auth enforces the
    // real password policy server-side.
    if (mode === "signup" && password.length < 10) {
      setError("Use at least 10 characters.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signin") await auth.signIn(email, password);
      else await auth.signUp(email, password);
      await refresh();
    } catch (err) {
      // Deliberately generic: distinguishing "wrong password" from "no such
      // account" would let an attacker enumerate registered emails.
      setError(mode === "signin" ? "Email or password is incorrect." : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <div className="auth-box">
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 44 }}>🦌</div>
          <h1>Linguafox</h1>
          <p className="sub">Learn the words your day actually needs.</p>
        </div>

        <form className="card" onSubmit={submit}>
          <h2>{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
          {error && <div className="error" role="alert">{error}</div>}

          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required
                 value={email} onChange={(e) => setEmail(e.target.value)} />

          <label htmlFor="password">Password</label>
          <input id="password" type="password" required
                 autoComplete={mode === "signin" ? "current-password" : "new-password"}
                 value={password} onChange={(e) => setPassword(e.target.value)} />

          <div className="btn-row">
            <button className="full" type="submit" disabled={busy}>
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
            </button>
          </div>

          <p style={{ textAlign: "center", marginTop: 14 }}>
            <button type="button" className="link"
                    onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}>
              {mode === "signin" ? "Need an account? Sign up" : "Already registered? Sign in"}
            </button>
          </p>
          {isDemo && <p className="sub" style={{ textAlign: "center", marginTop: 10 }}>
            Demo mode: any email and password works.
          </p>}
        </form>
      </div>
    </div>
  );
}
