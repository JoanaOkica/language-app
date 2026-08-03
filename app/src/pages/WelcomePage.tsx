import { useNavigate } from "react-router-dom";
import { CatLockup } from "../components/CatLogo";

const FEATURES = [
  {
    icon: "📝",
    title: "Plan your day, get your words",
    body: "Write what you're up to. FRED hands you the exact words you'll need before you need them.",
  },
  {
    icon: "💬",
    title: "Talk without the nerves",
    body: "Practise real conversations with a cat that never sighs, never rushes and always corrects kindly.",
  },
  {
    icon: "🎮",
    title: "Games that stick",
    body: "Word match, quick quizzes and sentence building — five minutes is a win.",
  },
  {
    icon: "🔥",
    title: "Streaks & friend duels",
    body: "Keep the flame going and challenge friends learning the same language.",
  },
];

/**
 * First screen for anyone not signed in: what the app is, then the two ways in.
 * Sign-in and sign-up live on their own routes so this page stays a plain,
 * fast-loading pitch with no form state.
 */
export default function WelcomePage() {
  const navigate = useNavigate();

  return (
    <div className="welcome">
      <header className="welcome-head">
        <CatLockup markSize={92} wordSize={31} />
        <p className="welcome-tagline">
          The language app that learns your day, then teaches you to live it in
          another language.
        </p>
      </header>

      <div className="welcome-cta">
        <button className="full" onClick={() => navigate("/signup")}>
          Start learning free
        </button>
        <button className="full ghost" onClick={() => navigate("/signin")}>
          I already have an account
        </button>
      </div>

      <ul className="features">
        {FEATURES.map((f) => (
          <li className="feature" key={f.title}>
            <span className="feature-icon" aria-hidden="true">{f.icon}</span>
            <div>
              <h2>{f.title}</h2>
              <p>{f.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
