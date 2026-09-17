import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../services/api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import ConfidenceBadge from '../components/ConfidenceBadge.jsx';
import { IconChevronLeft, IconChevronRight, IconCheckSolid } from '../components/icons.js';

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
        <h1 className="page-title">Verification Queue</h1>
        <p className="page-subtitle">
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
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
          />
          Show only mandatory-verification (low confidence)
        </label>
        <span className="text-sm text-slate-400">{data.total} pending</span>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.items.map((d) => (
          <Link
            key={d._id}
            to={`/documents/${d._id}`}
            className="panel group p-5 transition hover:-translate-y-0.5 hover:shadow-card-hover hover:ring-brand-300"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-slate-900">{d.title}</p>
              <StatusBadge value={d.stage} />
            </div>
            <p className="mt-1 text-xs text-slate-400">{d.originalName}</p>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Owner</dt><dd className="font-medium">{d.extracted?.ownerName || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Khatian</dt><dd className="font-medium">{d.extracted?.khatianNumber || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Plot</dt><dd className="font-medium">{d.extracted?.plotNumber || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Village</dt><dd className="font-medium">{d.extracted?.village || '—'}</dd></div>
            </dl>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
              <ConfidenceBadge value={d.overallConfidence} />
              <span className="text-xs text-slate-400">{(d.validation?.errors || []).length} errors</span>
            </div>
          </Link>
        ))}
        {data.items.length === 0 && (
          <div className="panel flex flex-col items-center justify-center p-12 text-center text-slate-400 md:col-span-2 xl:col-span-3">
            <IconCheckSolid className="text-3xl text-emerald-500" />
            <p className="mt-3 text-sm font-medium text-slate-600">Queue is clear</p>
            <p className="text-xs">Nothing awaiting verification.</p>
          </div>
        )}
      </div>

      {data.pages > 1 && (
        <div className="flex items-center justify-between">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-secondary !px-3 !py-1.5">
            <IconChevronLeft /> Prev
          </button>
          <span className="text-sm text-slate-500">Page {page} of {data.pages}</span>
          <button disabled={page >= data.pages} onClick={() => setPage(page + 1)} className="btn-secondary !px-3 !py-1.5">
            Next <IconChevronRight />
          </button>
        </div>
      )}
    </div>
  );
}
