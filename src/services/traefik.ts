// Gera os labels do Traefik pra um serviço (roteamento + TLS).
// Traefik so roteia containers com `litedock.managed=true` (constraint), entao
// a produção do host (sem esse label) nunca é tocada.

export interface RouteOpts {
  serviceId: string;
  routerName: string;   // unico por serviço
  hosts: string[];      // dominios (Host rule)
  port: number;         // porta interna do container
  tls: boolean;         // https via Let's Encrypt (resolver 'le')
}

export function traefikLabels(opts: RouteOpts): Record<string, string> {
  const labels: Record<string, string> = {
    'litedock.managed': 'true',
    'litedock.service': opts.serviceId,
    'traefik.enable': 'true',
  };

  if (opts.hosts.length > 0) {
    const r = opts.routerName;
    const rule = opts.hosts.map((h) => `Host(\`${h}\`)`).join(' || ');
    labels[`traefik.http.routers.${r}.rule`] = rule;
    labels[`traefik.http.routers.${r}.entrypoints`] = opts.tls ? 'websecure' : 'web';
    labels[`traefik.http.services.${r}.loadbalancer.server.port`] = String(opts.port);
    if (opts.tls) {
      labels[`traefik.http.routers.${r}.tls`] = 'true';
      labels[`traefik.http.routers.${r}.tls.certresolver`] = 'le';
    }
  }
  return labels;
}
