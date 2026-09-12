import { useEffect, useState } from 'react';
import { api, errMsg } from '../services/api.js';

const EMPTY = { q: '', district: '', village: '', landType: '' };

export default function LandRecords() {
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(EMPTY);
  const [error, setError] = useState('');

  const load = () => {
    const params = new URLSearchParams({ page, limit: 12 });
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    api
      .get(`/records?${params}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(errMsg(err)));
  };

  useEffect(load, [page, filters]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Digital Land Records</h1>
        <p className="text-sm text-slate-500">Approved, verified records — searchable by owners, officers and citizens.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <input
          value={filters.q}
          onChange={(e) => {
            setPage(1);
            setFilters({ ...filters, q: e.target.value });
          }}
          placeholder="Search owner, village, district, khatian, plot…"
          className="w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={filters.district}
          onChange={(e) => {
            setPage(1);
            setFilters({ ...filters, district: e.target.value });
          }}
          placeholder="District"
          className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={filters.village}
          onChange={(e) => {
            setPage(1);
            setFilters({ ...filters, village: e.target.value });
          }}
          placeholder="Village"
          className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={filters.landType}
          onChange={(e) => {
            setPage(1);
            setFilters({ ...filters, landType: e.target.value });
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All land types</option>
          {['Agricultural', 'Residential', 'Commercial', 'Wasteland'].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <span className="text-sm text-slate-400">{data.total} records</span>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.items.map((r) => (
          <div key={r._id} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-slate-800">{r.ownerName}</p>
                <p className="text-xs text-slate-400">{r.village}, {r.district}{r.state ? `, ${r.state}` : ''}</p>
              </div>
              {r.approvedAutomatically ? (
                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">auto-accepted</span>
              ) : (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">officer-verified</span>
              )}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-slate-500">Khatian</dt><dd className="text-right font-medium">{r.khatianNumber || '—'}</dd>
              <dt className="text-slate-500">Plot</dt><dd className="text-right font-medium">{r.plotNumber || '—'}</dd>
              <dt className="text-slate-500">Area</dt><dd className="text-right font-medium">{r.area} {r.areaUnit}</dd>
              <dt className="text-slate-500">Land type</dt><dd className="text-right font-medium">{r.landType || '—'}</dd>
              <dt className="text-slate-500">Confidence</dt><dd className="text-right font-medium">{r.confidence}%</dd>
            </dl>
            {r.mutationDetails && <p className="mt-2 text-xs text-slate-400">Mutation: {r.mutationDetails}</p>}
          </div>
        ))}
        {data.items.length === 0 && (
          <div className="rounded-xl bg-white p-10 text-center text-slate-400 ring-1 ring-slate-200 md:col-span-2 xl:col-span-3">
            No records match your search.
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
