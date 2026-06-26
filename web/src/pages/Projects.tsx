import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Project, type Service } from '../lib/api';
import { Modal } from '../components/Modal';
import { MetricsBar } from '../components/MetricsBar';
import { StatusDot } from '../components/StatusDot';
import { Icon } from '../components/icons';
import { Spinner, Empty } from '../components/ui';

// Rótulo de tipo sob o nome do serviço (app / postgres / redis / compose…).
function typeLabel(s: Service): string {
  if (s.type === 'app') return 'app';
  const spec = (s.spec ?? {}) as Record<string, unknown>;
  const engine = (spec.engine as string) || (spec.image as string) || 'database';
  return engine.split(':')[0].split('/').pop() || 'database';
}

type Sort = 'name' | 'time';
type View = 'expanded' | 'collapsed';

export function Projects() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['projects'], queryFn: () => api.get<Project[]>('/projects') });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [sort, setSort] = useState<Sort>('name');
  const [view, setView] = useState<View>('expanded');

  const create = useMutation({
    mutationFn: () => api.post<Project>('/projects', { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); setOpen(false); setName(''); },
  });

  const projects = useMemo(() => {
    const list = [...(data ?? [])];
    list.sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
    );
    return list;
  }, [data, sort]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <MetricsBar />

      {/* cabeçalho + toolbar (estilo EasyPanel) */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <h2 className="text-xl font-semibold text-ink">Projetos</h2>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn-brand text-sm" onClick={() => setOpen(true)}><Icon name="plus" className="h-4 w-4" /> Novo</button>
          <Segmented
            value={sort}
            onChange={(v) => setSort(v as Sort)}
            options={[{ v: 'name', label: 'Nome' }, { v: 'time', label: 'Tempo' }]}
          />
          <Segmented
            value={view}
            onChange={(v) => setView(v as View)}
            options={[{ v: 'expanded', label: 'Expandido' }, { v: 'collapsed', label: 'Colapsado' }]}
          />
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <Empty title="Não consegui carregar" hint={(error as Error).message} />
      ) : projects.length === 0 ? (
        <Empty
          title="Nenhum projeto ainda"
          hint="Crie seu primeiro projeto para começar a subir apps e bancos."
          action={<button className="btn-brand" onClick={() => setOpen(true)}>Criar projeto</button>}
        />
      ) : (
        <div className="space-y-7">
          {projects.map((p) => (
            <section key={p.id} className="space-y-3">
              {/* cabeçalho do projeto */}
              <div className="flex items-center gap-2">
                <Link to={`/project/${p.id}`} className="text-base font-semibold text-ink hover:underline">{p.name}</Link>
                <div className="flex items-center gap-0.5 text-muted">
                  <Link to={`/project/${p.id}`} title="Abrir projeto" className="rounded p-1 hover:bg-panel2 hover:text-ink"><Icon name="folder" className="h-4 w-4" /></Link>
                  <Link to={`/project/${p.id}`} title="Configurar" className="rounded p-1 hover:bg-panel2 hover:text-ink"><Icon name="settings" className="h-4 w-4" /></Link>
                  <Link to={`/project/${p.id}`} title="Adicionar serviço" className="rounded p-1 hover:bg-panel2 hover:text-ink"><Icon name="plus" className="h-4 w-4" /></Link>
                  <Link to={`/project/${p.id}`} title="Layout" className="rounded p-1 hover:bg-panel2 hover:text-ink"><Icon name="layout" className="h-4 w-4" /></Link>
                </div>
                <span className="ml-1 text-xs text-muted">
                  {(() => {
                    const total = p.services?.length ?? 0;
                    const running = (p.services ?? []).filter((s) => s.status === 'running' || s.status === 'online').length;
                    if (total === 0) return '0 serviços';
                    if (running > 0) return <><span className="text-ok font-semibold">{running}</span>/{total} rodando</>;
                    return `${total} serviço${total !== 1 ? 's' : ''}`;
                  })()}
                </span>
              </div>

              {/* cards de serviço */}
              {view === 'expanded' &&
                ((p.services?.length ?? 0) === 0 ? (
                  <Link to={`/project/${p.id}`} className="block rounded-lg border border-dashed border-line px-4 py-3 text-sm text-muted hover:border-brand/40 hover:text-ink">
                    + Adicionar serviço
                  </Link>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {p.services!.map((s) => (
                      <Link
                        key={s.id}
                        to={`/service/${s.id}`}
                        className="card flex items-center justify-between gap-2 p-3.5 transition-shadow hover:shadow-pop"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-ink">{s.name}</div>
                          <div className="mt-0.5 text-xs text-muted">{typeLabel(s)}</div>
                        </div>
                        <StatusDot state={s.status} />
                      </Link>
                    ))}
                  </div>
                ))}
            </section>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Criar projeto"
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
          <label className="label mb-1 block">Nome do projeto</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="meu-projeto" autoFocus />
        </div>
        {create.error && <p className="mt-2 text-sm text-bad">{(create.error as Error).message}</p>}
      </Modal>
    </div>
  );
}

// Botão segmentado (toggle) no estilo da toolbar do EasyPanel.
function Segmented({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { v: string; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-panel p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${value === o.v ? 'bg-panel2 text-ink' : 'text-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
