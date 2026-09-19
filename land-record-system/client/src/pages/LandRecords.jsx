import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../services/api.js';
import Spinner from '../components/Spinner.jsx';
import RecordMap from '../components/RecordMap.jsx';
import RecordsMap from '../components/RecordsMap.jsx';
import {
  IconSearch, IconChevronLeft, IconChevronRight, IconRecords, IconCheckSolid,
  IconOfficer, IconStamp, IconClose, IconPin, IconUser, IconLayers,
  IconCalendar, IconDocument, IconApproved, IconMap,
} from '../components/icons.js';

const EMPTY = { q: '', district: '', village: '', landType: '' };

export default function LandRecords() {
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(EMPTY);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null); // full record from GET /records/:id
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [view, setView] = useState('list'); // 'list' | 'map'

  const load = () => {
    const params = new URLSearchParams({ page, limit: 12 });
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    api
      .get(`/records?${params}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(errMsg(err)));
  };

  useEffect(load, [page, filters]);

  const openDetail = (id) => {
    setDetailLoading(true);
    setDetailError('');
    setDetail({ _id: id }); // open immediately with what we know
    api
      .get(`/records/${id}`)
      .then((res) => setDetail(res.data.record))
      .catch((err) => setDetailError(errMsg(err)))
      .finally(() => setDetailLoading(false));
  };

  const closeDetail = () => {
    setDetail(null);
    setDetailError('');
  };

  // Close on Escape + lock background scroll while the modal is open
  useEffect(() => {
    if (!detail) return undefined;
    const onKey = (e) => e.key === 'Escape' && closeDetail();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [detail]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Digital Land Records</h1>
        <p className="page-subtitle">Approved, verified records — click any record for its full details.</p>
      </div>      <div className="panel flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex rounded-lg bg-slate-100 p-1">
          <button
            onClick={() => setView('list')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              view === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <IconRecords className="text-xs" /> List
          </button>
          <button
            onClick={() => setView('map')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              view === 'map' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <IconMap className="text-xs" /> Map
          </button>
        </div>
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={filters.q}
            onChange={(e) => {
              setPage(1);
              setFilters({ ...filters, q: e.target.value });
            }}
            placeholder="Search owner, village, district, khatian, plot…"
            className="form-input sm:w-72"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-3">
          <input
            value={filters.district}
            onChange={(e) => {
              setPage(1);
              setFilters({ ...filters, district: e.target.value });
            }}
            placeholder="District"
            className="form-input"
          />
          <input
            value={filters.village}
            onChange={(e) => {
              setPage(1);
              setFilters({ ...filters, village: e.target.value });
            }}
            placeholder="Village"
            className="form-input"
          />
          <select
            value={filters.landType}
            onChange={(e) => {
              setPage(1);
              setFilters({ ...filters, landType: e.target.value });
            }}
            className="form-input col-span-2 sm:w-44"
          >
            <option value="">All land types</option>
            {['Agricultural', 'Residential', 'Commercial', 'Wasteland'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <span className="text-sm text-slate-400">{data.total} records</span>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {view === 'map' ? (
        <RecordsMap
          onPick={(id) => {
            setView('list');
            openDetail(id);
          }}
        />
      ) : (
      <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.items.map((r) => (
          <button
            key={r._id}
            type="button"
            onClick={() => openDetail(r._id)}
            className="panel cursor-pointer p-5 text-left transition hover:-translate-y-0.5 hover:shadow-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            title="View full record"
          >
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
          </button>
        ))}
        {data.items.length === 0 && (
          <div className="panel flex flex-col items-center justify-center p-12 text-center text-slate-400 md:col-span-2 xl:col-span-3">
            <IconRecords className="text-3xl" />
            <p className="mt-3 text-sm">No records match your search.</p>
          </div>
        )}
      </div>
      )}

      {data.pages > 1 && view === 'list' && (
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

      {detail && (
        <RecordDetailModal
          record={detail}
          loading={detailLoading}
          error={detailError}
          onClose={closeDetail}
        />
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-slate-800">{value || '—'}</dd>
    </div>
  );
}

function RecordDetailModal({ record, loading, error, onClose }) {
  const src = record?.sourceDocument;
  return (
      <div
      className="anim-fade-in fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Land record details"
    >
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="anim-scale-in relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10">
        {/* header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/70 px-6 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-700">
              <IconRecords className="text-xs" /> Land Record
            </p>
            <h2 className="truncate text-lg font-bold text-slate-900">{record.ownerName || 'Loading…'}</h2>
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <IconPin className="text-[10px]" />
              {[record.village, record.tehsil, record.district, record.state].filter(Boolean).join(', ') || '—'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close details"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-700"
          >
            <IconClose />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          )}
          {loading && !error && (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-slate-400">
              <Spinner size="lg" />
              <p className="text-sm animate-pulse">Loading full record…</p>
            </div>
          )}
          {!loading && !error && (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {record.approvedAutomatically ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-100">
                    <IconOfficer className="text-[10px]" /> Auto-accepted by AI
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                    <IconApproved className="text-[10px]" /> Officer verified
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                  {record.confidence ?? 0}% extraction confidence
                </span>
                {record.verifiedAt && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    <IconCalendar className="text-[10px]" />
                    Verified {new Date(record.verifiedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>

              <dl className="grid gap-2 sm:grid-cols-2">
                <Row label="Owner name" value={record.ownerName} />
                <Row label="Father's name" value={record.fatherName} />
                <Row label="Khatian / Khata no." value={record.khatianNumber} />
                <Row label="Plot / Dag no." value={record.plotNumber} />
                <Row label="Survey no." value={record.surveyNumber} />
                <Row label="Area" value={record.area ? `${record.area} ${record.areaUnit || ''}`.trim() : ''} />
                <Row label="Land type" value={record.landType} />
                <Row label="Mutation" value={record.mutationDetails} />
                <Row label="Village / Mouza" value={record.village} />
                <Row label="Tehsil / Circle" value={record.tehsil} />
                <Row label="District" value={record.district} />
                <Row label="State" value={record.state} />
                {record.gis?.lat != null && (
                  <Row label="GIS location" value={`${record.gis.lat}, ${record.gis.lng}`} />
                )}
              </dl>

              {/* Where the land actually is */}
              <div className="mt-4">
                <RecordMap recordId={record._id} initial={record.gis?.lat != null ? record.gis : null} />
              </div>

              {src && (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <IconDocument className="shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Source document</p>
                      <p className="truncate text-sm font-medium text-slate-700">{src.title || src.originalName || 'Untitled'}</p>
                    </div>
                  </div>
                  {src._id && (
                    <Link to={`/documents/${src._id}`} className="btn-secondary shrink-0 !px-3 !py-1.5 text-sm">
                      Open document
                    </Link>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-6 py-3.5">
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <IconUser className="text-xs" /> Record ID: {record._id?.slice(-8) || '—'}
          </p>
          <div className="flex gap-2">
            {record.createdAt && (
              <span className="hidden items-center gap-1 text-xs text-slate-400 sm:flex">
                <IconLayers className="text-xs" />
                Created {new Date(record.createdAt).toLocaleDateString('en-IN')}
              </span>
            )}
            <button onClick={onClose} className="btn-primary !px-4 !py-1.5 text-sm">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
