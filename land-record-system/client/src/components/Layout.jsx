import { NavLink, Link, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import {
  IconDashboard,
  IconUpload,
  IconDocument,
  IconVerification,
  IconRecords,
  IconAdmin,
  IconLogout,
  IconMenu,
  IconClose,
  IconLandmark,
  IconShieldSolid,
  IconUser,
} from "./icons.js";

const ROLE_LABELS = {
  data_entry_officer: "Data Entry Officer",
  digitization_operator: "Digitization Operator",
  revenue_officer: "Revenue Officer",
  senior_officer: "Senior Officer",
  admin: "Administrator",
  citizen: "Citizen",
};

const NAV = [
  { to: "/dashboard", label: "Dashboard", Icon: IconDashboard, roles: "all" },
  {
    to: "/upload",
    label: "Upload Document",
    Icon: IconUpload,
    roles: [
      "data_entry_officer",
      "digitization_operator",
      "revenue_officer",
      "senior_officer",
      "admin",
    ],
  },
  { to: "/documents", label: "Documents", Icon: IconDocument, roles: "all" },
  {
    to: "/verification",
    label: "Verification",
    Icon: IconVerification,
    roles: [
      "data_entry_officer",
      "digitization_operator",
      "revenue_officer",
      "senior_officer",
      "admin",
    ],
  },
  { to: "/records", label: "Land Records", Icon: IconRecords, roles: "all" },
  { to: "/profile", label: "My Profile", Icon: IconUser, roles: "all" },
  { to: "/admin", label: "Admin", Icon: IconAdmin, roles: ["admin"] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);

  const items = NAV.filter(
    (n) => n.roles === "all" || n.roles.includes(user?.role),
  );

  const signOut = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* ── Sidebar (desktop) ─────────────────────────────── */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-slate-900 text-slate-300 shadow-sidebar md:flex">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white shadow-md">
            <IconLandmark className="text-lg" />
          </span>
          <div>
            <h1 className="text-base font-bold leading-tight tracking-tight text-white">
              BHOOMI<span className="text-brand-400">-AI</span>
            </h1>
            <p className="text-[11px] tracking-wide text-slate-400">
              Land Record Intelligence
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-brand-600/90 text-white shadow-sm"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <Icon className="text-base opacity-90" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-bold uppercase text-slate-200">
              {user?.name?.charAt(0) || "U"}
            </span>
            <Link to="/profile" className="min-w-0" title="Open my profile">
              <p className="truncate text-sm font-semibold text-white">
                {user?.name}
              </p>
              <p className="truncate text-[11px] text-slate-400">
                {ROLE_LABELS[user?.role] || user?.role}
              </p>
            </Link>
          </div>
          <button
            onClick={signOut}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <IconLogout /> Sign out
          </button>
        </div>
      </aside>

      {/* ── Mobile drawer ─────────────────────────────────── */}
      {navOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setNavOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-slate-900 text-slate-300">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white">
                  <IconLandmark />
                </span>
                <span className="text-base font-bold text-white">
                  BHOOMI<span className="text-brand-400">-AI</span>
                </span>
              </div>
              <button
                onClick={() => setNavOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <IconClose />
              </button>
            </div>
            <nav className="flex-1 space-y-1 p-3">
              {items.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setNavOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                      isActive
                        ? "bg-brand-600/90 text-white"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`
                  }
                >
                  <Icon className="text-base opacity-90" />
                  {label}
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-white/10 p-4">
              <button
                onClick={signOut}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm font-medium hover:bg-white/10"
              >
                <IconLogout /> Sign out
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Top bar (mobile) ────────────────────────────── */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm md:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setNavOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            >
              <IconMenu />
            </button>
            <span className="flex items-center gap-2 font-bold text-slate-900">
              <IconLandmark className="text-brand-600" /> BHOOMI-AI
            </span>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-700"
          >
            <IconLogout className="text-sm" /> Sign out
          </button>
        </header>

        {/* ── Desktop page header strip ───────────────────── */}
        <header className="hidden items-center justify-between border-b border-slate-200 bg-white px-8 py-3.5 shadow-sm md:flex">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <IconShieldSolid className="text-brand-600" />
            Government of India · Land Records Digitization Initiative
          </div>
          <Link
            to="/profile"
            className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm transition hover:bg-slate-100"
            title="Open my profile"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
              {user?.name?.charAt(0) || "U"}
            </span>
            <span className="font-semibold text-slate-700">{user?.name}</span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-500">
              {ROLE_LABELS[user?.role] || user?.role}
            </span>
          </Link>
        </header>

        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
