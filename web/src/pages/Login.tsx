import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ErrorNote } from '../components/ui';

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) {
    navigate('/', { replace: true });
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Falhou');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-bg bg-rivets bg-[length:22px_22px] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="text-3xl">🐳</span>
          <div>
            <div className="font-display text-2xl font-bold tracking-wide text-ink">
              LITEDOCK
            </div>
            <div className="stamp">casa de máquinas · acesso</div>
          </div>
        </div>

        <form onSubmit={submit} className="plate space-y-4 p-6">
          <div>
            <label className="stamp mb-1 block">e-mail</label>
            <input
              className="field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="stamp mb-1 block">senha</label>
            <input
              className="field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {err && <ErrorNote message={err} />}

          <button type="submit" className="btn-copper w-full" disabled={busy}>
            {busy ? 'abrindo…' : 'Entrar'}
          </button>

          <p className="text-center font-mono text-[11px] text-muted">
            Acesso restrito. Novas contas só por convite.
          </p>
        </form>
      </div>
    </div>
  );
}
