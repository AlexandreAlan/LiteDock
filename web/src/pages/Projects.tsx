import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Project } from '../lib/api';
import { Modal } from '../components/Modal';
import { MetricsBar } from '../components/MetricsBar';
import { Spinner, Empty, ErrorNote } from '../components/ui';

export function Projects() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['projects'], queryFn: () => api.get<Project[]>('/projects') });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');

  const create = useMutation({
    mutationFn: () => api.post<Project>('/projects', { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setOpen(false);
      setName('');
      setErr('');
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : 'Falhou'),
  });

  const projects = data ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Início</h1>
        <p className="label mt-1">Visão geral do servidor</p>
      </div>

      <MetricsBar />

      <div className="flex items-center justify-between pt-2">
        <h2 className="text-lg font-semibold text-ink">Projects</h2>
        <button className="btn-brand" onClick={() => setOpen(true)}>
          Create
        </button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <Empty title="Não consegui carregar" hint={(error as Error).message} />
      ) : projects.length === 0 ? (
        <Empty
          title="No projects yet"
          hint="Create your first project to start deploying apps and databases."
          action={<button className="btn-brand" onClick={() => setOpen(true)}>Create project</button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} to={`/project/${p.id}`} className="card p-5 transition-shadow hover:shadow-pop">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-ink">{p.name}</span>
                <span className="text-xs text-muted">{p.services?.length ?? 0} services</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(p.services ?? []).slice(0, 6).map((s) => (
                  <span key={s.id} className="rounded bg-panel2 px-2 py-0.5 text-xs text-muted">
                    {s.name}
                  </span>
                ))}
                {(p.services?.length ?? 0) === 0 && <span className="text-xs text-muted">empty</span>}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create project"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-brand" disabled={!name || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? 'Creating…' : 'Create'}
            </button>
          </>
        }
      >
        <div>
          <label className="label mb-1 block">Project name</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-project" autoFocus />
        </div>
        {err && <ErrorNote message={err} />}
      </Modal>
    </div>
  );
}
