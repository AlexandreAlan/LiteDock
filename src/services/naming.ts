// Geração de endereço ALEATÓRIO e ÚNICO por serviço (multi-tenant).
// Vários clientes usam o mesmo domínio curinga *.litedock.morenadoaco.com.br, então
// o nome de um serviço novo tem que ser aleatório por padrão e NUNCA colidir com um
// já ocupado. Codinome legível (adjetivo-substantivo-hex) + checagem na tabela Domain.
import { randomBytes } from 'node:crypto';
import { prisma } from '../db.js';

const ADJ = [
  'veloz', 'calmo', 'rubro', 'aureo', 'nobre', 'agil', 'vivo', 'forte', 'claro',
  'sereno', 'bravo', 'lucido', 'firme', 'puro', 'leve', 'denso', 'fino', 'audaz',
];
const NOUN = [
  'aguia', 'tigre', 'rio', 'pico', 'cedro', 'lobo', 'falcao', 'coral', 'jade',
  'onix', 'lince', 'corvo', 'gama', 'tucano', 'jaguar', 'condor', 'raposa', 'puma',
];

function codename(): string {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = NOUN[Math.floor(Math.random() * NOUN.length)];
  const h = randomBytes(2).toString('hex'); // 4 chars hex -> 65k combinações por par
  return `${a}-${n}-${h}`;
}

// Base do "Domínio dos serviços" (Settings). Default: litedock.morenadoaco.com.br.
// Aceita o valor salvo como `*.dominio` ou `dominio` e devolve só o domínio base.
export async function servicesBaseDomain(): Promise<string> {
  const s = await prisma.setting.findFirst({ where: { key: 'serviceCustomDomain' } });
  const base = (s?.value ?? '').trim().replace(/^\*\./, '').replace(/\.$/, '');
  return base || 'litedock.morenadoaco.com.br';
}

// Gera um host único sob a base. Checa a tabela Domain e regenera em caso de colisão.
export async function generateUniqueHost(base: string): Promise<string> {
  for (let i = 0; i < 25; i++) {
    const host = `${codename()}.${base}`;
    const taken = await prisma.domain.findUnique({ where: { host } });
    if (!taken) return host;
  }
  // Fallback com mais entropia (colisão praticamente impossível).
  return `svc-${randomBytes(6).toString('hex')}.${base}`;
}
