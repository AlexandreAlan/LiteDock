import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { Toasts } from './components/Toasts';
import { Login } from './pages/Login';
import { Projects } from './pages/Projects';
import { Project } from './pages/Project';
import { Service } from './pages/Service';
import { Vps as Monitor } from './pages/Vps';
import { Domains } from './pages/Domains';
import { Settings } from './pages/Settings';
import { Activity } from './pages/Activity';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="carregando…" />
      </div>
    );
  return user ? children : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <>
    <Toasts />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Projects />} />
        <Route path="/project/:id" element={<Project />} />
        <Route path="/service/:id" element={<Service />} />
        <Route path="/monitor" element={<Monitor />} />
        <Route path="/domains" element={<Domains />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/activity" element={<Activity />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
