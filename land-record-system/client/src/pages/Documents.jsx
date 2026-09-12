import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../services/api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import ConfidenceBadge from '../components/ConfidenceBadge.jsx';

export default function Documents() {
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: '', search: '' });
  const [error, setError] = useState('');

  const load = () => {
    const params = new URLSearchParams({ page, limit: 12 });
    if (filters.status) params.set('status', filters.status);
    if (filters.search) params.set('search', filters.search);
    api
      .get(`/documents?${params}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(errMsg(err)));
  };

  useEffect(load, [page, filters]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Documents</h1>
        <p className="text-sm text-slate-500">All uploaded land-record documents and their AI processing status.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filters.status}
          onChange={(e) => {
            setPage(1);
            setFilters({ ...filters, status: e.target.value });
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="processing">Processing</option>
          <option value="processed">Processed</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
          <option value="failed">Failed</option>
        </select>
        <input
          value={filters.search}
          onChange={(e) => {
            setPage(1);
            setFilters({ ...filters, search: e.target.value });
          }}
          placeholder="Search title, owner, village…"
          className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <span className="text-sm text-slate-400">{data.total} documents</span>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Document</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Village / District</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Confidence</th>
              <th className="px-4 py-3">Uploaded</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((d) => (
              <tr key={d._id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{d.title}</p>
                  <p className="text-xs text-slate-400">{d.originalName} · {(d.size / 1024).toFixed(0)} KB</p>
                </td>
                <td className="px-4 py-3">{d.extracted?.ownerName || <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-3 text-slate-600">
                  {d.extracted?.village || '—'}
                  <span className="text-slate-300"> · </span>
                  {d.extracted?.district || d.district || '—'}
                </td>
                <td className="px-4 py-3"><StatusBadge value={d.status} /></td>
                <td className="px-4 py-3">{d.overallConfidence ? <ConfidenceBadge value={d.overallConfidence} /> : <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-3 text-xs text-slate-400">{new Date(d.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/documents/${d._id}`} className="text-sm font-medium text-brand-700 hover:underline">Open</Link>
                </td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No documents found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data.pages > 1 && (
        <div className="flex items-center justify-between">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40">
            ← Prev
          </button>
          <span className="text-sm text-slate-500">Page {page} of {data.pages}</span>
          <button disabled={page >= data.pages} onClick={() => setPage(page + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
