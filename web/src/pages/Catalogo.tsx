import { useState } from 'react';
import { Card } from '../components/Card';

// Catálogo curado de modelos. O deploy real fica desligado em "modo seguro" —
// a ação fica visível, mas guardada até a gente ligar a produção.
const TEMPLATES = [
  { key: 'postgres', name: 'PostgreSQL', tag: 'banco', desc: 'Banco relacional robusto.', glyph: '🐘' },
  { key: 'mysql', name: 'MySQL', tag: 'banco', desc: 'Banco relacional clássico.', glyph: '🐬' },
  { key: 'redis', name: 'Redis', tag: 'cache', desc: 'Cache e fila em memória.', glyph: '🧱' },
  { key: 'mongo', name: 'MongoDB', tag: 'banco', desc: 'Banco de documentos.', glyph: '🍃' },
  { key: 'n8n', name: 'n8n', tag: 'automação', desc: 'Automação de fluxos low-code.', glyph: '🔗' },
  { key: 'minio', name: 'MinIO', tag: 'storage', desc: 'Object storage S3-compatível.', glyph: '🪣' },
  { key: 'ghost', name: 'Ghost', tag: 'cms', desc: 'Publicação e blog moderno.', glyph: '👻' },
  { key: 'wordpress', name: 'WordPress', tag: 'cms', desc: 'O CMS mais usado do mundo.', glyph: '📰' },
  { key: 'metabase', name: 'Metabase', tag: 'BI', desc: 'Dashboards e analytics.', glyph: '📊' },
];

export function Catalogo() {
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Catálogo</h1>
        <p className="stamp mt-1">modelos prontos para subir em um clique</p>
      </div>

      <div className="flex items-center gap-2 rounded-md border border-copper-dim/40 bg-copper/10 px-3 py-2">
        <span className="h-1.5 w-1.5 rounded-full bg-copper" />
        <span className="font-mono text-xs text-copper-bright">
          Modo seguro ligado — instalar está desativado até você liberar a produção.
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((t) => (
          <Card key={t.key} className="flex flex-col">
            <div className="flex items-start gap-3">
              <span className="text-2xl">{t.glyph}</span>
              <div className="min-w-0">
                <div className="font-display text-lg text-ink">{t.name}</div>
                <span className="stamp">{t.tag}</span>
              </div>
            </div>
            <p className="mt-3 flex-1 font-mono text-xs leading-relaxed text-muted">{t.desc}</p>
            <button
              className="btn-ghost mt-4 w-full opacity-60"
              onClick={() => setPicked(t.key)}
              title="Disponível quando a produção for liberada"
            >
              instalar
            </button>
          </Card>
        ))}
      </div>

      {picked && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPicked(null)}
        >
          <div className="plate max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-xl text-ink">Instalação em modo seguro</h2>
            <p className="mt-3 font-mono text-sm leading-relaxed text-muted">
              O LiteDock está rodando com as ações de deploy travadas para proteger os
              sistemas que já operam nesta VPS. Quando a gente ligar a produção, este
              botão sobe o <span className="text-copper-bright">{picked}</span> de verdade.
            </p>
            <button className="btn-copper mt-5 w-full" onClick={() => setPicked(null)}>
              entendi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
