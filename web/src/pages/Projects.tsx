import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Project, type Service } from '../lib/api';
import { toast } from '../lib/toast';
import { Modal } from '../components/Modal';
import { MetricsBar } from '../components/MetricsBar';
import { StatusDot } from '../components/StatusDot';
import { Icon } from '../components/icons';
import { Spinner, Empty } from '../components/ui';
import { PublishWizard } from '../components/PublishWizard';

function typeLabel(s: Service): string {
  if (s.type === 'app') return 'app';
  const spec = (s.spec ?? {}) as Record<string, unknown>;
  const engine = (spec.engine as string) || (spec.image as string) || 'database';
  return engine.split(':')[0].split('/').pop() || 'database';
}

type View = 'expanded' | 'collapsed';

function loadOrder(): string[] {
  try { return JSON.parse(localStorage.getItem('litedock_proj_order') ?? '[]') as string[]; }
  catch { return []; }
}
function saveOrder(ids: string[]) {
  localStorage.setItem('litedock_proj_order', JSON.stringify(ids));
}
function reorderIds(ids: string[], srcId: string, targetId: string, pos: 'above' | 'below'): string[] {
  const result = ids.filter((id) => id !== srcId);
  const tgtIdx = result.indexOf(targetId);
  result.splice(pos === 'above' ? tgtIdx : tgtIdx + 1, 0, srcId);
  return result;
}

export function Projects() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get<Project[]>('/projects'),
    refetchInterval: 30000,
  });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [view, setView] = useState<View>('expanded');
  const [search, setSearch] = useState('');
  const [wizard, setWizard] = useState(false);

  // ── Reordenar projetos ────────────────────────────────────────────────────
  const [order, setOrder] = useState<string[]>(loadOrder);
  const projDragId = useRef<string | null>(null);
  const [projDragOver, setProjDragOver] = useState<{ id: string; pos: 'above' | 'below' } | null>(null);
  const [projDragging, setProjDragging] = useState<string | null>(null);

  // ── Mover serviço entre projetos ─────────────────────────────────────────
  const svcDrag = useRef<{ svcId: string; fromProjectId: string } | null>(null);
  const [svcDropTarget, setSvcDropTarget] = useState<string | null>(null);
  const [svcDragging, setSvcDragging] = useState<string | null>(null);

  const projects = useMemo(() => {
    const list = [...(data ?? [])];
    const known = order.filter((id) => list.some((p) => p.id === id));
    const ordered = known.map((id) => list.find((p) => p.id === id)!).filter(Boolean);
    const remaining = list.filter((p) => !known.includes(p.id));
    const sorted = [...ordered, ...remaining];
    if (!search.trim()) return sorted;
    const q = search.trim().toLowerCase();
    return sorted.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.services ?? []).some((s) => s.name.toLowerCase().includes(q)),
    );
  }, [data, search, order]);

  const create = useMutation({
    mutationFn: () => api.post<Project>('/projects', { name }),
    onSuccess: (p) => { qc.invalidateQueries({ queryKey: ['projects'] }); setOpen(false); setName(''); toast.success(`Projeto "${p.name}" criado.`); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  // ── Handlers: reordenar projetos ─────────────────────────────────────────
  const onProjDragStart = (id: string) => (e: React.DragEvent) => {
    projDragId.current = id;
    setProjDragging(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('type', 'project');
  };
  const onProjDragOver = (id: string) => (e: React.DragEvent) => {
    if (svcDrag.current) return;
    e.preventDefault();
    if (!projDragId.current || projDragId.current === id) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pos: 'above' | 'below' = e.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
    if (projDragOver?.id !== id || projDragOver.pos !== pos) setProjDragOver({ id, pos });
  };
  const onProjDrop = (targetId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const src = projDragId.current;
    if (!src || src === targetId) { cleanupProj(); return; }
    const ids = projects.map((p) => p.id);
    const newIds = reorderIds(ids, src, targetId, projDragOver?.pos ?? 'below');
    saveOrder(newIds);
    setOrder(newIds);
    cleanupProj();
  };
  function cleanupProj() { projDragId.current = null; setProjDragging(null); setProjDragOver(null); }

  // ── Handlers: mover serviço ───────────────────────────────────────────────
  const onSvcDragStart = (svcId: string, fromProjectId: string) => (e: React.DragEvent) => {
    e.stopPropagation();
    svcDrag.current = { svcId, fromProjectId };
    setSvcDragging(svcId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('svc', svcId);
  };
  const onProjDropZoneOver = (projectId: string) => (e: React.DragEvent) => {
    if (!svcDrag.current || svcDrag.current.fromProjectId === projectId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setSvcDropTarget(projectId);
  };
  const onProjDropZoneDrop = (projectId: string) => async (e: React.DragEvent) => {
    e.preventDefault();
    const drag = svcDrag.current;
    if (!drag || drag.fromProjectId === projectId) { cleanupSvc(); return; }
    try {
      await api.patch(`/services/${drag.svcId}/move`, { projectId });
      await qc.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Serviço movido.');
    } catch (err) {
      toast.error((err as Error).message);
    }
    cleanupSvc();
  };
  const onSvcDragEnd = () => cleanupSvc();
  function cleanupSvc() { svcDrag.current = null; setSvcDragging(null); setSvcDropTarget(null); }

  const movingService = !!svcDragging;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <MetricsBar />
      {wizard && <PublishWizard onClose={() => setWizard(false)} />}

      {/* cabeçalho + toolbar */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <h2 className="text-xl font-semibold text-ink">Projetos</h2>
        <div className="relative flex-1 sm:max-w-xs">
          <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            className="field pl-8 text-sm"
            placeholder="Buscar projeto ou serviço…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/10 px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand/20 transition-colors"
            onClick={() => setWizard(true)}
          >
            <Icon name="rocket" className="h-4 w-4" /> Publicar
          </button>
          <Segmented
            value={view}
            onChange={(v) => setView(v as View)}
            options={[{ v: 'expanded', label: 'Expandido' }, { v: 'collapsed', label: 'Colapsado' }]}
          />
        </div>
      </div>

      {/* resumo */}
      {data && data.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
          {(() => {
            const allSvcs = data.flatMap((p) => p.services ?? []);
            const running = allSvcs.filter((s) => s.status === 'running' || s.status === 'online').length;
            return (
              <>
                <span><span className="font-semibold text-ink">{data.length}</span> projeto{data.length !== 1 ? 's' : ''}</span>
                <span><span className="font-semibold text-ink">{allSvcs.length}</span> serviço{allSvcs.length !== 1 ? 's' : ''}</span>
                <span className="text-ok"><span className="font-semibold">{running}</span> rodando</span>
                {movingService && (
                  <span className="flex items-center gap-1 text-warn/80 text-xs">
                    <Icon name="folder" className="h-3.5 w-3.5" /> Solte sobre um projeto para mover
                  </span>
                )}
              </>
            );
          })()}
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <Empty title="Não consegui carregar" hint={(error as Error).message} />
      ) : projects.length === 0 ? (
        search ? (
          <Empty title={`Sem resultados para "${search}"`} hint="Tente outro termo ou limpe a busca." />
        ) : (
          <Empty
            title="Nenhum projeto ainda"
            hint="Crie seu primeiro projeto para começar a subir apps e bancos."
            action={<button className="btn-brand" onClick={() => setOpen(true)}>Criar projeto</button>}
          />
        )
      ) : (
        <div className="space-y-7">
          {projects.map((p) => {
            const isProjDragging = projDragging === p.id;
            const isProjOver = projDragOver?.id === p.id;
            const isSvcTarget = svcDropTarget === p.id;
            const isSourceProj = svcDrag.current?.fromProjectId === p.id;

            return (
              <section
                key={p.id}
                draggable={!movingService}
                onDragStart={!movingService ? onProjDragStart(p.id) : undefined}
                onDragOver={!movingService ? onProjDragOver(p.id) : undefined}
                onDrop={!movingService ? onProjDrop(p.id) : undefined}
                onDragEnd={cleanupProj}
                className={[
                  'space-y-3 rounded-xl p-1 -m-1 select-none transition-all duration-150',
                  isProjDragging ? 'opacity-40' : '',
                ].filter(Boolean).join(' ')}
              >
                {isProjOver && projDragOver?.pos === 'above' && (
                  <div className="h-0.5 rounded-full bg-brand" />
                )}

                {/* cabeçalho */}
                <div
                  onDragOver={movingService && !isSourceProj ? onProjDropZoneOver(p.id) : undefined}
                  onDrop={movingService && !isSourceProj ? onProjDropZoneDrop(p.id) : undefined}
                  onDragLeave={movingService ? () => setSvcDropTarget(null) : undefined}
                  className={[
                    'flex items-center gap-2 rounded-lg px-2 py-1 -mx-2 transition-all duration-150',
                    isSvcTarget ? 'bg-brand/15 ring-2 ring-brand/40' : '',
                    !movingService ? 'cursor-grab active:cursor-grabbing' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <Icon name="grip" className="h-4 w-4 shrink-0 text-muted/40 hover:text-muted" />
                  {isSvcTarget && <Icon name="folder" className="h-4 w-4 shrink-0 text-brand animate-pulse" />}
                  <Link
                    to={`/project/${p.id}`}
                    className="text-base font-semibold text-ink hover:underline"
                    onClick={(e) => { if (isProjDragging) e.preventDefault(); }}
                  >
                    {p.name}
                  </Link>
                  <div className="flex items-center gap-0.5 text-muted">
                    <Link to={`/project/${p.id}`} title="Abrir projeto" className="rounded p-1 hover:bg-panel2 hover:text-ink"><Icon name="folder" className="h-4 w-4" /></Link>
                    <Link to={`/project/${p.id}`} title="Configurar" className="rounded p-1 hover:bg-panel2 hover:text-ink"><Icon name="settings" className="h-4 w-4" /></Link>
                    <Link to={`/project/${p.id}`} title="Adicionar serviço" className="rounded p-1 hover:bg-panel2 hover:text-ink"><Icon name="plus" className="h-4 w-4" /></Link>
                    <Link to={`/project/${p.id}`} title="Layout" className="rounded p-1 hover:bg-panel2 hover:text-ink"><Icon name="layout" className="h-4 w-4" /></Link>
                  </div>
                  <span className="ml-1 text-xs text-muted">
                    {(() => {
                      const total = p.services?.length ?? 0;
                      const running = (p.services ?? []).filter((s) => s.status === 'running' || s.status === 'online').length;
                      if (total === 0) return '0 serviços';
                      if (running > 0) return <><span className="text-ok font-semibold">{running}</span>/{total} rodando</>;
                      return `${total} serviço${total !== 1 ? 's' : ''}`;
                    })()}
                  </span>
                </div>

                {/* cards de serviço */}
                {view === 'expanded' &&
                  ((p.services?.length ?? 0) === 0 ? (
                    <div
                      onDragOver={movingService && !isSourceProj ? onProjDropZoneOver(p.id) : undefined}
                      onDrop={movingService && !isSourceProj ? onProjDropZoneDrop(p.id) : undefined}
                      onDragLeave={movingService ? () => setSvcDropTarget(null) : undefined}
                      className={[
                        'rounded-lg border border-dashed px-4 py-5 text-sm text-center text-muted transition-all',
                        isSvcTarget ? 'border-brand bg-brand/10 text-brand' : 'border-line',
                      ].join(' ')}
                    >
                      {isSvcTarget ? 'Solte aqui para mover o serviço' : '+ Adicionar serviço'}
                    </div>
                  ) : (
                    <div
                      onDragOver={movingService && !isSourceProj ? onProjDropZoneOver(p.id) : undefined}
                      onDrop={movingService && !isSourceProj ? onProjDropZoneDrop(p.id) : undefined}
                      onDragLeave={movingService ? () => setSvcDropTarget(null) : undefined}
                      className={[
                        'grid gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-xl p-1 -m-1 transition-all duration-150',
                        isSvcTarget ? 'ring-2 ring-brand/30 bg-brand/5' : '',
                      ].join(' ')}
                    >
                      {p.services!.map((s) => {
                        const primaryDomain = s.domains?.[0];
                        const isDraggingThis = svcDragging === s.id;
                        return (
                          <Link
                            key={s.id}
                            to={`/service/${s.id}`}
                            draggable
                            onDragStart={onSvcDragStart(s.id, p.id)}
                            onDragEnd={onSvcDragEnd}
                            className={[
                              'card flex items-center justify-between gap-2 p-3.5 transition-all hover:shadow-pop',
                              isDraggingThis ? 'opacity-40 scale-95' : 'cursor-grab active:cursor-grabbing',
                            ].join(' ')}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-ink">{s.name}</div>
                              {primaryDomain ? (
                                <div className="mt-0.5 truncate text-xs text-brand/70">{primaryDomain.host}</div>
                              ) : (
                                <div className="mt-0.5 text-xs text-muted">{typeLabel(s)}</div>
                              )}
                            </div>
                            <StatusDot state={s.status} />
                          </Link>
                        );
                      })}
                      {isSvcTarget && (
                        <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-brand/40 bg-brand/5 p-3.5 text-xs text-brand/70">
                          Solte aqui
                        </div>
                      )}
                    </div>
                  ))}

                {isProjOver && projDragOver?.pos === 'below' && (
                  <div className="h-0.5 rounded-full bg-brand" />
                )}
              </section>
            );
          })}

          {/* Card "Adicionar novo Projeto" no fim da lista */}
          {!search && (
            <button
              onClick={() => setOpen(true)}
              className="w-full rounded-xl border border-dashed border-line px-4 py-4 text-sm text-muted hover:border-brand/50 hover:text-brand hover:bg-brand/5 transition-all flex items-center justify-center gap-2"
            >
              <Icon name="plus" className="h-4 w-4" />
              Adicionar novo Projeto
            </button>
          )}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Criar projeto"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn-brand" disabled={!name || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? 'Criando…' : 'Criar'}
            </button>
          </>
        }
      >
        <div>
          <label className="label mb-1 block">Nome do projeto</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="meu-projeto" autoFocus />
        </div>
        {create.error instanceof Error && <p className="mt-2 text-sm text-bad">{create.error.message}</p>}
      </Modal>
    </div>
  );
}

function Segmented({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { v: string; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-panel p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${value === o.v ? 'bg-panel2 text-ink' : 'text-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
