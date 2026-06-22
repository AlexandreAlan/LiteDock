// Fila de jobs serial por chave (ex.: `deploy:<serviceId>`).
//
// Garante que só UM job por chave roda de cada vez — os demais entram numa
// corrente e executam em ordem. Isso dá, de graça, o "lock por serviço": dois
// deploys do mesmo serviço nunca se atropelam (remove/cria container em corrida).
//
// In-process de propósito: o estado DURÁVEL do deploy já vive no Postgres
// (tabela `Deployment`), então não precisamos de Redis pra ser confiável. A
// assinatura é simples e trocável por BullMQ na Fase 6 (multi-servidor), sem
// mexer em quem chama.

type Job<T> = () => Promise<T>;

// Última promessa da corrente por chave. Quando esvazia, a chave é removida.
const chains = new Map<string, Promise<unknown>>();

/**
 * Enfileira `job` sob `key`. Roda depois que o job anterior da mesma chave
 * terminar (com sucesso ou erro). Retorna a promessa do job — dá pra `await`
 * (lifecycle) ou disparar e seguir (deploy responde na hora e o cliente faz
 * polling).
 */
export function enqueue<T>(key: string, job: Job<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  // A corrente continua mesmo se o anterior falhou (não trava a fila do serviço).
  const run = prev.then(job, job);
  const settled = run.catch(() => undefined);
  chains.set(key, settled);
  // Libera memória quando a corrente esvazia (e ninguém enfileirou por cima).
  void settled.then(() => {
    if (chains.get(key) === settled) chains.delete(key);
  });
  return run;
}

/** Quantos jobs estão em corrente para a chave (0 = livre). Útil pra diagnóstico. */
export function isBusy(key: string): boolean {
  return chains.has(key);
}
