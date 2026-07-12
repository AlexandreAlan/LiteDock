// Config do pm2 para o Deploy Worker do LiteDock (FastAPI/Python).
//
// IMPORTANTE — por que `interpreter: 'none'`:
// o `script` aqui é o binário `uvicorn` dentro do virtualenv (`.venv/bin/uvicorn`),
// não um arquivo `.js`. Sem `interpreter: 'none'` o pm2 tenta carregar esse
// binário como se fosse um módulo Node e quebra com
// `SyntaxError: Unexpected identifier 'uvicorn'` (crash-loop). Com
// `interpreter: 'none'` o pm2 apenas executa o binário diretamente, como um
// processo externo — o mesmo padrão usado por qualquer app não-Node.
//
// O `.venv` é local (gitignored) e criado pelo setup do worker
// (`python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`);
// este arquivo só documenta/versiona como o pm2 deve iniciá-lo, sem recriar
// o ambiente.
module.exports = {
  apps: [
    {
      name: 'litedock-deploy-worker',
      script: '.venv/bin/uvicorn',
      args: 'main:app --host 127.0.0.1 --port 8089',
      interpreter: 'none',
      cwd: '/var/www/litedock/litedock-v2/deploy-worker',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
    },
  ],
};
