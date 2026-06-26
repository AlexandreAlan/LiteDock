import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '../lib/toast';
import { api, type ContainerStat, type DockerEvent, type StorageItem } from '../lib/api';
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { MetricsBar } from '../components/MetricsBar';
import { StatusDot } from '../components/StatusDot';
import { Icon } from '../components/icons';
import { Spinner, Empty, ErrorNote } from '../components/ui';

function bytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}
function bps(b: number) {
  if (b < 1024) return `${b.toFixed(0)} B/s`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB/s`;
  return `${(b / 1024 ** 2).toFixed(1)} MB/s`;
}
function hhmmss(t: number) {
  return new Date(t).toLocaleTimeString('pt-BR', { hour12: false });
}

type Tab = 'services' | 'events' | 'storage';

export function Vps() {
  const [tab, setTab] = useState<Tab>('services');
  const TABS: { key: Tab; label: string }[] = [
    { key: 'services', label: 'Serviços' },
    { key: 'events', label: 'Eventos de Docker' },
    { key: 'storage', label: 'Armazenamento' },
  ];
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <MetricsBar />

      <div className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              '-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors',
              tab === t.key ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'services' && <ServicesTab />}
      {tab === 'events' && <EventsTab />}
      {tab === 'storage' && <StorageTab />}
    </div>
  );
}

// ── Serviços: CPU / memória / rede por container + ações ─────────────────
function ServicesTab() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['container-stats'],
    queryFn: () => api.get<ContainerStat[]>('/servers/local/container-stats'),
    refetchInterval: 5000,
  });
  const list = q.data ?? [];
  const [sched, setSched] = useState<ContainerStat | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const action = useMutation({
    mutationFn: ({ name, op }: { name: string; op: 'start' | 'stop' }) =>
      api.post(`/servers/local/containers/${encodeURIComponent(name)}/${op}`),
    onMutate: ({ name }) => setBusy(name),
    onSuccess: (_d, { op }) => toast.success(`Container ${op === 'start' ? 'iniciado' : 'parado'}.`),
    onError: (e: unknown) => toast.error((e as Error).message),
    onSettled: () => { setBusy(null); qc.invalidateQueries({ queryKey: ['container-stats'] }); },
  });

  const running = list.filter((c) => c.running).length;
  return (
    <Card
      title="Serviços"
      subtitle="Todos os containers no host. Gerenciados pelo LiteDock têm ações disponíveis."
      right={
        <span className="text-xs text-muted">
          <span className="font-semibold text-ok">{running}</span>/{list.length} em execução
        </span>
      }
    >
      {q.isLoading ? (
        <Spinner label="coletando métricas…" />
      ) : q.error ? (
        <ErrorNote message={(q.error as Error).message} />
      ) : list.length === 0 ? (
        <Empty title="Nenhum container" hint="Nenhum container encontrado no host." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Serviço</th>
                <th className="py-2 pr-3 text-right font-medium">CPU</th>
                <th className="py-2 pr-3 text-right font-medium">Memória</th>
                <th className="py-2 pr-3 text-right font-medium">Rede ↓</th>
                <th className="py-2 pr-3 text-right font-medium">Rede ↑</th>
                <th className="py-2 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-b border-line/60 last:border-0 hover:bg-panel2/40 transition-colors">
                  <td className="py-2.5 pr-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="inline-flex items-center gap-2">
                        <StatusDot state={c.state} />
                        {c.managed && c.serviceId ? (
                          <Link
                            to={`/service/${c.serviceId}`}
                            className="font-medium text-ink hover:text-brand transition-colors"
                          >
                            {c.name}
                          </Link>
                        ) : (
                          <span className="text-ink">{c.name}</span>
                        )}
                        {c.managed && (
                          <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-brand-ink">litedock</span>
                        )}
                        {c.schedule?.enabled && (c.schedule.startTime || c.schedule.stopTime) && (
                          <span className="inline-flex items-center gap-1 rounded bg-panel2 px-1.5 py-0.5 text-[10px] text-muted" title="Agendado">
                            <Icon name="history" className="h-3 w-3" />
                            {c.schedule.startTime ?? '—'}→{c.schedule.stopTime ?? '—'}
                          </span>
                        )}
                      </span>
                      <span className="pl-5 font-mono text-[10px] text-muted/70">{c.id}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    {c.running ? (
                      <span className={c.cpuPct > 80 ? 'text-bad' : c.cpuPct > 50 ? 'text-warn' : 'text-muted'}>
                        {c.cpuPct.toFixed(1)} %
                      </span>
                    ) : <span className="text-muted">—</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{c.running ? bytes(c.memBytes) : '—'}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{c.running ? bps(c.netInBps) : '—'}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{c.running ? bps(c.netOutBps) : '—'}</td>
                  <td className="py-2.5 text-right">
                    {c.managed ? (
                      <div className="inline-flex items-center gap-1">
                        {c.running ? (
                          <button
                            title="Parar"
                            disabled={busy === c.name}
                            onClick={() => { if (confirm(`Parar o container "${c.name}"?`)) action.mutate({ name: c.name, op: 'stop' }); }}
                            className="rounded border border-line p-1.5 text-muted hover:bg-panel2 hover:text-bad disabled:opacity-50"
                          >
                            <Icon name="pause" className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            title="Iniciar"
                            disabled={busy === c.name}
                            onClick={() => action.mutate({ name: c.name, op: 'start' })}
                            className="rounded border border-line p-1.5 text-muted hover:bg-panel2 hover:text-ok disabled:opacity-50"
                          >
                            <Icon name="play" className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          title="Agendar liga/desliga"
                          onClick={() => setSched(c)}
                          className={`rounded border border-line p-1.5 hover:bg-panel2 hover:text-ink ${c.schedule?.enabled && (c.schedule.startTime || c.schedule.stopTime) ? 'text-brand' : 'text-muted'}`}
                        >
                          <Icon name="history" className="h-3.5 w-3.5" />
                        </button>
                        {c.serviceId && (
                          <Link
                            to={`/service/${c.serviceId}`}
                            title="Abrir página do serviço"
                            className="rounded border border-line p-1.5 text-muted hover:bg-panel2 hover:text-brand"
                          >
                            <Icon name="externalLink" className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </div>
                    ) : (
                      <span
                        className="text-[10px] text-muted"
                        title="Serviço de produção do host — controlado fora do LiteDock (somente visualização)"
                      >
                        protegido
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {action.error && <div className="mt-3"><ErrorNote message={(action.error as Error).message} /></div>}
      {sched && <ScheduleModal container={sched} onClose={() => setSched(null)} />}
    </Card>
  );
}

// Modal de agendamento (liga/desliga diário por horário).
function ScheduleModal({ container, onClose }: { container: ContainerStat; onClose: () => void }) {
  const qc = useQueryClient();
  const [start, setStart] = useState(container.schedule?.startTime ?? '');
  const [stop, setStop] = useState(container.schedule?.stopTime ?? '');

  const save = useMutation({
    mutationFn: () =>
      api.put(`/servers/local/containers/${encodeURIComponent(container.name)}/schedule`, {
        startTime: start || null,
        stopTime: stop || null,
        enabled: true,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['container-stats'] }); toast.success('Agendamento salvo.'); onClose(); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });
  const clear = useMutation({
    mutationFn: () => api.del(`/servers/local/containers/${encodeURIComponent(container.name)}/schedule`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['container-stats'] }); toast.success('Agendamento removido.'); onClose(); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Agendar — ${container.name}`}
      footer={
        <>
          <button className="btn-ghost" onClick={() => clear.mutate()} disabled={clear.isPending}>Limpar</button>
          <button className="btn-brand" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar'}</button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">Liga e desliga o container automaticamente todo dia nos horários abaixo (hora do servidor). Deixe em branco para não agendar aquela ação.</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label mb-1 block">Iniciar às</label>
          <input type="time" className="field" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className="label mb-1 block">Parar às</label>
          <input type="time" className="field" value={stop} onChange={(e) => setStop(e.target.value)} />
        </div>
      </div>
      {(save.error || clear.error) && <div className="mt-3"><ErrorNote message={((save.error || clear.error) as Error).message} /></div>}
    </Modal>
  );
}

// ── Eventos de Docker (stream) ───────────────────────────────────────────
function EventsTab() {
  const q = useQuery({
    queryKey: ['docker-events'],
    queryFn: () => api.get<DockerEvent[]>('/servers/local/docker-events?limit=80'),
    refetchInterval: 3000,
  });
  const list = q.data ?? [];
  return (
    <Card title="Eventos de Docker" subtitle="Stream de eventos do daemon (criação, exec, healthcheck…).">
      {q.isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty title="Sem eventos recentes" hint="Os eventos aparecem aqui conforme o Docker os emite." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Tipo</th>
                <th className="py-2 pr-3 font-medium">Ação</th>
                <th className="py-2 pr-3 font-medium">Hora</th>
                <th className="py-2 font-medium">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e, i) => (
                <tr key={i} className="border-b border-line/60 last:border-0">
                  <td className="py-2 pr-3 text-muted">{e.type}</td>
                  <td className="py-2 pr-3 font-mono text-[12px] text-ink">{e.action}</td>
                  <td className="py-2 pr-3 tabular-nums text-muted">{hhmmss(e.time)}</td>
                  <td className="py-2 truncate text-[12px] text-muted">{e.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── Armazenamento (docker system df) ─────────────────────────────────────
function StorageTab() {
  const q = useQuery({
    queryKey: ['storage'],
    queryFn: () => api.get<StorageItem[]>('/servers/local/storage'),
    refetchInterval: 15000,
  });
  const list = q.data ?? [];
  return (
    <Card title="Armazenamento" right={<span className="text-xs text-muted">{list.length}</span>} subtitle="Uso de disco por container e volume.">
      {q.isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty title="Nada para mostrar" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Nome</th>
                <th className="py-2 pr-3 font-medium">Tipo</th>
                <th className="py-2 pr-3 text-right font-medium">Tamanho</th>
                <th className="py-2 font-medium">Caminho</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s, i) => (
                <tr key={i} className="border-b border-line/60 last:border-0">
                  <td className="py-2.5 pr-3 text-ink">{s.name}</td>
                  <td className="py-2.5 pr-3 text-muted">{s.kind === 'volume' ? 'volume' : 'container'}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{bytes(s.sizeBytes)}</td>
                  <td className="py-2.5 truncate font-mono text-[11px] text-muted">{s.path}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
