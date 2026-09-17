import { useEffect, useState } from 'react';
import { api, errMsg } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import {
  IconUsers, IconAudit, IconChevronLeft, IconChevronRight, IconPlus,
} from '../components/icons.js';

const ROLE_LABELS = {
  data_entry_officer: 'Data Entry Officer',
  digitization_operator: 'Digitization Operator',
  revenue_officer: 'Revenue Officer',
  senior_officer: 'Senior Officer',
  admin: 'Administrator',
  citizen: 'Citizen',
};

const EMPTY_USER = { name: '', email: '', password: '', role: 'data_entry_officer', district: '', state: '' };

export default function Admin() {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState({ items: [], total: 0, pages: 1 });
  const [logPage, setLogPage] = useState(1);
  const [newUser, setNewUser] = useState(EMPTY_USER);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const toast = useToast();

  const loadUsers = () => api.get('/admin/users').then((r) => setUsers(r.data.items)).catch((e) => setError(errMsg(e)));
  const loadLogs = () => api.get(`/admin/audit-logs?page=${logPage}&limit=15`).then((r) => setLogs(r.data)).catch((e) => setError(errMsg(e)));

  useEffect(() => {
    setError('');
    if (tab === 'users') loadUsers();
    else loadLogs();
  }, [tab, logPage]);

  const createUser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await api.post('/admin/users', newUser);
      setSuccess(`User ${newUser.email} created.`);
      toast.success(`${newUser.name || newUser.email} can now sign in.`, { title: 'User created' });
      setNewUser(EMPTY_USER);
      loadUsers();
    } catch (err) {
      toast.error(errMsg(err), { title: 'Could not create user', duration: 8000 });
      setError(errMsg(err));
    }
  };

  const toggleActive = async (u) => {
    setError('');
    try {
      await api.put(`/admin/users/${u._id}`, { isActive: !u.isActive });
      toast.success(`${u.name} ${u.isActive ? 'disabled' : 'enabled'} successfully.`, { title: 'User updated' });
      loadUsers();
    } catch (err) {
      toast.error(errMsg(err), { title: 'Update failed' });
      setError(errMsg(err));
    }
  };

  const changeRole = async (u, role) => {
    setError('');
    try {
      await api.put(`/admin/users/${u._id}`, { role });
      toast.success(`${u.name} is now ${ROLE_LABELS[role] || role}.`, { title: 'Role updated' });
      loadUsers();
    } catch (err) {
      toast.error(errMsg(err), { title: 'Role change failed' });
      setError(errMsg(err));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Administration</h1>
        <p className="page-subtitle">Manage users, roles and review the full audit trail.</p>
      </div>

      <div className="flex gap-2">
        {[
          { key: 'users', label: 'Users', Icon: IconUsers },
          { key: 'audit', label: 'Audit Logs', Icon: IconAudit },
        ].map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === key
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-white text-slate-600 shadow-card ring-1 ring-slate-200/70 hover:bg-slate-50'
            }`}
          >
            <Icon className="text-base" /> {label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {success && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-100">{success}</div>}

      {tab === 'users' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="panel overflow-x-auto lg:col-span-2">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">District</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u._id} className="transition hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{u.name}</p>
                      <p className="text-xs text-slate-400">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        onChange={(e) => changeRole(u, e.target.value)}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                      >
                        {Object.entries(ROLE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{u.district || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        u.isActive ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {u.isActive ? 'active' : 'disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => toggleActive(u)} className="text-sm font-medium text-brand-700 hover:underline">
                        {u.isActive ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form onSubmit={createUser} className="panel space-y-3.5 p-6">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900"><IconPlus className="text-brand-600" /> Create user</h2>
            {[
              ['name', 'Full name', 'text'],
              ['email', 'Email', 'email'],
              ['password', 'Password', 'password'],
              ['district', 'District', 'text'],
              ['state', 'State', 'text'],
            ].map(([key, label, type]) => (
              <div key={key}>
                <label className="form-label">{label}</label>
                <input
                  type={type}
                  value={newUser[key]}
                  onChange={(e) => setNewUser({ ...newUser, [key]: e.target.value })}
                  className="form-input"
                  required={key === 'name' || key === 'email' || key === 'password'}
                />
              </div>
            ))}
            <div>
              <label className="form-label">Role</label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                className="form-input"
              >
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-primary w-full">Create user</button>
          </form>
        </div>
      )}

      {tab === 'audit' && (
        <div className="panel overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Actor</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Entity</th>
                <th className="px-4 py-3 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.items.map((l) => (
                <tr key={l._id} className="transition hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">{l.actorName}</td>
                  <td className="px-4 py-3"><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{l.action}</code></td>
                  <td className="px-4 py-3 text-xs text-slate-500">{l.entityType}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-xs text-slate-500">{JSON.stringify(l.details)}</td>
                </tr>
              ))}
              {logs.items.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No audit entries yet.</td></tr>
              )}
            </tbody>
          </table>
          {logs.pages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
              <button disabled={logPage <= 1} onClick={() => setLogPage(logPage - 1)} className="btn-secondary !px-3 !py-1.5">
                <IconChevronLeft /> Prev
              </button>
              <span className="text-sm text-slate-500">Page {logPage} of {logs.pages}</span>
              <button disabled={logPage >= logs.pages} onClick={() => setLogPage(logPage + 1)} className="btn-secondary !px-3 !py-1.5">
                Next <IconChevronRight />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
