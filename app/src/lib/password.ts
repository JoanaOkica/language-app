/**
 * Password quality checks.
 *
 * These run in the browser purely to give fast feedback and to stop obviously
 * weak choices before a request is made. They are NOT the security control —
 * Supabase Auth enforces the real minimum length, character requirements and
 * the HaveIBeenPwned leaked-password check server-side (see docs/AUTH.md).
 * A client can always bypass what runs on the client.
 */

export const MIN_LENGTH = 12;

/**
 * Passwords that dominate every breach corpus, plus the ones people reach for
 * when an app demands "a capital and a number". Compared case-insensitively
 * and with trailing digits stripped, so `Password1!` is caught as `password`.
 */
const COMMON = new Set([
  "password", "passw0rd", "letmein", "welcome", "qwerty", "qwertyui", "azerty",
  "iloveyou", "admin", "administrator", "root", "login", "master", "dragon",
  "monkey", "football", "baseball", "superman", "batman", "sunshine",
  "princess", "shadow", "michael", "jennifer", "trustno", "starwars",
  "abc", "abcd", "abcdef", "abcdefg", "test", "guest", "user", "changeme",
  "secret", "hello", "freedom", "whatever", "computer", "internet",
  "linguafox", "language", "spanish", "english",
]);

const SEQUENCES = [
  "0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl", "zxcvbnm",
];

export type Strength = "weak" | "fair" | "good" | "strong";

export interface PasswordVerdict {
  ok: boolean;
  strength: Strength;
  /** 0–100, for the meter. */
  score: number;
  /** The single most useful thing to fix, or null when acceptable. */
  problem: string | null;
}

/** Strip a trailing run of digits/punctuation: `dragon2024!` → `dragon`. */
function stem(value: string): string {
  return value.toLowerCase().replace(/[0-9!@#$%^&*_.\-+]+$/g, "");
}

function hasSequence(value: string): boolean {
  const lower = value.toLowerCase();
  for (const seq of SEQUENCES) {
    for (let i = 0; i + 4 <= seq.length; i++) {
      const run = seq.slice(i, i + 4);
      if (lower.includes(run) || lower.includes([...run].reverse().join(""))) return true;
    }
  }
  return false;
}

function hasRepeat(value: string): boolean {
  return /(.)\1{3,}/.test(value);        // aaaa, 1111
}

/**
 * Evaluate a password, optionally against the email so people cannot use their
 * own address as their password.
 */
export function checkPassword(password: string, email = ""): PasswordVerdict {
  const value = password ?? "";

  if (value.length === 0) {
    return { ok: false, strength: "weak", score: 0, problem: null };
  }

  const classes =
    Number(/[a-z]/.test(value)) +
    Number(/[A-Z]/.test(value)) +
    Number(/[0-9]/.test(value)) +
    Number(/[^A-Za-z0-9]/.test(value));

  // --- disqualifiers, most important first ---
  let problem: string | null = null;

  if (value.length < MIN_LENGTH) {
    problem = `Use at least ${MIN_LENGTH} characters.`;
  } else if (COMMON.has(stem(value)) || COMMON.has(value.toLowerCase())) {
    problem = "That's one of the most common passwords — pick something else.";
  } else if (hasSequence(value)) {
    problem = "Avoid runs like “1234” or “qwerty”.";
  } else if (hasRepeat(value)) {
    problem = "Avoid repeating the same character.";
  } else if (classes < 3) {
    problem = "Mix upper case, lower case, numbers or symbols.";
  } else if (email) {
    const local = email.split("@")[0]?.toLowerCase() ?? "";
    if (local.length >= 3 && value.toLowerCase().includes(local)) {
      problem = "Don't use your email address in your password.";
    }
  }

  // --- score, for the meter ---
  let score = Math.min(55, value.length * 4);
  score += (classes - 1) * 12;
  if (value.length >= 16) score += 10;
  if (hasSequence(value) || hasRepeat(value)) score -= 25;
  if (COMMON.has(stem(value))) score = Math.min(score, 15);
  score = Math.max(0, Math.min(100, score));

  const strength: Strength =
    problem ? (score < 30 ? "weak" : "fair")
    : score >= 80 ? "strong"
    : score >= 60 ? "good"
    : "fair";

  return { ok: problem === null, strength, score, problem };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  const value = email.trim();
  return value.length <= 254 && EMAIL_RE.test(value);
}
