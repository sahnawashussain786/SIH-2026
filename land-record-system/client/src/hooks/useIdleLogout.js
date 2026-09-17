import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

/** Hard cap: how long a session stays valid. Matches the server's JWT_EXPIRES_IN. */
export const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours
/** How long the user may stay idle before being signed out (same 6h). */
const IDLE_LIMIT_MS = SESSION_MAX_AGE_MS;
/** Show a warning toast this long before the idle sign-out. */
const WARN_BEFORE_MS = 2 * 60 * 1000; // 2 minutes
/** How often to run the expiry/idle check while the app is open. */
const CHECK_INTERVAL_MS = 30 * 1000;

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'];

/** Read the `exp` claim (unix seconds → ms) out of the stored JWT, without verifying. */
function getTokenExpiryMs() {
  try {
    const token = localStorage.getItem('lrs_token');
    const payload = token ? JSON.parse(atob(token.split('.')[1] || '')) : null;
    return payload?.exp ? payload.exp * 1000 : null;
  } catch {
    return null; // malformed token — the API's 401 handler deals with it
  }
}

/**
 * Signs the user out after 6 hours without user activity, or the moment the
 * JWT itself expires (whichever comes first) — so "logged in" never survives
 * 6h of inactivity. Shows a countdown warning toast before the idle sign-out.
 */
export default function useIdleLogout(onExpired) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  const lastActivityRef = useRef(Date.now());
  const warnedRef = useRef(false);
  const warnToastIdRef = useRef(null);

  useEffect(() => {
    if (!user) return undefined;

    const clearWarn = () => {
      if (warnToastIdRef.current != null) {
        toast.dismiss(warnToastIdRef.current);
        warnToastIdRef.current = null;
      }
      warnedRef.current = false;
    };

    const markActivity = () => {
      lastActivityRef.current = Date.now();
      if (warnedRef.current) clearWarn();
    };

    const doLogout = (reason) => {
      clearWarn();
      onExpiredRef.current?.(reason);
      logout();
    };

    const check = () => {
      const now = Date.now();

      // 1) Absolute token expiry — the server rejects it from this instant.
      const expMs = getTokenExpiryMs();
      if (expMs && now >= expMs) {
        doLogout('expired');
        return;
      }

      // 2) Idle timeout — no real activity for 6 hours.
      const idleMs = now - lastActivityRef.current;
      if (idleMs >= IDLE_LIMIT_MS) {
        doLogout('idle');
        return;
      }

      // 3) Warn shortly before the idle sign-out.
      if (!warnedRef.current && IDLE_LIMIT_MS - idleMs <= WARN_BEFORE_MS) {
        warnToastIdRef.current = toast.info(
          'You will be signed out shortly due to inactivity.',
          { title: 'Session ending', duration: WARN_BEFORE_MS },
        );
        warnedRef.current = true;
      }
    };

    ACTIVITY_EVENTS.forEach((ev) =>
      window.addEventListener(ev, markActivity, { passive: true, capture: true }),
    );
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    check(); // catch stale sessions (e.g. slept tab) immediately

    return () => {
      ACTIVITY_EVENTS.forEach((ev) =>
        window.removeEventListener(ev, markActivity, { capture: true }),
      );
      clearInterval(interval);
      clearWarn();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, logout, toast]);
}
