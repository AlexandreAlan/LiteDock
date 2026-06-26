import { useState } from 'react';
import { toast } from '../lib/toast';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Project as TProject, type Service, type ServiceType } from '../lib/api';
import { Modal } from '../components/Modal';
import { TemplateCatalog } from '../components/TemplateCatalog';
import { Spinner, Empty, ErrorNote } from '../components/ui';
import { StatusDot } from '../components/StatusDot';
import { TypeBadge } from '../components/badges';
import { Icon } from '../components/icons';

const DB_ENGINES = ['postgres', 'mysql', 'mongo', 'redis'];

export function Project() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get<TProject>(`/projects/${id}`),
  });

  const [open, setOpen] = useState(false);
  const [store, setStore] = useState(false);
  const [nets, setNets] = useState(false);
  const [type, setType] = useState<ServiceType>('app');
  const [engine, setEngine] = useState('postgres');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');

  const rename = useMutation({
    mutationFn: () => api.patch(`/projects/${id}`, { name: newName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      setRenaming(false);
      toast.success('Projeto renomeado.');
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const destroy = useMutation({
    mutationFn: () => api.del(`/projects/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); toast.success('Projeto excluído.'); navigate('/'); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<Service>(`/projects/${id}/services`, {
        name,
        type,
        spec: type === 'database' ? { engine } : {},
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      setOpen(false);
      setName('');
      setErr('');
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : 'Falhou'),
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorNote message={(error as Error).message} />;
  const project = data!;
  const services = project.services ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link to="/" className="hover:text-ink">Projects</Link>
        <span>/</span>
        <span className="text-ink">{project.name}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {renaming ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); rename.mutate(); }}
            >
              <input
                className="field text-xl font-semibold"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(false); }}
              />
              <button type="submit" className="btn-brand text-sm" disabled={!newName.trim() || rename.isPending}>
                {rename.isPending ? '…' : 'Salvar'}
              </button>
              <button type="button" className="btn-ghost text-sm" onClick={() => setRenaming(false)}>Cancelar</button>
            </form>
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-ink">{project.name}</h1>
              <button
                className="rounded p-1 text-muted hover:bg-panel2 hover:text-ink"
                title="Renomear projeto"
                onClick={() => { setNewName(project.name); setRenaming(true); }}
              >
                <Icon name="pencil" className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={() => setNets(true)}><Icon name="globe" className="h-4 w-4" /> Redes</button>
          <button className="btn-ghost" onClick={() => setStore(true)}><Icon name="zap" className="h-4 w-4" /> Templates</button>
          <button className="btn-brand" onClick={() => setOpen(true)}><Icon name="plus" className="h-4 w-4" /> Criar serviço</button>
          <button
            className="rounded-lg border border-bad/30 p-2 text-muted hover:bg-bad/10 hover:text-bad transition-colors"
            title="Excluir projeto"
            onClick={() => {
              if (confirm(`Excluir o projeto "${project.name}" e todos os seus serviços? Esta ação não tem volta.`)) {
                destroy.mutate();
              }
            }}
            disabled={destroy.isPending}
          >
            <Icon name="trash" className="h-4 w-4" />
          </button>
        </div>
      </div>
      {rename.error && <div className="mt-1"><ErrorNote message={(rename.error as Error).message} /></div>}

      {services.length === 0 ? (
        <Empty
          title="Nenhum serviço ainda"
          hint="Instale um app pronto pela loja de Templates ou crie um serviço do zero."
          action={
            <div className="flex items-center gap-2">
              <button className="btn-brand" onClick={() => setStore(true)}><Icon name="zap" className="h-4 w-4" /> Ver Templates</button>
              <button className="btn-ghost" onClick={() => setOpen(true)}><Icon name="plus" className="h-4 w-4" /> Criar serviço</button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => {
            const primaryDomain = s.domains?.[0];
            return (
              <Link key={s.id} to={`/service/${s.id}`} className="card flex items-center gap-3 p-4 transition-shadow hover:shadow-pop">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-ink">{s.name}</span>
                    <TypeBadge type={s.type} spec={s.spec} />
                  </div>
                  {primaryDomain ? (
                    <div className="mt-0.5 truncate text-xs text-brand/70">{primaryDomain.host}</div>
                  ) : (
                    <div className="mt-0.5 text-xs text-muted">{s.type === 'app' ? 'app' : 'database'}</div>
                  )}
                </div>
                <StatusDot state={s.status} />
              </Link>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Criar serviço"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn-brand" disabled={!name || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? 'Criando…' : 'Criar'}
            </button>
          </>
        }
      >
        <div>
          <label className="label mb-1.5 block">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            {(['app', 'database'] as ServiceType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                  type === t ? 'border-brand bg-brand/10 text-brand-ink' : 'border-line text-muted hover:bg-panel2'
                }`}
              >
                {t === 'app' ? 'App' : 'Database'}
              </button>
            ))}
          </div>
        </div>

        {type === 'database' && (
          <div>
            <label className="label mb-1.5 block">Banco</label>
            <div className="flex flex-wrap gap-2">
              {DB_ENGINES.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEngine(e)}
                  className={`rounded-lg border px-3 py-1.5 text-sm capitalize transition-colors ${
                    engine === e ? 'border-brand bg-brand/10 text-brand-ink' : 'border-line text-muted hover:bg-panel2'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="label mb-1 block">Nome</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={type === 'app' ? 'website' : 'db'} autoFocus />
        </div>
        {err && <ErrorNote message={err} />}
      </Modal>

      <TemplateCatalog projectId={id} open={store} onClose={() => setStore(false)} />
      <BridgesModal projectId={id} projectName={project.name} open={nets} onClose={() => setNets(false)} />
    </div>
  );
}

interface BridgeInfo {
  connected: { bridgeId: string; id: string; name: string; slug: string }[];
  available: { id: string; name: string; slug: string }[];
}

function BridgesModal({ projectId, projectName, open, onClose }: { projectId: string; projectName: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['bridges', projectId],
    queryFn: () => api.get<BridgeInfo>(`/projects/${projectId}/bridges`),
    enabled: open,
  });
  const [peer, setPeer] = useState('');
  const connect = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/bridges`, { peerId: peer }),
    onSuccess: () => { setPeer(''); qc.invalidateQueries({ queryKey: ['bridges', projectId] }); toast.success('Projetos conectados — serviços se enxergam agora.'); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });
  const disconnect = useMutation({
    mutationFn: (peerId: string) => api.del(`/projects/${projectId}/bridges/${peerId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bridges', projectId] }); toast.success('Ponte removida.'); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  return (
    <Modal open={open} onClose={onClose} title="Redes do projeto"
      footer={<button className="btn-ghost" onClick={onClose}>Fechar</button>}>
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-ok/30 bg-ok/5 p-3 text-xs text-muted">
          <Icon name="globe" className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
          <span><span className="font-medium text-ink">{projectName}</span> roda numa rede isolada (<code>litedock-net-{/* slug shown by api not needed */''}…</code>). Os serviços daqui se enxergam, mas <span className="text-ink">não conversam com outros projetos</span> — a não ser que você crie uma ponte abaixo.</span>
        </div>

        {isLoading ? <Spinner /> : (
          <>
            <div>
              <label className="label mb-1.5 block">Pontes ativas</label>
              {data?.connected.length ? (
                <div className="space-y-2">
                  {data.connected.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                      <span className="flex items-center gap-2 text-sm text-ink"><Icon name="zap" className="h-3.5 w-3.5 text-brand" /> {p.name}</span>
                      <button className="text-xs text-bad hover:underline" disabled={disconnect.isPending} onClick={() => disconnect.mutate(p.id)}>desfazer</button>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-muted">Nenhuma — totalmente isolado.</p>}
            </div>

            <div>
              <label className="label mb-1.5 block">Criar ponte com outro projeto</label>
              <div className="flex gap-2">
                <select className="field" value={peer} onChange={(e) => setPeer(e.target.value)}>
                  <option value="">— escolher projeto —</option>
                  {(data?.available ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button className="btn-brand shrink-0" disabled={!peer || connect.isPending} onClick={() => connect.mutate()}>
                  {connect.isPending ? '...' : 'Conectar'}
                </button>
              </div>
              {connect.error && <div className="mt-2"><ErrorNote message={(connect.error as Error).message} /></div>}
              <p className="mt-1.5 text-xs text-muted">Os serviços de ambos passam a se enxergar pelo nome do container. Vale pros que já estão no ar e pros próximos deploys.</p>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
