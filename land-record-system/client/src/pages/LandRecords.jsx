import { useEffect, useState } from 'react';
import { api, errMsg } from '../services/api.js';
import {
  IconSearch, IconChevronLeft, IconChevronRight, IconRecords, IconCheckSolid, IconOfficer, IconStamp,
} from '../components/icons.js';

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
        <h1 className="page-title">Digital Land Records</h1>
        <p className="page-subtitle">Approved, verified records — searchable by owners, officers and citizens.</p>
      </div>

      <div className="panel flex flex-wrap items-center gap-3 p-4">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={filters.q}
            onChange={(e) => {
              setPage(1);
              setFilters({ ...filters, q: e.target.value });
            }}
            placeholder="Search owner, village, district, khatian, plot…"
            className="form-input w-72 pl-10"
          />
        </div>
        <input
          value={filters.district}
          onChange={(e) => {
            setPage(1);
            setFilters({ ...filters, district: e.target.value });
          }}
          placeholder="District"
          className="form-input w-40"
        />
        <input
          value={filters.village}
          onChange={(e) => {
            setPage(1);
            setFilters({ ...filters, village: e.target.value });
          }}
          placeholder="Village"
          className="form-input w-40"
        />
        <select
          value={filters.landType}
          onChange={(e) => {
            setPage(1);
            setFilters({ ...filters, landType: e.target.value });
          }}
          className="form-input w-44"
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
          <div key={r._id} className="panel p-5 transition hover:shadow-card-hover">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{r.ownerName}</p>
                <p className="text-xs text-slate-400">{r.village}, {r.district}{r.state ? `, ${r.state}` : ''}</p>
              </div>
              {r.approvedAutomatically ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-100">
                  <IconOfficer className="text-[10px]" /> auto-accepted
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                  <IconCheckSolid className="text-[10px]" /> officer-verified
                </span>
              )}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-slate-100 pt-3 text-sm">
              <dt className="text-slate-500">Khatian</dt><dd className="text-right font-medium tabular-nums">{r.khatianNumber || '—'}</dd>
              <dt className="text-slate-500">Plot</dt><dd className="text-right font-medium tabular-nums">{r.plotNumber || '—'}</dd>
              <dt className="text-slate-500">Area</dt><dd className="text-right font-medium tabular-nums">{r.area} {r.areaUnit}</dd>
              <dt className="text-slate-500">Land type</dt><dd className="text-right font-medium">{r.landType || '—'}</dd>
              <dt className="text-slate-500">Confidence</dt><dd className="text-right font-medium tabular-nums">{r.confidence}%</dd>
            </dl>
            {r.mutationDetails && (
              <p className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-2 text-xs text-slate-400">
                <IconStamp className="shrink-0" /> Mutation: {r.mutationDetails}
              </p>
            )}
          </div>
        ))}
        {data.items.length === 0 && (
          <div className="panel flex flex-col items-center justify-center p-12 text-center text-slate-400 md:col-span-2 xl:col-span-3">
            <IconRecords className="text-3xl" />
            <p className="mt-3 text-sm">No records match your search.</p>
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
