import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errMsg } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  IconUser, IconMail, IconSave, IconKey, IconLock, IconShieldSolid,
  IconCalendar, IconApproved,
} from '../components/icons.js';

const ROLE_LABELS = {
  data_entry_officer: 'Data Entry Officer',
  digitization_operator: 'Digitization Operator',
  revenue_officer: 'Revenue Officer',
  senior_officer: 'Senior Officer',
  admin: 'Administrator',
  citizen: 'Citizen',
};

const BLANK_PWD = { currentPassword: '', newPassword: '', confirm: '' };

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: user?.name || '',
    department: user?.department || '',
    district: user?.district || '',
    state: user?.state || '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [pwd, setPwd] = useState(BLANK_PWD);
  const [savingPwd, setSavingPwd] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await api.put('/auth/me', form);
      setUser(res.data.user);
      toast.success('Profile updated successfully.');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (pwd.newPassword !== pwd.confirm) {
      toast.error('New passwords do not match.');
      return;
    }
    setSavingPwd(true);
    try {
      await api.put('/auth/me/password', {
        currentPassword: pwd.currentPassword,
        newPassword: pwd.newPassword,
      });
      toast.success('Password changed. Please sign in again.', { duration: 6000 });
      setTimeout(() => {
        logout();
        navigate('/login');
        toast.info('Sign in with your new password.');
      }, 1200);
      setPwd(BLANK_PWD);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSavingPwd(false);
    }
  };

  const accountMeta = [
    { Icon: IconShieldSolid, label: 'Role', value: ROLE_LABELS[user?.role] || user?.role },
    { Icon: IconMail, label: 'Email', value: user?.email },
    { Icon: IconCalendar, label: 'Member since', value: user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="page-title">My Profile</h1>
        <p className="page-subtitle">Manage your account details and sign-in security.</p>
      </div>

      {/* ── Identity card ─────────────────────────────────── */}
      <div className="panel flex flex-col items-center gap-4 p-6 sm:flex-row">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-3xl font-bold text-white shadow-md">
          {user?.name?.charAt(0) || 'U'}
        </span>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-xl font-bold text-slate-900">{user?.name}</p>
          <p className="text-sm font-medium text-brand-700">{ROLE_LABELS[user?.role] || user?.role}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
              <IconApproved className="text-[10px]" /> {user?.isActive === false ? 'Inactive' : 'Active'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
              {user?.department || 'Land Records'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Editable profile form ───────────────────────── */}
        <form onSubmit={saveProfile} className="panel space-y-4 p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <IconUser className="text-brand-600" /> Account details
          </h2>
          <div>
            <label className="form-label" htmlFor="profile-name">Full name</label>
            <div className="relative">
              <IconUser className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="profile-name"
                value={form.name}
                onChange={set('name')}
                className="form-input pl-10"
                required
              />
            </div>
          </div>
          <div>
            <label className="form-label" htmlFor="profile-dept">Department</label>
            <input
              id="profile-dept"
              value={form.department}
              onChange={set('department')}
              className="form-input"
              placeholder="Land Records"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label" htmlFor="profile-district">District</label>
              <input id="profile-district" value={form.district} onChange={set('district')} className="form-input" />
            </div>
            <div>
              <label className="form-label" htmlFor="profile-state">State</label>
              <input id="profile-state" value={form.state} onChange={set('state')} className="form-input" />
            </div>
          </div>
          <div className="space-y-1 border-t border-slate-100 pt-3 text-sm">
            {accountMeta.map(({ Icon, label, value }) => (
              <p key={label} className="flex items-center gap-2 text-slate-500">
                <Icon className="shrink-0 text-slate-400" />
                <span className="w-24 shrink-0">{label}</span>
                <span className="truncate font-medium text-slate-700">{value}</span>
              </p>
            ))}
          </div>
          <button type="submit" disabled={savingProfile} className="btn-primary w-full">
            <IconSave /> {savingProfile ? 'Saving…' : 'Save changes'}
          </button>
        </form>

        {/* ── Password change ─────────────────────────────── */}
        <form onSubmit={savePassword} className="panel space-y-4 self-start p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <IconKey className="text-brand-600" /> Change password
          </h2>
          <div>
            <label className="form-label" htmlFor="pwd-current">Current password</label>
            <div className="relative">
              <IconLock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="pwd-current"
                type="password"
                value={pwd.currentPassword}
                onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })}
                className="form-input pl-10"
                required
                autoComplete="current-password"
              />
            </div>
          </div>
          <div>
            <label className="form-label" htmlFor="pwd-new">New password</label>
            <div className="relative">
              <IconKey className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="pwd-new"
                type="password"
                value={pwd.newPassword}
                onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })}
                className="form-input pl-10"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
          </div>
          <div>
            <label className="form-label" htmlFor="pwd-confirm">Confirm new password</label>
            <div className="relative">
              <IconKey className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="pwd-confirm"
                type="password"
                value={pwd.confirm}
                onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })}
                className="form-input pl-10"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
          </div>
          <p className="text-xs text-slate-400">
            After changing your password you will be signed out and asked to sign in again.
          </p>
          <button type="submit" disabled={savingPwd} className="btn-secondary w-full">
            <IconKey /> {savingPwd ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
