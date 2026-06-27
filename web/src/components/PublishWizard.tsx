// Wizard de publicação em 4 etapas: Projeto → Runtime → Porta/Domínio → Publicar
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import { Icon } from './icons';

interface WizardState {
  projectPath: string;
  projectName: string;
  runtime: 'pm2' | 'docker';
  startCmd: string;
  port: string;
  domain: string;
  envContent: string;
}

const DEFAULTS: WizardState = {
  projectPath: '',
  projectName: '',
  runtime: 'pm2',
  startCmd: '',
  port: '',
  domain: '',
  envContent: '',
};

const STEPS = ['Projeto', 'Runtime', 'Rede', 'Publicar'] as const;

// Detecta stack pelo nome do diretório / arquivos comuns
function guessRuntime(path: string): 'pm2' | 'docker' {
  const p = path.toLowerCase();
  if (p.includes('docker') || p.includes('compose')) return 'docker';
  return 'pm2';
}

function guessCmd(path: string): string {
  const p = path.toLowerCase();
  if (p.includes('next') || p.includes('react') || p.includes('vue')) return 'npm run start';
  if (p.includes('flask') || p.includes('django')) return 'python main.py';
  if (p.includes('fastapi')) return 'uvicorn main:app --host 0.0.0.0';
  return 'npm start';
}

// ─── Step indicators ─────────────────────────────────────────────────────────
function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
            i < current ? 'bg-ok text-white' : i === current ? 'bg-brand text-white' : 'bg-panel2 text-muted'
          }`}>
            {i < current ? '✓' : i + 1}
          </div>
          <span className={`ml-1.5 mr-3 text-xs font-medium hidden sm:inline ${i === current ? 'text-ink' : 'text-muted'}`}>
            {label}
          </span>
          {i < STEPS.length - 1 && <div className={`mr-3 h-px w-6 ${i < current ? 'bg-ok' : 'bg-line'}`} />}
        </div>
      ))}
    </div>
  );
}

// ─── Steps ───────────────────────────────────────────────────────────────────
function Step1({ s, setS }: { s: WizardState; setS: (p: Partial<WizardState>) => void }) {
  const QUICK = [
    '/var/www/clientes/altivaai',
    '/var/www/ssh-morenadoaco',
    '/var/www/litedock/litedock-v2',
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Informe o caminho do projeto na VPS.</p>

      <div>
        <label className="label mb-1.5 block text-sm font-medium text-ink">Caminho do projeto <span className="text-bad">*</span></label>
        <input
          value={s.projectPath}
          onChange={(e) => {
            const path = e.target.value;
            const name = path.split('/').filter(Boolean).pop() ?? '';
            setS({
              projectPath: path,
              projectName: name,
              runtime: guessRuntime(path),
              startCmd: guessCmd(path),
            });
          }}
          placeholder="/var/www/meu-projeto"
          className="field font-mono"
          autoFocus
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK.map((p) => (
            <button key={p} type="button"
              onClick={() => setS({ projectPath: p, projectName: p.split('/').pop() ?? '', runtime: guessRuntime(p), startCmd: guessCmd(p) })}
              className="rounded-lg border border-line bg-panel2 px-2.5 py-1 font-mono text-[11px] text-muted hover:border-brand/30 hover:text-brand transition-colors">
              {p.split('/').pop()}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label mb-1.5 block text-sm font-medium text-ink">Nome do serviço <span className="text-bad">*</span></label>
        <input
          value={s.projectName}
          onChange={(e) => setS({ projectName: e.target.value })}
          placeholder="meu-projeto"
          className="field"
        />
      </div>
    </div>
  );
}

function Step2({ s, setS }: { s: WizardState; setS: (p: Partial<WizardState>) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Como esse projeto será executado?</p>

      <div className="grid grid-cols-2 gap-3">
        {(['pm2', 'docker'] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setS({ runtime: r })}
            className={`flex flex-col items-center gap-3 rounded-xl border-2 p-5 text-center transition-all ${
              s.runtime === r
                ? 'border-brand bg-brand/5 text-brand'
                : 'border-line text-muted hover:border-brand/30 hover:bg-panel2'
            }`}
          >
            <Icon name={r === 'pm2' ? 'zap' : 'docker'} className="h-8 w-8" />
            <div>
              <div className="font-semibold text-sm text-ink">{r === 'pm2' ? 'PM2 (Node/Python)' : 'Docker Container'}</div>
              <div className="text-[11px] text-muted mt-0.5">
                {r === 'pm2' ? 'Processo gerenciado pelo PM2' : 'Container isolado com Docker'}
              </div>
            </div>
          </button>
        ))}
      </div>

      {s.runtime === 'pm2' && (
        <div>
          <label className="label mb-1.5 block text-sm font-medium text-ink">Comando de start <span className="text-bad">*</span></label>
          <input
            value={s.startCmd}
            onChange={(e) => setS({ startCmd: e.target.value })}
            placeholder="npm start"
            className="field font-mono"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {['npm start', 'npm run dev', 'node dist/index.js', 'python main.py', 'uvicorn main:app'].map((cmd) => (
              <button key={cmd} type="button"
                onClick={() => setS({ startCmd: cmd })}
                className="rounded-lg border border-line bg-panel2 px-2.5 py-1 font-mono text-[11px] text-muted hover:border-brand/30 hover:text-brand transition-colors">
                {cmd}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="label mb-1.5 block text-sm font-medium text-ink">Variáveis de ambiente (.env)</label>
        <textarea
          value={s.envContent}
          onChange={(e) => setS({ envContent: e.target.value })}
          placeholder={'NODE_ENV=production\nPORT=3000\nDATABASE_URL=...'}
          rows={4}
          className="field font-mono text-xs resize-none"
        />
      </div>
    </div>
  );
}

function Step3({ s, setS }: { s: WizardState; setS: (p: Partial<WizardState>) => void }) {
  const PORT_SUGGEST = ['3000', '8000', '8080', '4000', '5000'];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Configure a porta e o domínio para o serviço.</p>

      <div>
        <label className="label mb-1.5 block text-sm font-medium text-ink">Porta interna</label>
        <input
          value={s.port}
          onChange={(e) => setS({ port: e.target.value })}
          placeholder="3000"
          className="field font-mono"
          type="number"
          min="1"
          max="65535"
        />
        <div className="mt-2 flex gap-1.5">
          {PORT_SUGGEST.map((p) => (
            <button key={p} type="button"
              onClick={() => setS({ port: p })}
              className="rounded-lg border border-line bg-panel2 px-2.5 py-1 font-mono text-[11px] text-muted hover:border-brand/30 hover:text-brand transition-colors">
              :{p}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label mb-1.5 block text-sm font-medium text-ink">Domínio (opcional)</label>
        <input
          value={s.domain}
          onChange={(e) => setS({ domain: e.target.value })}
          placeholder="meu-app.morenadoaco.com.br"
          className="field"
        />
        <p className="mt-1 text-[11px] text-muted">
          Se preenchido, o Traefik vai criar uma rota HTTPS automática via Let's Encrypt.
        </p>
      </div>
    </div>
  );
}

function Step4({ s, onSubmit, busy }: { s: WizardState; onSubmit: () => void; busy: boolean }) {
  const rows: [string, string][] = [
    ['Caminho', s.projectPath],
    ['Nome', s.projectName],
    ['Runtime', s.runtime === 'pm2' ? `PM2 — ${s.startCmd}` : 'Docker Container'],
    ['Porta', s.port || '(nenhuma)'],
    ['Domínio', s.domain || '(nenhum)'],
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Revise e confirme a publicação.</p>

      <div className="overflow-hidden rounded-xl border border-line">
        {rows.map(([label, val]) => (
          <div key={label} className="flex items-start gap-3 border-b border-line/50 px-4 py-2.5 last:border-0">
            <span className="w-20 shrink-0 text-xs text-muted">{label}</span>
            <span className="font-mono text-xs text-ink break-all">{val}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onSubmit}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50 transition-colors"
      >
        {busy ? (
          <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Publicando…</>
        ) : (
          <><Icon name="rocket" className="h-4 w-4" />Publicar agora</>
        )}
      </button>
    </div>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────
interface Props { onClose: () => void; initialPath?: string }

export function PublishWizard({ onClose, initialPath }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [s, setStateRaw] = useState<WizardState>({
    ...DEFAULTS,
    projectPath: initialPath ?? '',
    projectName: initialPath?.split('/').pop() ?? '',
    runtime: guessRuntime(initialPath ?? ''),
    startCmd: guessCmd(initialPath ?? ''),
  });

  function setS(patch: Partial<WizardState>) {
    setStateRaw((prev) => ({ ...prev, ...patch }));
  }

  const publish = useMutation({
    mutationFn: () => api.post('/devspace/publish', {
      path: s.projectPath,
      name: s.projectName,
      runtime: s.runtime,
      cmd: s.startCmd,
      port: s.port ? Number(s.port) : undefined,
      domain: s.domain || undefined,
    }),
    onSuccess: () => {
      toast.success(`"${s.projectName}" publicado!`);
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['pm2-processes'] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function canNext() {
    if (step === 0) return s.projectPath.trim() && s.projectName.trim();
    if (step === 1) return s.runtime === 'docker' || s.startCmd.trim();
    return true;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-panel shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="font-semibold text-ink">Publicar serviço</h2>
            <div className="mt-2">
              <StepBar current={step} />
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-panel2">
            <Icon name="trash" className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {step === 0 && <Step1 s={s} setS={setS} />}
          {step === 1 && <Step2 s={s} setS={setS} />}
          {step === 2 && <Step3 s={s} setS={setS} />}
          {step === 3 && <Step4 s={s} onSubmit={() => publish.mutate()} busy={publish.isPending} />}
        </div>

        {/* Footer */}
        {step < 3 && (
          <div className="flex items-center justify-between border-t border-line px-6 py-4">
            <button
              onClick={() => setStep((n) => Math.max(0, n - 1))}
              disabled={step === 0}
              className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:bg-panel2 disabled:opacity-40"
            >
              Voltar
            </button>
            <button
              onClick={() => setStep((n) => n + 1)}
              disabled={!canNext()}
              className="flex items-center gap-2 rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-40"
            >
              {step === 2 ? 'Revisar' : 'Próximo'}
              <Icon name="chevronRight" className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
