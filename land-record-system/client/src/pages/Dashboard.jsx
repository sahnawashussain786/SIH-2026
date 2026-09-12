import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import { api, errMsg } from '../services/api.js';
import ConfidenceBadge from '../components/ConfidenceBadge.jsx';

const COLORS = ['#12805c', '#f59e0b', '#f43f5e', '#0ea5e9', '#8b5cf6'];
const BUCKET_LABELS = { 0: '<70 (verify)', 70: '70–85', 85: '85–90', 90: '90–95 (auto)', 96: '95+ (auto)' };

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
    { label: 'Documents Processed', value: t.processed, icon: '📄', tone: 'bg-sky-50 text-sky-700 ring-sky-200' },
    { label: 'Approved Records', value: t.records, icon: '✅', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    { label: 'Pending Verification', value: t.pending, icon: '⏳', tone: 'bg-amber-50 text-amber-700 ring-amber-200' },
    { label: 'Validation Issues', value: t.validationIssues, icon: '⚠️', tone: 'bg-rose-50 text-rose-700 ring-rose-200' },
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
          <h1 className="text-2xl font-bold text-slate-800">Government Dashboard</h1>
          <p className="text-sm text-slate-500">Intelligent Land Record Digitization & Validation — overview</p>
        </div>
        <Link to="/upload" className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
          + Upload Document
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className={`rounded-xl p-5 ring-1 ${k.tone}`}>
            <div className="flex items-center justify-between">
              <span className="text-2xl">{k.icon}</span>
              <span className="text-3xl font-bold">{k.value.toLocaleString()}</span>
            </div>
            <p className="mt-2 text-sm font-medium opacity-80">{k.label}</p>
        </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* State progress */}
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-1 font-semibold text-slate-800">State-wise Digitization Progress</h2>
          <p className="mb-4 text-xs text-slate-400">Verified share of extracted records by state</p>
          <div className="space-y-3">
            {(stats.stateProgress || []).length === 0 && <p className="text-sm text-slate-400">No data yet.</p>}
            {(stats.stateProgress || []).map((s) => (
              <div key={s.state}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{s.state}</span>
                  <span className="text-slate-400">{s.verified}/{s.total} · {s.pct}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${s.pct}%` }} />
                </div>
                <div className="mt-1 text-xs text-slate-400">{s.total} documents from {s.state}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Confidence buckets */}
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-1 font-semibold text-slate-800">AI Confidence Distribution</h2>
          <p className="mb-4 text-xs text-slate-400">Routing: &gt;90 auto-accept · 70–90 officer review · &lt;70 mandatory verification</p>
          {confidenceData.length === 0 ? (
            <p className="text-sm text-slate-400">No processed documents yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={confidenceData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
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
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 lg:col-span-2">
          <h2 className="mb-1 font-semibold text-slate-800">Upload & Verification Trend (14 days)</h2>
          <p className="mb-4 text-xs text-slate-400">Daily uploads vs verified documents</p>
          {trendData.length === 0 ? (
            <p className="text-sm text-slate-400">No uploads in the last 14 days.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="uploads" stroke="#12805c" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="verified" stroke="#0ea5e9" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Confidence routing explainer */}
      <div className="rounded-xl bg-gradient-to-r from-brand-700 to-emerald-700 p-5 text-white">
        <h2 className="font-semibold">Confidence-Based Routing</h2>
        <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-lg bg-white/10 p-3">
            <p className="font-semibold">Confidence &gt; 90%</p>
            <p className="mt-1 text-brand-50">Automatically accepted → saved as a digital land record (flagged in audit log).</p>
          </div>
          <div className="rounded-lg bg-white/10 p-3">
            <p className="font-semibold">70 – 90%</p>
            <p className="mt-1 text-brand-50">Sent to Revenue Officer for manual review of each field.</p>
          </div>
          <div className="rounded-lg bg-white/10 p-3">
            <p className="font-semibold">&lt; 70%</p>
            <p className="mt-1 text-brand-50">Mandatory verification — fields must be corrected before approval.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
