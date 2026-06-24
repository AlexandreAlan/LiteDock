import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, getToken, setToken, type User } from './api';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, code?: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  updateCredentials: (input: {
    email?: string;
    currentPassword: string;
    newPassword?: string;
  }) => Promise<void>;
  logout: () => void;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const { user } = await api.get<{ user: User }>('/auth/me');
        if (alive) setUser(user);
      } catch {
        setToken(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function login(email: string, password: string, code?: string) {
    const r = await api.post<{ token: string; user: User }>('/auth/login', {
      email,
      password,
      ...(code ? { code } : {}),
    });
    setToken(r.token);
    setUser(r.user);
  }

  async function register(email: string, password: string, name?: string) {
    const r = await api.post<{ token: string; user: User }>('/auth/register', {
      email,
      password,
      name,
    });
    setToken(r.token);
    setUser(r.user);
  }

  async function updateCredentials(input: {
    email?: string;
    currentPassword: string;
    newPassword?: string;
  }) {
    const r = await api.patch<{ token: string; user: User }>('/auth/credentials', input);
    setToken(r.token);
    setUser(r.user);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, updateCredentials, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
