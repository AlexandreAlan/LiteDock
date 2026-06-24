// Config do pm2 para a API do LiteDock.
//
// IMPORTANTE — por que NÃO usamos `npm run start`:
// rodar via `npm` cria a cadeia pm2 → npm → node. O `npm` NÃO repassa os sinais
// (SIGTERM/SIGINT) pro node filho, então o graceful shutdown nunca recebia o
// sinal. Aqui rodamos a API como PROCESSO ÚNICO (`node --import tsx src/server.ts`),
// então o sinal do pm2 chega direto no handler de encerramento.
//
// `kill_timeout`: o pm2 manda SIGINT, espera esse tempo e só então SIGKILL. O
// handler (app.close + reconciliação de deploys via Docker proxy) precisa de uns
// segundos; 12s dá folga (o app ainda tem um auto-exit interno de 8s como rede).
module.exports = {
  apps: [
    {
      name: 'litedock-v2-api',
      script: 'src/server.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      cwd: '/home/alexandrealan/litedock-v2',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      kill_timeout: 12000,
    },
  ],
};
