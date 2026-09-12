import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const ROLE_LABELS = {
  data_entry_officer: 'Data Entry Officer',
  digitization_operator: 'Digitization Operator',
  revenue_officer: 'Revenue Officer',
  senior_officer: 'Senior Officer',
  admin: 'Administrator',
  citizen: 'Citizen',
};

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊', roles: 'all' },
  { to: '/upload', label: 'Upload Document', icon: '📤', roles: ['data_entry_officer', 'digitization_operator', 'revenue_officer', 'senior_officer', 'admin'] },
  { to: '/documents', label: 'Documents', icon: '📄', roles: 'all' },
  { to: '/verification', label: 'Verification', icon: '✅', roles: ['data_entry_officer', 'digitization_operator', 'revenue_officer', 'senior_officer', 'admin'] },
  { to: '/records', label: 'Land Records', icon: '🗂️', roles: 'all' },
  { to: '/admin', label: 'Admin', icon: '⚙️', roles: ['admin'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const items = NAV.filter((n) => n.roles === 'all' || n.roles.includes(user?.role));

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 flex-col bg-brand-900 text-white md:flex">
        <div className="border-b border-white/10 px-5 py-5">
          <h1 className="text-lg font-bold leading-tight">Land Record System</h1>
          <p className="mt-0.5 text-xs text-brand-100">Digitization & Validation</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4 text-sm">
          <p className="font-semibold">{user?.name}</p>
          <p className="text-xs text-brand-100">{ROLE_LABELS[user?.role] || user?.role}</p>
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="mt-3 w-full rounded-lg bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 md:hidden">
          <span className="font-bold text-brand-900">LRS</span>
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="text-sm text-brand-700"
          >
            Sign out
          </button>
        </header>
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
