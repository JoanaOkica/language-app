import { Navigate, Route, Routes } from "react-router-dom";
import { SessionProvider, useSession } from "./lib/session";
import { isDemo } from "./lib/supabase";
import Layout from "./components/Layout";
import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";
import HomePage from "./pages/HomePage";
import TasksPage from "./pages/TasksPage";
import LibraryPage from "./pages/LibraryPage";
import FredPage from "./pages/FredPage";
import MascotPage from "./pages/MascotPage";
import FriendsPage from "./pages/FriendsPage";
import ChallengesPage from "./pages/ChallengesPage";
import SettingsPage from "./pages/SettingsPage";

function Routing() {
  const { userId, profile, loading } = useSession();

  if (loading) return <div className="center"><p className="spinner">Loading…</p></div>;
  if (!userId) return <AuthPage />;
  if (profile && !profile.onboarded) return <OnboardingPage />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/fred" element={<FredPage />} />
        <Route path="/mascot" element={<MascotPage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/challenges" element={<ChallengesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <SessionProvider>
      {isDemo && (
        <div className="banner">
          Demo mode — no Supabase project configured. Data is in-memory only.
        </div>
      )}
      <Routing />
    </SessionProvider>
  );
}
