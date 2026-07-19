import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type DomainFull } from '../lib/api';
import { Card } from '../components/Card';
import { Icon } from '../components/icons';
import { Spinner, Empty, ErrorNote } from '../components/ui';

// Mesmo default do backend (src/services/naming.ts#servicesBaseDomain) — usado
// quando o ajuste "Domínio dos serviços" não foi customizado.
const DEFAULT_SERVICE_BASE_DOMAIN = 'litedock.morenadoaco.com.br';

// `Domain.https` no banco indica se o TRAEFIK termina TLS para aquele host
// específico (cert Let's Encrypt individual) — é `false` de propósito pros
// subdomínios auto-gerados sob o domínio curinga (*.{base}), porque ali quem
// termina TLS é o nginx com o certificado wildcard, antes de chegar no Traefik
// (o Traefik conversa em HTTP puro com o nginx nesse caso). Ou seja: `https:
// false` no banco NÃO significa "sem HTTPS" pra esses hosts — significa
// "sem certificado individual próprio". Só domínio de cliente fora do domínio
// curinga (custom domain) depende mesmo do certificado individual do Traefik.
function isUnderServiceWildcard(host: string, base: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  const b = base.toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
  return h === b || h.endsWith(`.${b}`);
}

function effectiveHttps(d: DomainFull, base: string): boolean {
  return d.https || isUnderServiceWildcard(d.host, base);
}

function certColor(d: DomainFull, base: string) {
  if (!effectiveHttps(d, base)) return 'text-muted';
  if (d.certStatus === 'active') return 'text-ok';
  if (d.certStatus === 'error') return 'text-bad';
  return 'text-warn';
}

function certLabel(d: DomainFull, base: string) {
  if (!effectiveHttps(d, base)) return 'HTTP';
  if (!d.https) return 'HTTPS'; // wildcard do LiteDock — HTTPS de fábrica via nginx, sem cert individual no Traefik
  if (d.certStatus === 'active') return 'SSL ativo';
  if (d.certStatus === 'error') return 'SSL erro';
  return d.certStatus ?? 'pendente';
}

export function Domains() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['domains'],
    queryFn: () => api.get<DomainFull[]>('/domains'),
    refetchInterval: 30000,
  });
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Record<string, string>>('/settings'),
    staleTime: 60_000,
  });
  const serviceBase = settings?.serviceCustomDomain?.trim() || DEFAULT_SERVICE_BASE_DOMAIN;
  const [search, setSearch] = useState('');
  const domains = data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return domains;
    return domains.filter(
      (d) =>
        d.host.toLowerCase().includes(q) ||
        d.service?.name.toLowerCase().includes(q) ||
        d.service?.project?.name.toLowerCase().includes(q),
    );
  }, [domains, search]);

  const httpsDomains = domains.filter((d) => effectiveHttps(d, serviceBase)).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-ink">Domínios</h1>
          <p className="label mt-1">
            {domains.length} domínio{domains.length !== 1 ? 's' : ''}{domains.length > 0 && ` · ${httpsDomains} com HTTPS`}
          </p>
        </div>
        {domains.length > 0 && (
          <div className="relative w-full sm:w-72">
            <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              className="field pl-8 text-sm"
              placeholder="Buscar domínio ou serviço…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorNote message={(error as Error).message} />
      ) : domains.length === 0 ? (
        <Empty title="Nenhum domínio" hint="Adicione domínios na página de cada serviço." />
      ) : filtered.length === 0 ? (
        <Empty title={`Sem resultados para "${search}"`} hint="Tente outro termo." />
      ) : (
        <Card title={`${filtered.length} de ${domains.length} domínio(s)`}>
          <ul className="divide-y divide-line">
            {filtered.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <a
                    href={`${effectiveHttps(d, serviceBase) ? 'https' : 'http'}://${d.host}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 font-medium text-ink hover:text-brand"
                  >
                    <Icon name="globe" className="h-4 w-4 shrink-0 text-muted" />
                    {effectiveHttps(d, serviceBase) ? 'https://' : 'http://'}{d.host}
                    <Icon name="externalLink" className="h-3 w-3 text-muted" />
                  </a>
                  <div className="mt-0.5 flex items-center gap-2 pl-5 text-xs text-muted">
                    {d.service?.project && (
                      <Link to={`/service/${d.service.id}`} className="hover:text-ink">
                        {d.service.project.name} / {d.service.name}
                      </Link>
                    )}
                    <span>porta {d.targetPort}</span>
                  </div>
                </div>
                <span className={`flex items-center gap-1.5 text-xs font-medium ${certColor(d, serviceBase)}`}>
                  <Icon name="shield" className="h-3.5 w-3.5" />
                  {certLabel(d, serviceBase)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
