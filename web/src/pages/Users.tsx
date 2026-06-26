import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type User } from '../lib/api';
import { useAuth } from '../lib/auth';
import { toast } from '../lib/toast';
import { Modal } from '../components/Modal';
import { Spinner, ErrorNote } from '../components/ui';
import { Icon } from '../components/icons';

const ROLES = ['owner', 'admin', 'member'] as const;
type Role = (typeof ROLES)[number];

const ROLE_LABEL: Record<Role, string> = { owner: 'Dono', admin: 'Admin', member: 'Membro' };
const ROLE_COLOR: Record<Role, string> = {
  owner: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  admin: 'bg-brand/15 text-brand border-brand/25',
  member: 'bg-panel2 text-muted border-line',
};

// Gradiente de avatar por letra (visual rico sem foto real)
const AVATAR_COLORS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-amber-600',
  'from-pink-500 to-rose-600',
  'from-indigo-500 to-blue-600',
];

function avatarGradient(user: User): string {
  const src = user.name?.trim() || user.email;
  const idx = src.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function initials(user: User): string {
  const src = user.name?.trim() || user.email;
  return src
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');
}

interface CreateForm { email: string; password: string; name: string; role: Role }
interface EditForm { name: string; role: Role; password: string }

export function Users() {
  const qc = useQueryClient();
  const { user: me } = useAuth();

  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [form, setForm] = useState<CreateForm>({ email: '', password: '', name: '', role: 'member' });
  const [editForm, setEditForm] = useState<EditForm>({ name: '', role: 'member', password: '' });

  const { data, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/users'),
    refetchInterval: 30_000,
  });

  const createMut = useMutation({
    mutationFn: () => api.post<User>('/users', { email: form.email, password: form.password, name: form.name || undefined, role: form.role }),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setCreating(false);
      setForm({ email: '', password: '', name: '', role: 'member' });
      toast.success(`Usuário "${u.email}" criado.`);
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const editMut = useMutation({
    mutationFn: () => {
      const body: Record<string, string> = {};
      if (editForm.name.trim()) body.name = editForm.name.trim();
      if (editForm.role) body.role = editForm.role;
      if (editForm.password.trim()) body.password = editForm.password.trim();
      return api.patch(`/users/${editTarget!.id}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setEditTarget(null);
      toast.success('Usuário atualizado.');
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.del(`/users/${deleteTarget!.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setDeleteTarget(null);
      toast.success('Usuário removido.');
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  function openEdit(u: User) {
    setEditForm({ name: u.name ?? '', role: (u.role as Role) ?? 'member', password: '' });
    setEditTarget(u);
  }

  if (isLoading) return <Spinner />;
  if (error) return <ErrorNote message={(error as Error).message} />;

  const users = data ?? [];
  const isOwner = me?.role === 'owner';

  const filtered = search.trim()
    ? users.filter((u) =>
        [u.email, u.name ?? ''].some((s) => s.toLowerCase().includes(search.trim().toLowerCase()))
      )
    : users;

  const counts = {
    owner: users.filter((u) => u.role === 'owner').length,
    admin: users.filter((u) => u.role === 'admin').length,
    member: users.filter((u) => u.role === 'member').length,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Usuários</h1>
          <p className="label mt-1">{users.length} {users.length === 1 ? 'conta' : 'contas'} registradas</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-brand flex items-center gap-2">
          <Icon name="plus" className="h-4 w-4" /> Novo usuário
        </button>
      </div>

      {/* Stats pills */}
      <div className="flex flex-wrap gap-3">
        {([['owner', 'Donos', 'text-amber-400'], ['admin', 'Admins', 'text-brand'], ['member', 'Membros', 'text-muted']] as const).map(
          ([role, label, color]) => (
            <div key={role} className="plate-2 flex items-center gap-3 px-4 py-2.5">
              <span className={`text-xl font-bold tabular-nums ${color}`}>{counts[role]}</span>
              <span className="text-sm text-muted">{label}</span>
            </div>
          )
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          className="field pl-9"
          placeholder="Buscar por e-mail ou nome…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((u) => (
          <UserCard
            key={u.id}
            user={u}
            isMe={u.id === me?.id}
            isOwner={isOwner}
            onEdit={() => openEdit(u)}
            onDelete={() => setDeleteTarget(u)}
            avatarGradient={avatarGradient(u)}
            initials={initials(u)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full py-16 text-center text-sm text-muted">
            {search ? 'Nenhum usuário encontrado para essa busca.' : 'Nenhum usuário cadastrado.'}
          </div>
        )}
      </div>

      {/* Modal: criar */}
      <Modal open={creating} onClose={() => setCreating(false)} title="Novo usuário">
        <div className="space-y-4 p-4">
          <div>
            <label className="label mb-1 block">E-mail <span className="text-bad">*</span></label>
            <input className="field" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="usuario@exemplo.com" />
          </div>
          <div>
            <label className="label mb-1 block">Senha <span className="text-bad">*</span></label>
            <input className="field" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="mínimo 6 caracteres" />
          </div>
          <div>
            <label className="label mb-1 block">Nome (opcional)</label>
            <input className="field" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nome completo" />
          </div>
          <div>
            <label className="label mb-1 block">Papel</label>
            <select className="field" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}>
              {ROLES.filter((r) => r !== 'owner' || isOwner).map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-ghost text-sm" onClick={() => setCreating(false)}>Cancelar</button>
            <button
              className="btn-brand text-sm"
              disabled={!form.email || !form.password || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? 'Criando…' : 'Criar usuário'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: editar */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={`Editar — ${editTarget?.email ?? ''}`}>
        <div className="space-y-4 p-4">
          <div>
            <label className="label mb-1 block">Nome</label>
            <input className="field" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nome completo" />
          </div>
          <div>
            <label className="label mb-1 block">Papel</label>
            <select className="field" value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as Role }))} disabled={editTarget?.id === me?.id}>
              {ROLES.filter((r) => r !== 'owner' || isOwner).map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
            {editTarget?.id === me?.id && <p className="mt-1 text-xs text-muted">Não é possível alterar seu próprio papel.</p>}
          </div>
          <div>
            <label className="label mb-1 block">Nova senha (deixe em branco para manter)</label>
            <input className="field" type="password" value={editForm.password} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} placeholder="mínimo 6 caracteres" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-ghost text-sm" onClick={() => setEditTarget(null)}>Cancelar</button>
            <button className="btn-brand text-sm" disabled={editMut.isPending} onClick={() => editMut.mutate()}>
              {editMut.isPending ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: confirmar exclusão */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Remover usuário">
        <div className="space-y-4 p-4">
          <p className="text-sm text-ink">
            Remover <span className="font-semibold">{deleteTarget?.email}</span>? Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost text-sm" onClick={() => setDeleteTarget(null)}>Cancelar</button>
            <button className="rounded-lg bg-bad px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate()}>
              {deleteMut.isPending ? 'Removendo…' : 'Remover'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function UserCard({
  user,
  isMe,
  isOwner,
  onEdit,
  onDelete,
  avatarGradient: grad,
  initials: ini,
}: {
  user: User;
  isMe: boolean;
  isOwner: boolean;
  onEdit: () => void;
  onDelete: () => void;
  avatarGradient: string;
  initials: string;
}) {
  const role = (ROLES.includes(user.role as Role) ? user.role : 'member') as Role;
  const canDelete = isOwner && !isMe;

  return (
    <div className="card flex flex-col gap-4 p-5 transition-all hover:border-brand/30">
      {/* Avatar + name */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${grad} text-sm font-bold text-white shadow-lg`}>
            {ini}
          </div>
          <div className="min-w-0">
            {user.name && <div className="truncate font-semibold text-ink">{user.name}</div>}
            <div className={`truncate text-sm ${user.name ? 'text-muted' : 'font-semibold text-ink'}`}>{user.email}</div>
            {isMe && <span className="inline-block rounded border border-brand/30 bg-brand/5 px-1.5 py-0.5 text-[10px] text-brand">você</span>}
          </div>
        </div>
        {/* Actions */}
        <div className="flex shrink-0 gap-1">
          <button onClick={onEdit} className="rounded-lg p-1.5 text-muted hover:bg-panel2 hover:text-ink" title="Editar">
            <Icon name="pencil" className="h-3.5 w-3.5" />
          </button>
          {canDelete && (
            <button onClick={onDelete} className="rounded-lg p-1.5 text-muted hover:bg-bad/10 hover:text-bad" title="Remover">
              <Icon name="trash" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-line" />

      {/* Badges */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${ROLE_COLOR[role]}`}>
          {ROLE_LABEL[role]}
        </span>
        <div className="flex items-center gap-2">
          {user.totpEnabled ? (
            <span className="flex items-center gap-1 text-xs text-ok">
              <Icon name="shield" className="h-3 w-3" /> 2FA
            </span>
          ) : (
            <span className="text-xs text-muted/60">sem 2FA</span>
          )}
          {user.createdAt && (
            <span className="text-xs text-muted/60">
              {new Date(user.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
