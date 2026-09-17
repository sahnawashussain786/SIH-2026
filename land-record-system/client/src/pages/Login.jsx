import { useEffect, useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { errMsg } from "../services/api.js";
import Spinner from "../components/Spinner.jsx";
import {
  IconLandmark,
  IconLock,
  IconMail,
  IconError,
  IconShieldSolid,
  IconArrowRight,
  IconBalance,
} from "../components/icons.js";

const DEMO = [
  { label: "Administrator", email: "admin@lrs.gov.in", password: "Admin@123" },
  {
    label: "Data Entry Officer",
    email: "officer@lrs.gov.in",
    password: "Officer@123",
  },
  {
    label: "Revenue Officer",
    email: "reviewer@lrs.gov.in",
    password: "Reviewer@123",
  },
  {
    label: "Senior Officer",
    email: "senior@lrs.gov.in",
    password: "Senior@123",
  },
  {
    label: "Digitization Operator",
    email: "operator@lrs.gov.in",
    password: "Operator@123",
  },
];

export default function Login() {
  const { user, login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Friendly notice after an automatic sign-out (inactivity / token expiry).
  const sessionExpired = Boolean(location.state?.sessionExpired);
  useEffect(() => {
    if (sessionExpired) {
      toast.info(
        "You were signed out after 6 hours of inactivity. Please sign in again.",
        { title: "Session ended", duration: 8000 },
      );
      // Clear the state so reloading doesn't repeat the toast.
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const u = await login(email, password);
      toast.success(`Welcome back, ${u?.name || "officer"}.`, {
        title: "Signed in",
      });
      navigate(location.state?.from?.pathname || "/dashboard");
    } catch (err) {
      const m = errMsg(err);
      setError(m);
      toast.error(m, { title: "Sign-in failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* ── Brand / credibility panel ─────────────────────── */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-slate-900 p-10 text-white lg:flex">
        {/* subtle grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 shadow-lg">
            <IconLandmark className="text-xl" />
          </span>
          <div>
            <p className="text-base font-bold leading-tight tracking-tight">
              BHOOMI<span className="text-brand-400">-AI</span>
            </p>
            <p className="text-xs text-slate-400">
              Intelligent Land Record System
            </p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight">
            From scanned paper to{" "}
            <span className="text-brand-400">verified digital records</span>.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            AI-powered extraction across every Indian language, confidence-based
            routing, and a full audit trail — built for revenue departments.
          </p>
          <ul className="mt-8 space-y-4 text-sm">
            {[
              {
                Icon: IconBalance,
                title: "Confidence-based routing",
                desc: "Auto-accept, review, or mandatory verification",
              },
              {
                Icon: IconShieldSolid,
                title: "Role-based access & audit trail",
                desc: "Every action is recorded and attributable",
              },
              {
                Icon: IconLandmark,
                title: "Multilingual extraction",
                desc: "Reads khatians in all scheduled Indian languages",
              },
            ].map(({ Icon, title, desc }) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="text-brand-400" />
                </span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-xs text-slate-400">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-500">
          Smart India Hackathon 2026 · Government of India
        </p>
      </div>

      {/* ── Sign-in panel ─────────────────────────────────── */}
      <div className="flex items-center justify-center bg-slate-100 p-4 sm:p-8">
        <div className="w-full max-w-md">
          {/* compact brand for mobile */}
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-md">
              <IconLandmark className="text-xl" />
            </span>
            <div>
              <p className="font-bold leading-tight tracking-tight text-slate-900">
                BHOOMI<span className="text-brand-600">-AI</span>
              </p>
              <p className="text-xs text-slate-500">
                Intelligent Land Record System · SIH 2026
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-8 shadow-card ring-1 ring-slate-200/70">
            <h1 className="text-xl font-bold text-slate-900">
              Sign in to your account
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Use your official department credentials.
            </p>

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
                <IconError className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="form-label" htmlFor="email">
                  Email address
                </label>
                <div className="relative">
                  <IconMail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="form-input pl-10"
                    placeholder="officer@lrs.gov.in"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="form-label" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <IconLock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="form-input pl-10"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="btn-primary w-full"
              >
                {busy ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner light size="xs" /> Signing in…
                  </span>
                ) : (
                  <>
                    Sign in <IconArrowRight />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 border-t border-slate-200 pt-4">
              <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Demo accounts
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {DEMO.map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    onClick={() => {
                      setEmail(d.email);
                      setPassword(d.password);
                    }}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm transition hover:border-brand-300 hover:bg-brand-50/60"
                  >
                    <span className="font-medium text-slate-700">
                      {d.label}
                    </span>
                    <span className="text-xs text-slate-400">{d.email}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
