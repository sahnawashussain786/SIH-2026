import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../services/api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import ConfidenceBadge from '../components/ConfidenceBadge.jsx';

export default function Verification() {
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [page, setPage] = useState(1);
  const [priority, setPriority] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    const params = new URLSearchParams({ page, limit: 12 });
    if (priority) params.set('priority', 'high');
    api
      .get(`/verification/queue?${params}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(errMsg(err)));
  };

  useEffect(load, [page, priority]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Verification Queue</h1>
        <p className="text-sm text-slate-500">
          Documents routed by the confidence engine: 70–90% manual review · &lt;70% mandatory verification.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={priority === 'high'}
            onChange={(e) => {
              setPage(1);
              setPriority(e.target.checked ? 'high' : '');
            }}
          />
          Show only mandatory-verification (low confidence)
        </label>
        <span className="text-sm text-slate-400">{data.total} pending</span>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.items.map((d) => (
          <Link
            key={d._id}
            to={`/documents/${d._id}`}
            className="block rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:ring-brand-500"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-slate-800">{d.title}</p>
              <StatusBadge value={d.stage} />
            </div>
            <p className="mt-1 text-xs text-slate-400">{d.originalName}</p>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Owner</dt><dd className="font-medium">{d.extracted?.ownerName || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Khatian</dt><dd className="font-medium">{d.extracted?.khatianNumber || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Plot</dt><dd className="font-medium">{d.extracted?.plotNumber || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Village</dt><dd className="font-medium">{d.extracted?.village || '—'}</dd></div>
            </dl>
            <div className="mt-3 flex items-center justify-between">
              <ConfidenceBadge value={d.overallConfidence} />
              <span className="text-xs text-slate-400">{(d.validation?.errors || []).length} errors</span>
            </div>
          </Link>
        ))}
        {data.items.length === 0 && (
          <div className="rounded-xl bg-white p-10 text-center text-slate-400 ring-1 ring-slate-200 md:col-span-2 xl:col-span-3">
            🎉 Queue is clear — nothing awaiting verification.
          </div>
        )}
      </div>

      {data.pages > 1 && (
        <div className="flex items-center justify-between">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40">← Prev</button>
          <span className="text-sm text-slate-500">Page {page} of {data.pages}</span>
          <button disabled={page >= data.pages} onClick={() => setPage(page + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}
