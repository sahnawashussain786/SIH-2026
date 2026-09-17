import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import { api, errMsg } from '../services/api.js';
import ConfidenceBadge from '../components/ConfidenceBadge.jsx';
import {
  IconFiles, IconApproved, IconPending, IconIssues, IconUpload, IconTrend, IconCheckSolid,
} from '../components/icons.js';

const COLORS = ['#0e6b4c', '#f59e0b', '#f43f5e', '#0ea5e9', '#8b5cf6'];
const BUCKET_LABELS = { 0: '<70 (verify)', 70: '70–85', 85: '85–90', 90: '90–95 (auto)', 96: '95+ (auto)' };

const KPI_STYLES = {
  icon: {
    sky: 'bg-sky-50 text-sky-600 ring-sky-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    rose: 'bg-rose-50 text-rose-600 ring-rose-100',
  },
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard/stats')
      .then((res) => setStats(res.data))
      .catch((err) => setError(errMsg(err)));
  }, []);

  if (error) return <div className="rounded-lg bg-rose-50 p-4 text-rose-700 ring-1 ring-rose-200">{error}</div>;
  if (!stats) return <div className="text-slate-500">Loading dashboard…</div>;

  const t = stats.totals;
  const kpis = [
    { label: 'Documents Processed', value: t.processed, Icon: IconFiles, chip: 'sky' },
    { label: 'Approved Records', value: t.records, Icon: IconApproved, chip: 'emerald' },
    { label: 'Pending Verification', value: t.pending, Icon: IconPending, chip: 'amber' },
    { label: 'Validation Issues', value: t.validationIssues, Icon: IconIssues, chip: 'rose' },
  ];

  const confidenceData = (stats.confidenceBuckets || [])
    .filter((b) => typeof b._id === 'number')
    .map((b) => ({ name: BUCKET_LABELS[b._id] || String(b._id), count: b.count }));

  const trendData = (stats.trend || []).map((d) => ({
    date: d._id.slice(5),
    uploads: d.count,
    verified: d.verified,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Government Dashboard</h1>
          <p className="page-subtitle">Intelligent Land Record Digitization &amp; Validation — overview</p>
        </div>
        <Link to="/upload" className="btn-primary">
          <IconUpload /> Upload Document
        </Link>
      </div>

      {/* KPI cards */}
      <div className="stagger grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map(({ label, value, Icon, chip }) => (
          <div key={label} className="panel p-5">
            <div className="flex items-start justify-between">
              <span className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${KPI_STYLES.icon[chip]}`}>
                <Icon className="text-lg" />
              </span>
              <span className="text-2xl font-bold tabular-nums text-slate-900">{value.toLocaleString()}</span>
            </div>
            <p className="mt-3 text-sm font-medium text-slate-600">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* State progress */}
        <div className="panel p-5">
          <h2 className="font-semibold text-slate-900">State-wise Digitization Progress</h2>
          <p className="mb-4 text-xs text-slate-400">Verified share of extracted records by state</p>
          <div className="space-y-3">
            {(stats.stateProgress || []).length === 0 && <p className="text-sm text-slate-400">No data yet.</p>}
            {(stats.stateProgress || []).map((s) => (
              <div key={s.state}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{s.state}</span>
                  <span className="tabular-nums text-slate-400">{s.verified}/{s.total} · {s.pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${s.pct}%` }} />
                </div>
                <div className="mt-1 text-xs text-slate-400">{s.total} documents from {s.state}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Confidence buckets */}
        <div className="panel p-5">
          <h2 className="font-semibold text-slate-900">AI Confidence Distribution</h2>
          <p className="mb-4 text-xs text-slate-400">Routing: &gt;90 auto-accept · 70–90 officer review · &lt;70 mandatory verification</p>
          {confidenceData.length === 0 ? (
            <p className="text-sm text-slate-400">No processed documents yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={confidenceData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip cursor={{ fill: 'rgba(14,107,76,0.06)' }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {confidenceData.map((entry, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="text-slate-500">Avg confidence:</span>
            <ConfidenceBadge value={stats.avgConfidence} />
          </div>
        </div>

        {/* Trend */}
        <div className="panel p-5 lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Upload &amp; Verification Trend (14 days)</h2>
          <p className="mb-4 text-xs text-slate-400">Daily uploads vs verified documents</p>
          {trendData.length === 0 ? (
            <p className="text-sm text-slate-400">No uploads in the last 14 days.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip cursor={{ stroke: '#cbd5e1' }} />
                <Legend />
                <Line type="monotone" dataKey="uploads" stroke="#0e6b4c" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="verified" stroke="#0ea5e9" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Confidence routing explainer */}
      <div className="rounded-xl bg-slate-900 p-6 text-white shadow-card">
        <div className="flex items-center gap-2">
          <IconTrend className="text-brand-400" />
          <h2 className="font-semibold">Confidence-Based Routing</h2>
        </div>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="flex items-center gap-2 font-semibold"><IconCheckSolid className="text-emerald-400" /> Confidence &gt; 90%</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">Automatically accepted → saved as a digital land record (flagged in audit log).</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="flex items-center gap-2 font-semibold"><IconPending className="text-amber-400" /> 70 – 90%</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">Sent to Revenue Officer for manual review of each field.</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="flex items-center gap-2 font-semibold"><IconIssues className="text-rose-400" /> &lt; 70%</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">Mandatory verification — fields must be corrected before approval.</p>
          </div>
        </div>
      </div>
    </div>
  );
}