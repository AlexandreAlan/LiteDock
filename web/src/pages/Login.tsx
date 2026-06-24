import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ErrorNote } from '../components/ui';
import { DEMO } from '../lib/demo';

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needCode, setNeedCode] = useState(false);
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
      await login(email, password, needCode ? code : undefined);
      navigate('/', { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falhou';
      if (msg === '2fa_required') {
        setNeedCode(true);
        setErr('Digite o código do seu app autenticador.');
      } else {
        setErr(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function enterDemo() {
    setErr('');
    setBusy(true);
    try {
      await login('demo@litedock.app', 'demo');
      navigate('/', { replace: true });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Falhou');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="text-3xl">🐳</span>
          <div>
            <div className="font-display text-2xl font-bold text-ink">
              LITEDOCK
            </div>
            <div className="stamp">acesse seu painel</div>
          </div>
        </div>

        {DEMO && (
          <div className="mb-4 rounded-xl border border-brand/30 bg-brand/5 p-4">
            <div className="mb-1 text-sm font-semibold text-ink">Modo demonstração</div>
            <p className="mb-3 text-xs text-muted">
              Painel de exemplo com dados fictícios — explore projetos, deploy ao vivo,
              templates e monitoramento. Nada é real, nenhum servidor é afetado.
            </p>
            <button type="button" onClick={enterDemo} disabled={busy} className="btn-brand w-full">
              {busy ? 'abrindo…' : 'Entrar na demonstração →'}
            </button>
          </div>
        )}

        <form onSubmit={submit} className="plate space-y-4 p-6">
          <div>
            <label className="stamp mb-1 block">E-mail</label>
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
            <label className="stamp mb-1 block">Senha</label>
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

          {needCode && (
            <div>
              <label className="stamp mb-1 block">Código de verificação (2FA)</label>
              <input
                className="field tracking-widest"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                autoFocus
                required
              />
            </div>
          )}

          {err && <ErrorNote message={err} />}

          <button type="submit" className="btn-brand w-full" disabled={busy}>
            {busy ? 'abrindo…' : needCode ? 'Verificar' : 'Entrar'}
          </button>

          <p className="text-center text-[11px] text-muted">
            Acesso restrito. Novas contas só por convite.
          </p>
        </form>
      </div>
    </div>
  );
}
