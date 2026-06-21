import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { Login } from './pages/Login';
import { Painel } from './pages/Painel';
import { Apps } from './pages/Apps';
import { Catalogo } from './pages/Catalogo';
import { Vps } from './pages/Vps';
import { ServiceDetail } from './pages/ServiceDetail';

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
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Painel />} />
        <Route path="/apps" element={<Apps />} />
        <Route path="/apps/:id" element={<ServiceDetail />} />
        <Route path="/catalogo" element={<Catalogo />} />
        <Route path="/vps" element={<Vps />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
