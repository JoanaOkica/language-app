import { Navigate, Route, Routes } from "react-router-dom";
import { SessionProvider, useSession } from "./lib/session";
import { isDemo } from "./lib/supabase";
import Layout from "./components/Layout";
import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";
import TodayPage from "./pages/TodayPage";
import PlanPage from "./pages/PlanPage";
import WordsPage from "./pages/WordsPage";
import FredPage from "./pages/FredPage";
import GamesPage from "./pages/GamesPage";
import GamePlayPage from "./pages/GamePlayPage";
import FriendsPage from "./pages/FriendsPage";
import ChallengesPage from "./pages/ChallengesPage";
import DenPage from "./pages/DenPage";

function Routing() {
  const { userId, profile, loading } = useSession();

  if (loading) return <div className="center"><p className="spinner">Loading…</p></div>;
  if (!userId) return <AuthPage />;
  if (profile && !profile.onboarded) return <OnboardingPage />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<TodayPage />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/words" element={<WordsPage />} />
        {/* "Talk" is FRED — the speaking coach is unchanged. */}
        <Route path="/talk" element={<FredPage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/games/:gameId" element={<GamePlayPage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/challenges" element={<ChallengesPage />} />
        <Route path="/den" element={<DenPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <SessionProvider>
      {isDemo && (
        <div className="banner">Demo mode — in-memory data, no Supabase project configured.</div>
      )}
      <Routing />
    </SessionProvider>
  );
}
