import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { api, type HostMetrics, type EngineInfo, type DomainFull, type User } from '../lib/api';
import { Card } from '../components/Card';
import { Empty, ErrorNote, Spinner } from '../components/ui';
import { Icon } from '../components/icons';
import { useAuth } from '../lib/auth';

type IconName = Parameters<typeof Icon>[0]['name'];
type TabKey =
  | 'auth' | 'geral' | 'github' | 'licenca' | 'analise' | 'usuarios' | 'cluster'
  | 'marca' | 'notificacoes' | 'certificados' | 'snapshots' | 'cloudflare'
  | 'storage' | 'builders' | 'middlewares' | 'monitoring';

const NAV: { group: string; items: { key: TabKey; label: string; icon: IconName }[] }[] = [
  {
    group: 'Usuário',
    items: [{ key: 'auth', label: 'Autenticação', icon: 'shield' }],
  },
  {
    group: 'Servidor',
    items: [
      { key: 'geral', label: 'Geral', icon: 'layout' },
      { key: 'github', label: 'Github', icon: 'book' },
      { key: 'licenca', label: 'Licença', icon: 'cube' },
      { key: 'analise', label: 'Análise', icon: 'activity' },
      { key: 'usuarios', label: 'Usuários', icon: 'user' },
      { key: 'cluster', label: 'Cluster', icon: 'globe' },
      { key: 'marca', label: 'Marca', icon: 'rocket' },
      { key: 'notificacoes', label: 'Notificações', icon: 'message' },
      { key: 'certificados', label: 'Certificados', icon: 'shield' },
      { key: 'snapshots', label: 'Snapshots', icon: 'history' },
      { key: 'cloudflare', label: 'Túnel Cloudflare', icon: 'globe' },
      { key: 'storage', label: 'Provedores de armazenamento', icon: 'cube' },
      { key: 'builders', label: 'Construtores Docker', icon: 'docker' },
      { key: 'middlewares', label: 'Middlewares', icon: 'layout' },
      { key: 'monitoring', label: 'Monitoring', icon: 'activity' },
    ],
  },
];

export function Settings() {
  const [tab, setTab] = useState<TabKey>('auth');

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Ajustes</h1>
        <p className="label mt-1">Conta e servidor</p>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        <aside className="md:w-60 md:shrink-0">
          <nav className="space-y-5">
            {NAV.map((g) => (
              <div key={g.group}>
                <div className="stamp mb-2 px-2">{g.group.toUpperCase()}</div>
                <ul className="space-y-0.5">
                  {g.items.map((it) => {
                    const active = tab === it.key;
                    return (
                      <li key={it.key}>
                        <button
                          type="button"
                          onClick={() => setTab(it.key)}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                            active
                              ? 'bg-brand/10 font-medium text-brand'
                              : 'text-muted hover:bg-panel2 hover:text-ink'
                          }`}
                        >
                          <Icon name={it.icon} className="h-4 w-4 shrink-0" />
                          <span className="truncate">{it.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          {tab === 'auth' && <AuthSection />}
          {tab === 'geral' && <GeralSection />}
          {tab === 'usuarios' && <UsuariosSection />}
          {tab === 'monitoring' && <MonitoringSection />}
          {tab === 'cluster' && <ClusterSection />}
          {tab === 'certificados' && <CertificadosSection />}
          {tab === 'analise' && <AnaliseSection />}
          {tab === 'marca' && <MarcaSection />}
          {tab === 'notificacoes' && <NotificacoesSection />}
          {tab === 'licenca' && <LicencaSection />}
          {tab === 'github' && <GithubSection />}
          {tab === 'cloudflare' && (
            <RoadmapSection
              title="Túnel Cloudflare"
              desc="Exponha o painel e os serviços sem abrir portas, via cloudflared. Requer um token de túnel da Cloudflare."
            />
          )}
          {tab === 'storage' && (
            <RoadmapSection
              title="Provedores de armazenamento"
              desc="Configure destinos de backup (S3, Backblaze B2, etc.) para guardar snapshots dos serviços fora da VPS."
            />
          )}
          {tab === 'builders' && (
            <RoadmapSection
              title="Construtores Docker"
              desc="Escolha como as imagens são construídas: Dockerfile ou Nixpacks (buildpack). Hoje o build já roda no worker; a seleção fica por serviço."
            />
          )}
          {tab === 'middlewares' && (
            <RoadmapSection
              title="Middlewares"
              desc="Middlewares do Traefik reutilizáveis (basic-auth, rate-limit, redirects) para aplicar nos domínios dos serviços."
            />
          )}
          {tab === 'snapshots' && <SnapshotsSection />}
        </div>
      </div>
    </div>
  );
}

// ── Autenticação ────────────────────────────────────────────────────────
function AuthSection() {
  const { user, updateCredentials } = useAuth();
  const [email, setEmail] = useState(user?.email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setErr('');
    setOk('');
    if (!currentPassword) {
      setErr('Informe a senha atual para confirmar a alteração.');
      return;
    }
    if (email === user?.email && !newPassword) {
      setErr('Nada para alterar — mude o e-mail ou defina uma nova senha.');
      return;
    }
    setBusy(true);
    try {
      await updateCredentials({
        email: email !== user?.email ? email : undefined,
        currentPassword,
        newPassword: newPassword || undefined,
      });
      setOk('Credenciais atualizadas com sucesso.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Falha ao atualizar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Mudar credenciais">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label mb-1 block">E-mail <span className="text-bad">*</span></label>
            <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </div>
          <div>
            <label className="label mb-1 block">Senha atual <span className="text-bad">*</span></label>
            <PasswordField value={currentPassword} onChange={setCurrentPassword} show={showCurrent} toggle={() => setShowCurrent((s) => !s)} autoComplete="current-password" />
          </div>
          <div>
            <label className="label mb-1 block">Nova senha</label>
            <PasswordField value={newPassword} onChange={setNewPassword} show={showNew} toggle={() => setShowNew((s) => !s)} placeholder="deixe em branco para manter" autoComplete="new-password" />
          </div>
          {err && <ErrorNote message={err} />}
          {ok && <div className="rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">{ok}</div>}
          <button type="submit" className="btn-brand" disabled={busy}>{busy ? 'Salvando…' : 'Guardar'}</button>
        </form>
      </Card>

      <TwoFactorCard />
    </div>
  );
}

function TwoFactorCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const enabled = !!user?.totpEnabled;
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (setup?.otpauthUrl) QRCode.toDataURL(setup.otpauthUrl, { margin: 1, width: 180 }).then(setQr).catch(() => setQr(''));
  }, [setup]);

  async function start() {
    setErr('');
    setBusy(true);
    try {
      setSetup(await api.post('/auth/2fa/setup'));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Falha');
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    setErr('');
    setBusy(true);
    try {
      await api.post('/auth/2fa/enable', { code });
      setSetup(null);
      setCode('');
      await refreshUser(qc);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Código inválido');
    } finally {
      setBusy(false);
    }
  }
  async function disable() {
    setErr('');
    setBusy(true);
    try {
      await api.post('/auth/2fa/disable', { password });
      setPassword('');
      await refreshUser(qc);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Falha');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Autenticação de dois fatores">
      <div className="space-y-4">
        {enabled ? (
          <>
            <div className="flex items-center gap-2 rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">
              <Icon name="check" className="h-4 w-4" /> 2FA ativo nesta conta.
            </div>
            <p className="text-sm text-muted">Para desativar, confirme sua senha:</p>
            <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="sua senha" autoComplete="current-password" />
            {err && <ErrorNote message={err} />}
            <button type="button" className="btn-ghost" onClick={disable} disabled={busy || !password}>
              {busy ? 'Desativando…' : 'Desativar 2FA'}
            </button>
          </>
        ) : setup ? (
          <>
            <p className="text-sm text-muted">
              1. Escaneie o QR no Google Authenticator, Authy ou 1Password (ou digite a chave manualmente).
            </p>
            <div className="flex flex-col items-center gap-2">
              {qr ? <img src={qr} alt="QR 2FA" className="rounded-lg border border-line bg-white p-2" /> : <Spinner label="Gerando QR…" />}
              <code className="break-all rounded bg-panel2 px-2 py-1 text-xs text-ink">{setup.secret}</code>
            </div>
            <p className="text-sm text-muted">2. Digite o código de 6 dígitos para confirmar:</p>
            <input className="field tracking-widest" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
            {err && <ErrorNote message={err} />}
            <div className="flex gap-2">
              <button type="button" className="btn-brand" onClick={confirm} disabled={busy || code.length < 6}>
                {busy ? 'Confirmando…' : 'Ativar 2FA'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setSetup(null)} disabled={busy}>Cancelar</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-bad">
              Sua conta não está protegida com a autenticação de dois fatores.
              Recomendamos ativar para reforçar a segurança da sua conta.
            </p>
            {err && <ErrorNote message={err} />}
            <button type="button" className="btn-brand" onClick={start} disabled={busy}>
              <Icon name="shield" className="h-4 w-4" />
              {busy ? 'Preparando…' : 'Configurar autenticação de dois fatores'}
            </button>
          </>
        )}
      </div>
    </Card>
  );
}

async function refreshUser(qc: ReturnType<typeof useQueryClient>) {
  // Recarrega /auth/me para refletir o estado do 2FA (a página reabre com o user atualizado).
  await api.get('/auth/me').catch(() => {});
  qc.invalidateQueries();
  window.location.reload();
}

// ── Geral ─────────────────────────────────────────────────────────────────
function fmtUptime(sec?: number) {
  if (!sec) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const min = Math.floor((sec % 3600) / 60);
  return `${d} dias, ${h} horas, ${min} minutos`;
}

function GeralSection() {
  const qc = useQueryClient();
  const { data: m } = useQuery({ queryKey: ['metrics'], queryFn: () => api.get<HostMetrics>('/servers/local/metrics') });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Record<string, string>>('/settings') });
  const { data: worker } = useQuery({ queryKey: ['worker'], queryFn: () => api.get<{ online: boolean; safeMode: boolean }>('/servers/local/system/worker') });

  const host = typeof window !== 'undefined' ? window.location.host : 'litedock.local';

  const [panelDomain, setPanelDomain] = useState('');
  const [serveOnIp, setServeOnIp] = useState(false);
  const [serviceDomain, setServiceDomain] = useState('');
  const [leEmail, setLeEmail] = useState('');
  const [cleanup, setCleanup] = useState(false);

  const [actionMsg, setActionMsg] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [logs, setLogs] = useState('');
  const [running, setRunning] = useState('');

  useEffect(() => {
    if (!settings) return;
    setPanelDomain(settings.panelCustomDomain ?? '');
    setServeOnIp(settings.panelServeOnIp === 'true');
    setServiceDomain(settings.serviceCustomDomain ?? '');
    setLeEmail(settings.letsEncryptEmail ?? '');
    setCleanup(settings.dailyDockerCleanup === 'true');
  }, [settings]);

  async function save(patch: Record<string, string>) {
    await api.patch('/settings', patch);
    qc.invalidateQueries({ queryKey: ['settings'] });
  }

  async function runAction(name: string, fn: () => Promise<string>) {
    setActionErr('');
    setActionMsg('');
    setLogs('');
    setRunning(name);
    try {
      setActionMsg(await fn());
    } catch (e: unknown) {
      setActionErr(e instanceof Error ? e.message : 'Falha');
    } finally {
      setRunning('');
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown label="Painel" items={[
            { label: 'Reiniciar painel', onClick: () => { if (confirm('Reiniciar o painel? Haverá ~5s de indisponibilidade.')) runAction('painel', async () => { await api.post('/servers/local/system/panel/restart'); return 'Painel reiniciando… recarregue em alguns segundos.'; }); } },
          ]} />
          <Dropdown label="Servidor" items={[
            { label: 'Reiniciar servidor (host)', onClick: () => alert('Reiniciar o host está desativado: esta VPS roda várias aplicações de produção. Faça pelo provedor/SSH com cuidado.') },
          ]} />
          <Dropdown label="Traefik" items={[
            { label: 'Reiniciar Traefik', onClick: () => runAction('traefik', async () => { await api.post('/servers/local/system/traefik/restart'); return 'Traefik reiniciado.'; }) },
            { label: 'Ver logs', onClick: () => runAction('logs', async () => { const r = await api.get<{ logs: string }>('/servers/local/system/traefik/logs?tail=120'); setLogs(r.logs || '(vazio)'); return ''; }) },
          ]} />
          <Dropdown label="Docker" items={[
            { label: 'Limpar imagens órfãs (seguro)', onClick: () => runAction('prune', async () => { const r = await api.post<{ imagesDeleted: number; containersRemoved: number; spaceReclaimedHuman: string }>('/servers/local/system/prune'); return `Limpeza concluída: ${r.imagesDeleted} imagens, ${r.containersRemoved} containers, ${r.spaceReclaimedHuman} liberados.`; }) },
            { label: 'Ver uso de disco', onClick: () => runAction('df', async () => { const r = await api.get<{ images: { count: number; sizeHuman: string; reclaimableHuman: string }; volumes: { count: number; sizeHuman: string } }>('/servers/local/system/df'); return `Imagens: ${r.images.count} (${r.images.sizeHuman}, ${r.images.reclaimableHuman} recuperáveis) · Volumes: ${r.volumes.count} (${r.volumes.sizeHuman}).`; }) },
          ]} />
          <label className="ml-1 flex cursor-pointer items-center gap-2 text-sm text-ink">
            <Toggle on={cleanup} onChange={(v) => { setCleanup(v); save({ dailyDockerCleanup: String(v) }); }} />
            Limpeza diária do Docker
          </label>
        </div>
        <p className="mt-3 text-sm text-muted">
          Tempo de atividade: {fmtUptime(m?.uptimeSec)}
          {worker && (
            <span className={`ml-3 ${worker.online ? 'text-ok' : 'text-bad'}`}>
              · worker {worker.online ? 'online' : 'offline'}{worker.online && worker.safeMode ? ' (modo seguro)' : ''}
            </span>
          )}
        </p>
        {running && <p className="mt-2 text-sm text-muted">Executando {running}…</p>}
        {actionMsg && <p className="mt-2 text-sm text-ok">{actionMsg}</p>}
        {actionErr && <div className="mt-2"><ErrorNote message={actionErr} /></div>}
        {logs && <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-panel2 p-3 text-xs text-ink">{logs}</pre>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Domínio do painel">
          <SaveBlock onSave={() => save({ panelCustomDomain: panelDomain, panelServeOnIp: String(serveOnIp) })}>
            <div>
              <label className="label mb-1 block">Domínio predeterminado</label>
              <CopyField value={host} />
            </div>
            <div>
              <label className="label mb-1 block">Domínio personalizado</label>
              <input className="field" value={panelDomain} onChange={(e) => setPanelDomain(e.target.value)} placeholder="painel.seudominio.com" />
              <p className="mt-1 text-xs text-muted">Garanta que este domínio aponte para o endereço IP do servidor.</p>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink">Servir no endereço IP</span>
              <Toggle on={serveOnIp} onChange={setServeOnIp} />
            </div>
          </SaveBlock>
        </Card>

        <Card title="Domínio dos serviços">
          <SaveBlock onSave={() => save({ serviceCustomDomain: serviceDomain })}>
            <div>
              <label className="label mb-1 block">Domínio predeterminado</label>
              <CopyField value={`*.${host}`} />
            </div>
            <div>
              <label className="label mb-1 block">Domínio personalizado</label>
              <input className="field" value={serviceDomain} onChange={(e) => setServiceDomain(e.target.value)} placeholder="*.seudominio.com" />
              <p className="mt-1 text-xs text-muted">Novos serviços vão usar este domínio em vez do predeterminado.</p>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-brand/30 bg-brand/5 p-3 text-xs text-muted">
              <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <span>Configure um registro DNS curinga: <code>*.seudominio.com</code> → A → IP do servidor.</span>
            </div>
          </SaveBlock>
        </Card>
      </div>

      <Card title="E-mail do Let's Encrypt">
        <div className="max-w-md">
          <SaveBlock onSave={() => save({ letsEncryptEmail: leEmail })}>
            <div>
              <label className="label mb-1 block">E-mail <span className="text-bad">*</span></label>
              <input className="field" type="email" value={leEmail} onChange={(e) => setLeEmail(e.target.value)} placeholder="admin@seudominio.com" />
              <p className="mt-1 text-xs text-muted">Este e-mail é usado para emitir os certificados SSL.</p>
            </div>
          </SaveBlock>
        </div>
      </Card>
    </div>
  );
}

// ── Usuários (CRUD) ────────────────────────────────────────────────────────
function UsuariosSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';
  const { data: users, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/users'),
    enabled: isAdmin,
  });

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('member');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!isAdmin) return <Empty title="Sem permissão" hint="Só owner/admin podem gerenciar usuários." />;

  async function create(ev: React.FormEvent) {
    ev.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api.post('/users', { email, name: name || undefined, password, role });
      setEmail(''); setName(''); setPassword(''); setRole('member');
      qc.invalidateQueries({ queryKey: ['users'] });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Falha ao criar');
    } finally {
      setBusy(false);
    }
  }
  async function changeRole(id: string, r: string) {
    await api.patch(`/users/${id}`, { role: r });
    qc.invalidateQueries({ queryKey: ['users'] });
  }
  async function remove(id: string, em: string) {
    if (!confirm(`Excluir o usuário ${em}?`)) return;
    try {
      await api.del(`/users/${id}`);
      qc.invalidateQueries({ queryKey: ['users'] });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Falha ao excluir');
    }
  }

  return (
    <div className="space-y-6">
      <Card title="Usuários">
        {isLoading ? <Spinner /> : error ? <ErrorNote message={(error as Error).message} /> : (
          <div className="divide-y divide-line">
            {(users ?? []).map((u) => (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{u.email} {u.id === user?.id && <span className="text-xs text-muted">(você)</span>}</div>
                  {u.name && <div className="text-xs text-muted">{u.name}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <select className="field w-32 py-1" value={u.role} disabled={u.id === user?.id} onChange={(e) => changeRole(u.id, e.target.value)}>
                    <option value="owner">owner</option>
                    <option value="admin">admin</option>
                    <option value="member">member</option>
                  </select>
                  <button type="button" className="rounded p-1.5 text-muted hover:bg-panel2 hover:text-bad disabled:opacity-30" disabled={u.id === user?.id} onClick={() => remove(u.id, u.email)} title="Excluir">
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Convidar usuário">
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label mb-1 block">E-mail <span className="text-bad">*</span></label>
            <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label mb-1 block">Nome</label>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label mb-1 block">Senha inicial <span className="text-bad">*</span></label>
            <input className="field" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mín. 6 caracteres" required />
          </div>
          <div>
            <label className="label mb-1 block">Papel</label>
            <select className="field" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="member">member</option>
              <option value="admin">admin</option>
              {user?.role === 'owner' && <option value="owner">owner</option>}
            </select>
          </div>
          {err && <div className="sm:col-span-2"><ErrorNote message={err} /></div>}
          <div className="sm:col-span-2">
            <button type="submit" className="btn-brand" disabled={busy}>{busy ? 'Criando…' : 'Criar usuário'}</button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// ── Monitoring / Análise / Cluster / Certificados ───────────────────────────
function MonitoringSection() {
  const { data: m } = useQuery({ queryKey: ['metrics'], queryFn: () => api.get<HostMetrics>('/servers/local/metrics'), refetchInterval: 5000 });
  return (
    <div className="space-y-6">
      <Card title="Monitoramento">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricBox label="CPU" value={`${Math.round(m?.cpu.pct ?? 0)}%`} />
          <MetricBox label="Memória" value={`${Math.round(m?.memory.pct ?? 0)}%`} />
          <MetricBox label="Disco" value={`${Math.round(m?.disk.pct ?? 0)}%`} />
          <MetricBox label="Cores" value={`${m?.cpu.cores ?? '—'}`} />
        </div>
        <a href="/monitor" className="btn-brand mt-4 inline-flex">Abrir monitor completo</a>
      </Card>
    </div>
  );
}

function AnaliseSection() {
  const { data: m } = useQuery({ queryKey: ['metrics'], queryFn: () => api.get<HostMetrics>('/servers/local/metrics') });
  const { data: e } = useQuery({ queryKey: ['engine'], queryFn: () => api.get<EngineInfo>('/servers/local/engine') });
  const gb = (b?: number) => (b ? `${(b / 1024 ** 3).toFixed(1)} GB` : '—');
  return (
    <div className="space-y-6">
      <Card title="Análise do servidor">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <MetricBox label="CPU em uso" value={`${Math.round(m?.cpu.pct ?? 0)}%`} />
          <MetricBox label="Memória" value={`${gb(m?.memory.usedBytes)} / ${gb(m?.memory.totalBytes)}`} />
          <MetricBox label="Disco" value={`${gb(m?.disk.usedBytes)} / ${gb(m?.disk.totalBytes)}`} />
          <MetricBox label="Containers" value={`${e?.containersRunning ?? 0}/${e?.containers ?? 0}`} />
          <MetricBox label="Imagens" value={`${e?.images ?? '—'}`} />
          <MetricBox label="Docker" value={`${e?.serverVersion ?? '—'}`} />
        </div>
      </Card>
    </div>
  );
}

function ClusterSection() {
  const { data: m } = useQuery({ queryKey: ['metrics'], queryFn: () => api.get<HostMetrics>('/servers/local/metrics') });
  const { data: e } = useQuery({ queryKey: ['engine'], queryFn: () => api.get<EngineInfo>('/servers/local/engine') });
  return (
    <div className="space-y-6">
      <Card title="Cluster">
        <div className="flex items-center justify-between rounded-lg border border-line p-4">
          <div className="flex items-center gap-3">
            <Icon name="server" className="h-5 w-5 text-brand" />
            <div>
              <div className="text-sm font-medium text-ink">{m?.hostname ?? 'servidor local'}</div>
              <div className="text-xs text-muted">{m?.publicIp ?? '127.0.0.1'} · Docker {e?.serverVersion ?? '—'}</div>
            </div>
          </div>
          <span className="flex items-center gap-1.5 text-sm text-ok"><span className="h-2 w-2 rounded-full bg-ok" /> online</span>
        </div>
        <p className="mt-3 text-xs text-muted">Implantação local (single-node). Multi-servidor via agentes chega numa próxima fase.</p>
      </Card>
    </div>
  );
}

function CertificadosSection() {
  const { data: domains, isLoading } = useQuery({ queryKey: ['domains'], queryFn: () => api.get<DomainFull[]>('/domains') });
  return (
    <div className="space-y-6">
      <Card title="Certificados SSL">
        {isLoading ? <Spinner /> : !domains?.length ? (
          <Empty title="Nenhum domínio" hint="Adicione domínios aos serviços para o LiteDock emitir certificados via Let's Encrypt." />
        ) : (
          <div className="divide-y divide-line">
            {domains.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{d.host}</div>
                  {d.service && <div className="text-xs text-muted">{d.service.name}</div>}
                </div>
                <span className={`flex items-center gap-1.5 text-xs ${d.https ? 'text-ok' : 'text-muted'}`}>
                  <Icon name="shield" className="h-3.5 w-3.5" /> {d.certStatus || (d.https ? 'ativo' : 'sem SSL')}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

interface GithubStatus {
  connected: boolean;
  invalid?: boolean;
  login?: string;
  name?: string | null;
  avatarUrl?: string;
  htmlUrl?: string;
  credentialId?: string;
}

function GithubSection() {
  const qc = useQueryClient();
  const { data: status, isLoading } = useQuery({
    queryKey: ['github-status'],
    queryFn: () => api.get<GithubStatus>('/github/status'),
  });
  const { data: repos } = useQuery({
    queryKey: ['github-repos'],
    queryFn: () => api.get<{ fullName: string; private: boolean }[]>('/github/repos'),
    enabled: !!status?.connected,
  });

  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function connect(ev: React.FormEvent) {
    ev.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api.post('/github/connect', { token });
      setToken('');
      qc.invalidateQueries({ queryKey: ['github-status'] });
      qc.invalidateQueries({ queryKey: ['github-repos'] });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Falha ao conectar');
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    if (!confirm('Desconectar a conta do GitHub?')) return;
    await api.del('/github/disconnect');
    qc.invalidateQueries({ queryKey: ['github-status'] });
  }

  if (isLoading) return <Card title="Github"><Spinner /></Card>;

  if (status?.connected) {
    return (
      <div className="space-y-6">
        <Card title="Github">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {status.avatarUrl && <img src={status.avatarUrl} alt="" className="h-11 w-11 rounded-full" />}
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-ink">
                  <Icon name="check" className="h-4 w-4 text-ok" /> Conectado como @{status.login}
                </div>
                {status.name && <div className="text-xs text-muted">{status.name}</div>}
                {status.htmlUrl && <a href={status.htmlUrl} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline">{status.htmlUrl}</a>}
              </div>
            </div>
            <button type="button" className="btn-ghost text-sm" onClick={disconnect}>Desconectar</button>
          </div>
          <p className="mt-4 text-xs text-muted">
            {repos ? `${repos.length} repositórios acessíveis` : 'Carregando repositórios…'} — escolha um na aba <span className="text-ink">Source</span> de cada serviço para fazer deploy (inclui privados) e ativar builds por push.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card title="Github">
        {status?.invalid && (
          <div className="mb-4"><ErrorNote message="O token salvo expirou ou foi revogado. Conecte novamente." /></div>
        )}
        <p className="mb-4 text-sm text-muted">
          Conecte sua conta do GitHub para fazer deploy de repositórios (inclusive privados)
          e disparar builds por push. Use um Personal Access Token.
        </p>
        <form onSubmit={connect} className="space-y-3">
          <input
            className="field"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_… ou github_pat_…"
            autoComplete="off"
          />
          {err && <ErrorNote message={err} />}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-brand" disabled={busy || token.length < 8}>
              <Icon name="book" className="h-4 w-4" />
              {busy ? 'Conectando…' : 'Conectar GitHub'}
            </button>
            <a
              href="https://github.com/settings/tokens/new?description=LiteDock&scopes=repo"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-brand hover:underline"
            >
              Criar um token no GitHub →
            </a>
          </div>
        </form>
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-brand/30 bg-brand/5 p-3 text-xs text-muted">
          <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <span>
            Dê ao token o escopo <code>repo</code> (clássico) ou acesso de leitura a <code>Contents</code>
            nos repositórios (fine-grained). O token é guardado cifrado (AES-256-GCM) e nunca é exibido de volta.
          </span>
        </div>
      </Card>
    </div>
  );
}

function SnapshotsSection() {
  return (
    <div className="space-y-6">
      <Card title="Snapshots">
        <Empty
          title="Nenhum snapshot ainda"
          hint="Backups dos serviços e bancos aparecerão aqui. Configure um destino na aba Provedores de armazenamento para guardá-los fora da VPS."
        />
      </Card>
    </div>
  );
}

// ── Marca / Notificações / Licença ──────────────────────────────────────────
function MarcaSection() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Record<string, string>>('/settings') });
  const [brandName, setBrandName] = useState('');
  const [brandLogoUrl, setBrandLogoUrl] = useState('');
  useEffect(() => { if (settings) { setBrandName(settings.brandName ?? ''); setBrandLogoUrl(settings.brandLogoUrl ?? ''); } }, [settings]);
  return (
    <Card title="Marca">
      <div className="max-w-md">
        <SaveBlock onSave={async () => { await api.patch('/settings', { brandName, brandLogoUrl }); qc.invalidateQueries({ queryKey: ['settings'] }); }}>
          <div>
            <label className="label mb-1 block">Nome do painel</label>
            <input className="field" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="LiteDock" />
          </div>
          <div>
            <label className="label mb-1 block">URL do logo</label>
            <input className="field" value={brandLogoUrl} onChange={(e) => setBrandLogoUrl(e.target.value)} placeholder="https://…/logo.png" />
            <p className="mt-1 text-xs text-muted">Personalize o nome e o logo exibidos no painel.</p>
          </div>
        </SaveBlock>
      </div>
    </Card>
  );
}

function NotificacoesSection() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Record<string, string>>('/settings') });
  const [notifyEmail, setNotifyEmail] = useState('');
  const [notifyWebhook, setNotifyWebhook] = useState('');
  const [notifyOnDeploy, setNotifyOnDeploy] = useState(false);
  useEffect(() => { if (settings) { setNotifyEmail(settings.notifyEmail ?? ''); setNotifyWebhook(settings.notifyWebhook ?? ''); setNotifyOnDeploy(settings.notifyOnDeploy === 'true'); } }, [settings]);
  return (
    <Card title="Notificações">
      <div className="max-w-md">
        <SaveBlock onSave={async () => { await api.patch('/settings', { notifyEmail, notifyWebhook, notifyOnDeploy: String(notifyOnDeploy) }); qc.invalidateQueries({ queryKey: ['settings'] }); }}>
          <div>
            <label className="label mb-1 block">E-mail de notificações</label>
            <input className="field" type="email" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} placeholder="voce@empresa.com" />
          </div>
          <div>
            <label className="label mb-1 block">Webhook (Discord/Slack)</label>
            <input className="field" value={notifyWebhook} onChange={(e) => setNotifyWebhook(e.target.value)} placeholder="https://discord.com/api/webhooks/…" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink">Avisar em deploys</span>
            <Toggle on={notifyOnDeploy} onChange={setNotifyOnDeploy} />
          </div>
        </SaveBlock>
      </div>
    </Card>
  );
}

function LicencaSection() {
  return (
    <div className="space-y-6">
      <Card title="Licença">
        <div className="space-y-2.5 text-sm">
          <Row k="Edição" v="Self-hosted" />
          <Row k="Plano" v="Ilimitado (sem limite de apps)" />
          <Row k="Versão" v="LiteDock v0.9.0" />
          <Row k="Status" v={<span className="text-ok">Ativa</span>} />
        </div>
      </Card>
    </div>
  );
}

function RoadmapSection({ title, desc }: { title: string; desc: string }) {
  return (
    <Card title={title}>
      <div className="flex items-start gap-3 rounded-lg border border-brand/30 bg-brand/5 p-4">
        <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
        <div>
          <p className="text-sm text-ink">{desc}</p>
          <p className="mt-2 text-xs text-muted">Integração em desenvolvimento — chega numa próxima versão.</p>
        </div>
      </div>
    </Card>
  );
}

// ── Componentes auxiliares ──────────────────────────────────────────────────
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2 last:border-0">
      <span className="text-muted">{k}</span>
      <span className="font-medium text-ink">{v}</span>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="plate-2 p-3">
      <div className="stamp mb-1">{label}</div>
      <div className="text-xl font-semibold text-ink tabular-nums">{value}</div>
    </div>
  );
}

function SaveBlock({ children, onSave }: { children: React.ReactNode; onSave: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState('');
  async function go() {
    setErr(''); setOk(false); setBusy(true);
    try { await onSave(); setOk(true); setTimeout(() => setOk(false), 2500); }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Falha ao salvar'); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-4">
      {children}
      {err && <ErrorNote message={err} />}
      <div className="flex items-center gap-3">
        <button type="button" className="btn-brand" onClick={go} disabled={busy}>{busy ? 'Salvando…' : 'Guardar'}</button>
        {ok && <span className="flex items-center gap-1 text-sm text-ok"><Icon name="check" className="h-4 w-4" /> Salvo</span>}
      </div>
    </div>
  );
}

function Dropdown({ label, items }: { label: string; items: { label: string; onClick: () => void }[] }) {
  return (
    <details className="relative">
      <summary className="btn-ghost cursor-pointer list-none py-1.5 text-sm [&::-webkit-details-marker]:hidden">
        {label}
        <Icon name="chevronDown" className="h-3.5 w-3.5" />
      </summary>
      <div className="absolute left-0 z-20 mt-1 min-w-56 rounded-lg border border-line bg-panel p-1 shadow-card">
        {items.map((it) => (
          <button key={it.label} type="button" onClick={(ev) => { (ev.currentTarget.closest('details') as HTMLDetailsElement)?.removeAttribute('open'); it.onClick(); }} className="block w-full rounded px-2.5 py-1.5 text-left text-sm text-ink hover:bg-panel2">
            {it.label}
          </button>
        ))}
      </div>
    </details>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-brand' : 'bg-line'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-1'}`} />
    </button>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <input className="field pr-10" value={value} readOnly />
      <button type="button" onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }} aria-label="Copiar" className="absolute inset-y-0 right-0 flex items-center px-3 text-muted hover:text-ink">
        <Icon name={copied ? 'check' : 'copy'} className="h-4 w-4" />
      </button>
    </div>
  );
}

function PasswordField({ value, onChange, show, toggle, placeholder, autoComplete }: { value: string; onChange: (v: string) => void; show: boolean; toggle: () => void; placeholder?: string; autoComplete?: string }) {
  return (
    <div className="relative">
      <input className="field pr-10" type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} />
      <button type="button" onClick={toggle} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} className="absolute inset-y-0 right-0 flex items-center px-3 text-muted hover:text-ink">
        <Icon name={show ? 'eyeOff' : 'eye'} className="h-4 w-4" />
      </button>
    </div>
  );
}
