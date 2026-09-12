import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, errMsg } from '../services/api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import ConfidenceBadge from '../components/ConfidenceBadge.jsx';
import DocumentViewer from '../components/DocumentViewer.jsx';

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

export default function DocumentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [form, setForm] = useState({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    api.get(`/documents/${id}`)
      .then((res) => {
        setDoc(res.data.document);
        setForm(res.data.document.extracted || {});
        setNote(res.data.document.reviewNote || '');
      })
      .catch((err) => setError(errMsg(err)));
  }, [id]);

  if (error) return <div className="rounded-lg bg-rose-50 p-4 text-rose-700">{error}</div>;
  if (!doc) return <div className="text-slate-500">Loading…</div>;

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const act = async (action) => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.put(`/verification/${id}`, { action, extracted: form, note });
      setDoc(res.data.document);
      setSuccess(
        action === 'approve' ? 'Record approved and saved to Land Records.'
        : action === 'reject' ? 'Document rejected.'
        : 'Edits saved and data re-validated.'
      );
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/documents" className="text-sm text-brand-700 hover:underline">← Back to documents</Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-800">{doc.title}</h1>
          <p className="text-sm text-slate-500">{doc.originalName} · {(doc.size / 1024).toFixed(0)} KB · uploaded by {doc.uploadedBy?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge value={doc.status} />
          <StatusBadge value={doc.stage} />
          <ConfidenceBadge value={doc.overallConfidence} />
        </div>
      </div>

      {success && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{success}</div>}
      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Original document */}
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-3 font-semibold text-slate-800">Original Document</h2>
          <DocumentViewer doc={doc} />
          {doc.ocrText && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-brand-700">Show raw OCR text</summary>
              <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{doc.ocrText}</pre>
            </details>
          )}
        </div>

        {/* AI extracted data — editable */}
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-3 font-semibold text-slate-800">AI Extracted Data</h2>
          <div className="space-y-3">
            {Object.entries(FIELD_LABELS).map(([key, label]) => {
              const fc = (doc.fieldConfidences || []).find((f) => f.field === key);
              const vErr = (doc.validation?.errors || []).some((e) => e.toLowerCase().includes(key.toLowerCase()));
              return (
                <div key={key}>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-600">{label}</label>
                    {fc && <ConfidenceBadge value={fc.confidence} />}
                  </div>
                  <input
                    value={form[key] || ''}
                    onChange={(e) => setField(key, e.target.value)}
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                      vErr ? 'border-rose-300 focus:ring-rose-200' : 'border-slate-300 focus:border-brand-500 focus:ring-brand-500/30'
                    }`}
                  />
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-slate-600">Review note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Optional note for the audit trail…"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button disabled={busy} onClick={() => act('save')} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              💾 Save edits
            </button>
            <button disabled={busy} onClick={() => act('approve')} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
              ✓ Approve
            </button>
            <button disabled={busy} onClick={() => act('reject')} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">
              ✕ Reject
            </button>
          </div>

          {(doc.validation?.errors || []).length > 0 && (
            <div className="mt-4 space-y-1">
              {(doc.validation.errors).map((e, i) => (
                <p key={i} className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">⛔ {e}</p>
              ))}
            </div>
          )}
          {(doc.validation?.warnings || []).map((w, i) => (
            <p key={i} className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">⚠️ {w}</p>
          ))}
          {(doc.validation?.duplicates || []).map((d, i) => (
            <p key={i} className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ⚠️ Duplicate: {d.reason} (score {d.score}%)
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
