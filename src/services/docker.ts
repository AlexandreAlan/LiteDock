// Camada de acesso a Docker Engine API (via dockerode).
import Docker from 'dockerode';
import { config } from '../config.js';

export const docker = new Docker({ socketPath: config.dockerSocket });

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  running: boolean;
  managed: boolean;
}

// Lista todos os containers do host (leitura). Marca os gerenciados pelo LiteDock.
export async function listContainers(): Promise<ContainerInfo[]> {
  const list = await docker.listContainers({ all: true });
  return list.map((c) => {
    const name = (c.Names?.[0] || '').replace(/^\//, '');
    return {
      id: c.Id.slice(0, 12),
      name,
      image: c.Image,
      state: c.State,
      status: c.Status,
      running: c.State === 'running',
      managed: c.Labels?.['litedock.managed'] === 'true',
    };
  });
}

// Telemetria do host: versao + contagem de containers/imagens + CPU/memoria.
// Combina docker.version() (ping) com docker.info() (metricas do engine).
export async function engineInfo() {
  const [v, info] = await Promise.all([docker.version(), docker.info()]);
  return {
    version: v.Version,
    apiVersion: v.ApiVersion,
    os: v.Os,
    arch: v.Arch,
    // Espelha os nomes esperados pelo painel.
    serverVersion: info.ServerVersion,
    name: info.Name,
    ncpu: info.NCPU,
    memTotal: info.MemTotal,
    containers: info.Containers,
    containersRunning: info.ContainersRunning,
    containersStopped: info.ContainersStopped,
    containersPaused: info.ContainersPaused,
    images: info.Images,
  };
}
