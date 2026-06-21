import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type Project } from '../lib/api';
import { Card } from '../components/Card';
import { StatusDot } from '../components/StatusDot';
import { Spinner, Empty } from '../components/ui';

export function Apps() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get<Project[]>('/projects'),
  });

  const projects = data ?? [];
  const hasAny = projects.some((p) => (p.services?.length ?? 0) > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Apps</h1>
          <p className="stamp mt-1">serviços que você opera</p>
        </div>
        <Link to="/catalogo" className="btn-brand">
          + novo app
        </Link>
      </div>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <Empty title="Não consegui carregar" hint={(error as Error).message} />
      ) : !hasAny ? (
        <Empty
          title="Você ainda não tem apps"
          hint="Escolha um modelo no catálogo para subir o primeiro."
          action={
            <Link to="/catalogo" className="btn-brand">
              abrir catálogo
            </Link>
          }
        />
      ) : (
        <div className="space-y-5">
          {projects
            .filter((p) => (p.services?.length ?? 0) > 0)
            .map((p) => (
              <Card key={p.id} title={p.name} right={<span className="font-mono text-xs text-muted">{p.services?.length} serviço(s)</span>}>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {(p.services ?? []).map((s) => (
                    <li key={s.id}>
                      <Link
                        to={`/apps/${s.id}`}
                        className="plate-2 flex items-center gap-3 p-3 transition-colors hover:border-brand-dim"
                      >
                        <StatusDot state={s.status} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-sm text-ink">{s.name}</div>
                          <div className="truncate font-mono text-[11px] text-muted">
                            {s.image || s.type}
                          </div>
                        </div>
                        <span className="font-display text-brand">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}
