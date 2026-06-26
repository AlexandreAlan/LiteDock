// Sistema de toast minimalista — sem Context/Provider.
// `toast.success(msg)`, `toast.error(msg)`, `toast.info(msg)`.
// O componente `<Toasts />` deve ser montado uma vez na raiz do app.

type Level = 'success' | 'error' | 'info';
interface Toast { id: string; msg: string; level: Level }

let _toasts: Toast[] = [];
let _listeners: Array<() => void> = [];

function notify() { _listeners.forEach((fn) => fn()); }

export const toast = {
  success: (msg: string) => push('success', msg),
  error: (msg: string) => push('error', msg),
  info: (msg: string) => push('info', msg),
};

function push(level: Level, msg: string) {
  const id = Math.random().toString(36).slice(2);
  _toasts = [..._toasts, { id, msg, level }];
  notify();
  setTimeout(() => {
    _toasts = _toasts.filter((t) => t.id !== id);
    notify();
  }, 4000);
}

export function getToasts(): readonly Toast[] { return _toasts; }
export function subscribe(fn: () => void): () => void {
  _listeners = [..._listeners, fn];
  return () => { _listeners = _listeners.filter((x) => x !== fn); };
}
