import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../services/api.js';
import ConfidenceBadge from '../components/ConfidenceBadge.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const FIELD_LABELS = {
  ownerName: 'Owner Name',
  khatianNumber: 'Khatian Number',
  plotNumber: 'Plot Number',
  surveyNumber: 'Survey/Khasra Number',
  area: 'Area',
  areaUnit: 'Area Unit',
  village: 'Village',
  tehsil: 'Tehsil',
  district: 'District',
  state: 'State',
  landType: 'Land Type',
  mutationDetails: 'Mutation Details',
};

const PIPELINE_STEPS = [
  { key: 'prep', label: 'Image quality enhancement' },
  { key: 'lang', label: 'Language detection' },
  { key: 'ocr', label: 'OCR / text recognition' },
  { key: 'owner', label: 'Land-owner extraction' },
  { key: 'survey', label: 'Survey & khatian extraction' },
  { key: 'area', label: 'Area extraction' },
  { key: 'valid', label: 'Validation completed' },
];

export default function UploadDocument() {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [meta, setMeta] = useState({ documentType: 'Khatian', language: 'auto', district: '', state: '', title: '' });
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [doneSteps, setDoneSteps] = useState([]);

  const pickFile = (f) => {
    if (!f) return;
    const ok = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/tiff', 'text/plain'];
    if (!ok.includes(f.type)) {
      setError('Only PDF, PNG, JPG, WEBP, TIFF or plain-text transcript files are allowed.');
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      setError('File too large (max 15 MB).');
      return;
    }
    setError('');
    setFile(f);
    setResult(null);
    setDoneSteps([]);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please choose a scanned document (PDF or image).');
      return;
    }
    setBusy(true);
    setError('');
    setResult(null);
    setDoneSteps([]);

    // animate pipeline steps while waiting
    const timer = setInterval(() => {
      setDoneSteps((prev) => (prev.length < PIPELINE_STEPS.length ? [...prev, PIPELINE_STEPS[prev.length].key] : prev));
    }, 700);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('documentType', meta.documentType);
      fd.append('language', meta.language);
      fd.append('district', meta.district);
      fd.append('state', meta.state);
      if (meta.title) fd.append('title', meta.title);

      const res = await api.post('/documents/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      clearInterval(timer);
      setDoneSteps(PIPELINE_STEPS.map((s) => s.key));
      setResult(res.data);
    } catch (err) {
      clearInterval(timer);
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Upload Land Record</h1>
        <p className="text-sm text-slate-500">Upload a scanned document — the AI pipeline extracts, validates and routes it for verification.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Upload form */}
        <form onSubmit={submit} className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 lg:col-span-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pickFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition ${
              dragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50 hover:border-brand-400'
            }`}
          >
            <span className="text-4xl">📤</span>
            <p className="mt-2 font-medium text-slate-700">{file ? file.name : 'Drag & drop PDF / Image here'}</p>
            <p className="text-xs text-slate-400">or click to browse — PDF, PNG, JPG, WEBP, TIFF or .txt transcript (max 15 MB)</p>
            {file && <p className="mt-1 text-xs text-brand-600">{(file.size / 1024).toFixed(0)} KB selected — click to change</p>}
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.txt"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Document Type</label>
              <select
                value={meta.documentType}
                onChange={(e) => setMeta({ ...meta, documentType: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              >
                {['Khatian', 'Khasra', 'Patta', 'Mutation Record', 'Other'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Language</label>
              <select
                value={meta.language}
                onChange={(e) => setMeta({ ...meta, language: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              >
                <option value="auto">Auto Detect</option>
                <option value="eng">English</option>
                <option value="hin">Hindi</option>
                <option value="ben">Bengali</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">District (hint)</label>
              <input
                value={meta.district}
                onChange={(e) => setMeta({ ...meta, district: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                placeholder="e.g. Burdwan"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">State (hint)</label>
              <input
                value={meta.state}
                onChange={(e) => setMeta({ ...meta, state: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                placeholder="e.g. West Bengal"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-brand-600 py-3 font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? 'Processing document…' : '⚙️ Process Document'}
          </button>
        </form>

        {/* Live pipeline panel */}
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 lg:col-span-2">
          <h2 className="mb-4 font-semibold text-slate-800">AI Processing Pipeline</h2>
          <ol className="space-y-3 text-sm">
            {PIPELINE_STEPS.map((s, i) => {
              const done = doneSteps.includes(s.key);
              const active = !done && doneSteps.length === i && busy;
              return (
                <li key={s.key} className={`flex items-center gap-3 ${done ? 'text-slate-700' : active ? 'text-brand-700' : 'text-slate-400'}`}>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-emerald-500 text-white' : active ? 'bg-brand-600 text-white animate-pulse' : 'bg-slate-100'}`}>
                    {done ? '✓' : i + 1}
                  </span>
                  {s.label}
                </li>
              );
            })}
          </ol>
          {busy && <p className="mt-4 text-xs text-slate-400">Running OCR + extraction — large scans can take a few seconds…</p>}
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>}

      {result && (
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-800">Extraction Result</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">Confidence:</span>
              <ConfidenceBadge value={result.document.overallConfidence} />
              <StatusBadge value={result.document.stage} />
              <span className="text-xs text-slate-400">engine: {result.document.aiMeta?.engine}</span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-600">Extracted Fields</h3>
              <dl className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                {Object.entries(FIELD_LABELS).map(([key, label]) => {
                  const value = result.document.extracted?.[key] || '';
                  const fc = result.document.fieldConfidences?.find((f) => f.field === key);
                  return (
                    <div key={key} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="flex items-center gap-2 text-right font-medium text-slate-800">
                        {value || <span className="text-slate-300">—</span>}
                        {fc && <ConfidenceBadge value={fc.confidence} />}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-600">Validation</h3>
              {(result.document.validation?.errors || []).length === 0 && (result.document.validation?.warnings || []).length === 0 && (
                <p className="text-sm text-emerald-600">✓ All validation rules passed</p>
              )}
              {(result.document.validation?.errors || []).map((e, i) => (
                <p key={i} className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-100">⛔ {e}</p>
              ))}
              {(result.document.validation?.warnings || []).map((w, i) => (
                <p key={i} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 ring-1 ring-amber-100">⚠️ {w}</p>
              ))}
              {(result.document.validation?.duplicates || []).map((d, i) => (
                <p key={i} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-100">
                  ⚠️ Possible duplicate record detected — {d.reason} (score {d.score}%)
                </p>
              ))}

              <h3 className="pt-2 text-sm font-semibold text-slate-600">Pipeline & Warnings</h3>
              <p className="text-xs text-slate-500">Steps: {(result.document.aiMeta?.pipeline || []).join(' → ') || '—'}</p>
              {(result.document.aiMeta?.warnings || []).map((w, i) => (
                <p key={i} className="text-xs text-amber-600">{w}</p>
              ))}

              <div className="pt-2">
                {result.document.status === 'verified' || result.document.stage === 'auto_accept' ? (
                  <Link to="/records" className="font-medium text-brand-700 hover:underline">View in Land Records →</Link>
                ) : (
                  <Link to="/verification" className="font-medium text-brand-700 hover:underline">Go to Verification queue →</Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
