import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type DomainFull } from '../lib/api';
import { Card } from '../components/Card';
import { Spinner, Empty, ErrorNote } from '../components/ui';

export function Domains() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['domains'],
    queryFn: () => api.get<DomainFull[]>('/domains'),
  });
  const domains = data ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Domínios</h1>
        <p className="label mt-1">Todos os domínios dos seus serviços</p>
      </div>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorNote message={(error as Error).message} />
      ) : domains.length === 0 ? (
        <Empty title="Nenhum domínio" hint="Adicione domínios na página de cada serviço." />
      ) : (
        <Card title={`${domains.length} domínio(s)`}>
          <ul className="divide-y divide-line">
            {domains.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <a href={`${d.https ? 'https' : 'http'}://${d.host}`} target="_blank" rel="noreferrer" className="font-medium text-ink hover:text-brand">
                    {d.https ? 'https://' : 'http://'}{d.host}
                  </a>
                  <div className="mt-0.5 text-xs text-muted">
                    {d.service?.project && (
                      <Link to={`/service/${d.service.id}`} className="hover:text-ink">
                        {d.service.project.name} / {d.service.name}
                      </Link>
                    )}
                    {' · porta '}{d.targetPort}
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.certStatus === 'active' ? 'bg-brand/10 text-brand-ink' : 'bg-panel2 text-muted'}`}>
                  {d.certStatus}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
