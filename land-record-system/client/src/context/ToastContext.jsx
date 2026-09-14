import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  IconCheckSolid, IconErrorSolid, IconWarnSolid, IconInfo, IconClose,
} from '../components/icons.js';

const ToastContext = createContext(null);

let nextId = 1;

const VARIANTS = {
  success: {
    Icon: IconCheckSolid,
    bar: 'bg-emerald-500',
    iconCls: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
  },
  error: {
    Icon: IconErrorSolid,
    bar: 'bg-rose-500',
    iconCls: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
  },
  warning: {
    Icon: IconWarnSolid,
    bar: 'bg-amber-500',
    iconCls: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100',
  },
  info: {
    Icon: IconInfo,
    bar: 'bg-sky-500',
    iconCls: 'bg-sky-50 text-sky-600 ring-1 ring-sky-100',
  },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    /**
     * toast.success('Saved'), toast.error(msg, { duration: 8000 }),
     * toast.info('...', { title: 'Heads up' }), toast.warning('...')
     */
    (variant, message, { title, duration = 5000 } = {}) => {
      const id = nextId++;
      setToasts((list) => [...list.slice(-4), { id, variant, message, title }]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration)
        );
      }
      return id;
    },
    [dismiss]
  );

  const api = useMemo(() => {
    const bound = (variant) => (message, opts) => toast(variant, message, opts);
    const fn = bound('info');
    fn.success = bound('success');
    fn.error = bound('error');
    fn.warning = bound('warning');
    fn.info = bound('info');
    fn.dismiss = dismiss;
    return fn;
  }, [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Toast viewport */}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-2.5">
        {toasts.map((t) => {
          const { Icon, bar, iconCls } = VARIANTS[t.variant] || VARIANTS.info;
          return (
            <div
              key={t.id}
              role="status"
              className="toast-slide pointer-events-auto flex w-full items-start gap-3 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-slate-900/10"
            >
              <span className={`self-stretch w-1 shrink-0 ${bar}`} />
              <span className={`mt-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconCls}`}>
                <Icon className="text-sm" />
              </span>
              <div className="min-w-0 flex-1 py-3 pr-1">
                {t.title && <p className="text-sm font-semibold leading-tight text-slate-900">{t.title}</p>}
                <p className={`text-sm leading-snug text-slate-600 ${t.title ? 'mt-0.5' : ''}`}>{t.message}</p>
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="mt-2.5 mr-2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <IconClose className="text-sm" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
