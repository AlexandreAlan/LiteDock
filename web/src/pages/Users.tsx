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
  owner: 'bg-amber-500/15 text-amber-500',
  admin: 'bg-brand/15 text-brand',
  member: 'bg-panel2 text-muted',
};

function RoleBadge({ role }: { role: string }) {
  const r = (ROLES.includes(role as Role) ? role : 'member') as Role;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${ROLE_COLOR[r]}`}>
      {ROLE_LABEL[r]}
    </span>
  );
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

  const { data, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/users'),
    refetchInterval: 30_000,
  });

  const [creating, setCreating] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [form, setForm] = useState<CreateForm>({ email: '', password: '', name: '', role: 'member' });
  const [editForm, setEditForm] = useState<EditForm>({ name: '', role: 'member', password: '' });

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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink">Usuários</h2>
          <p className="mt-0.5 text-sm text-muted">{users.length} {users.length === 1 ? 'conta' : 'contas'} registradas</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-brand flex items-center gap-1.5 text-sm">
          <Icon name="plus" className="h-4 w-4" /> Novo usuário
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-panel">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">Usuário</th>
              <th className="px-4 py-3 font-medium">Papel</th>
              <th className="px-4 py-3 font-medium">2FA</th>
              <th className="px-4 py-3 font-medium">Criado em</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => (
              <tr key={u.id} className="group transition-colors hover:bg-panel2/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[11px] font-bold text-brand">
                      {initials(u)}
                    </span>
                    <div className="min-w-0">
                      {u.name && <div className="truncate font-medium text-ink">{u.name}</div>}
                      <div className={`truncate text-xs ${u.name ? 'text-muted' : 'font-medium text-ink'}`}>{u.email}</div>
                    </div>
                    {u.id === me?.id && (
                      <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">você</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <RoleBadge role={u.role} />
                </td>
                <td className="px-4 py-3">
                  {u.totpEnabled ? (
                    <span className="flex items-center gap-1 text-ok text-xs"><Icon name="check" className="h-3.5 w-3.5" /> ativo</span>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR') : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => openEdit(u)}
                      className="rounded p-1.5 text-muted hover:bg-panel2 hover:text-ink"
                      title="Editar"
                    >
                      <Icon name="pencil" className="h-4 w-4" />
                    </button>
                    {u.id !== me?.id && (
                      <button
                        onClick={() => setDeleteTarget(u)}
                        className="rounded p-1.5 text-muted hover:bg-bad/10 hover:text-bad"
                        title="Remover"
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="py-12 text-center text-sm text-muted">Nenhum usuário encontrado.</div>
        )}
      </div>

      {/* Modal: criar usuário */}
      <Modal open={creating} onClose={() => setCreating(false)} title="Novo usuário">
        <div className="space-y-4 p-4">
          <div>
            <label className="label">E-mail *</label>
            <input className="field" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="usuario@exemplo.com" />
          </div>
          <div>
            <label className="label">Senha *</label>
            <input className="field" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="mínimo 6 caracteres" />
          </div>
          <div>
            <label className="label">Nome (opcional)</label>
            <input className="field" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nome completo" />
          </div>
          <div>
            <label className="label">Papel</label>
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

      {/* Modal: editar usuário */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={`Editar — ${editTarget?.email ?? ''}`}>
        <div className="space-y-4 p-4">
          <div>
            <label className="label">Nome</label>
            <input className="field" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nome completo" />
          </div>
          <div>
            <label className="label">Papel</label>
            <select className="field" value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as Role }))} disabled={editTarget?.id === me?.id}>
              {ROLES.filter((r) => r !== 'owner' || isOwner).map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
            {editTarget?.id === me?.id && <p className="mt-1 text-xs text-muted">Não é possível alterar seu próprio papel.</p>}
          </div>
          <div>
            <label className="label">Nova senha (deixe em branco para manter)</label>
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
