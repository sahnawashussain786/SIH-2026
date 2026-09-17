import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, errMsg } from "../services/api.js";
import { useToast } from "../context/ToastContext.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import ConfidenceBadge from "../components/ConfidenceBadge.jsx";
import AuthenticityBadge from "../components/AuthenticityBadge.jsx";
import DocumentViewer from "../components/DocumentViewer.jsx";
import {
  IconArrowLeft,
  IconSave,
  IconCheck,
  IconX,
  IconError,
  IconWarn,
  IconDuplicate,
  IconEye,
} from "../components/icons.js";

const FIELD_LABELS = {
  ownerName: "Owner Name",
  fatherName: "Father's Name",
  khatianNumber: "Khatian Number",
  plotNumber: "Plot Number",
  surveyNumber: "Survey/Khasra Number",
  area: "Area",
  areaUnit: "Area Unit",
  village: "Village",
  tehsil: "Tehsil",
  district: "District",
  state: "State",
  landType: "Land Type",
  mutationDetails: "Mutation Details",
};

export default function DocumentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [doc, setDoc] = useState(null);
  const [form, setForm] = useState({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    api
      .get(`/documents/${id}`)
      .then((res) => {
        setDoc(res.data.document);
        setForm(res.data.document.extracted || {});
        setNote(res.data.document.reviewNote || "");
      })
      .catch((err) => setError(errMsg(err)));
  }, [id]);

  if (error)
    return (
      <div className="rounded-lg bg-rose-50 p-4 text-rose-700">{error}</div>
    );
  if (!doc) return <div className="text-slate-500">Loading…</div>;

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const act = async (action) => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await api.put(`/verification/${id}`, {
        action,
        extracted: form,
        note,
      });
      setDoc(res.data.document);
      const msg =
        action === "approve"
          ? "Record approved and saved to Land Records."
          : action === "reject"
            ? "Document rejected."
            : "Edits saved and data re-validated.";
      setSuccess(msg);
      if (action === "approve")
        toast.success(msg, { title: "Record approved" });
      else if (action === "reject")
        toast.warning(msg, { title: "Document rejected" });
      else toast.info(msg, { title: "Changes saved" });
    } catch (err) {
      const m = errMsg(err);
      setError(m);
      toast.error(m, { title: "Action failed", duration: 8000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link
            to="/documents"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
          >
            <IconArrowLeft className="text-sm" /> Back to documents
          </Link>
          <h1 className="page-title mt-1 break-words">{doc.title}</h1>
          <p className="page-subtitle break-words">
            {doc.originalName} · {(doc.size / 1024).toFixed(0)} KB · uploaded by{" "}
            {doc.uploadedBy?.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value={doc.status} />
          <StatusBadge value={doc.stage} />
          <ConfidenceBadge value={doc.overallConfidence} />
          <AuthenticityBadge detailed authenticity={doc.authenticity} />
        </div>
      </div>

      {success && (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">
          {success}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Original document */}
        <div className="panel p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
            <IconEye className="text-brand-600" /> Original Document
          </h2>
          <DocumentViewer doc={doc} />
          {doc.authenticity?.verdict && (
            <div className="mt-3">
              <AuthenticityBadge detailed authenticity={doc.authenticity} />
            </div>
          )}
          {doc.ocrText && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-brand-700">
                Show raw OCR text
              </summary>
              <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                {doc.ocrText}
              </pre>
            </details>
          )}
        </div>

        {/* AI extracted data — editable */}
        <div className="panel p-5">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
            <IconSave className="text-brand-600" /> AI Extracted Data
          </h2>
          <div className="space-y-3">
            {Object.entries(FIELD_LABELS).map(([key, label]) => {
              const fc = (doc.fieldConfidences || []).find(
                (f) => f.field === key,
              );
              const vErr = (doc.validation?.errors || []).some((e) =>
                e.toLowerCase().includes(key.toLowerCase()),
              );
              return (
                <div key={key}>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-600">
                      {label}
                    </label>
                    {fc && <ConfidenceBadge value={fc.confidence} />}
                  </div>
                  <input
                    value={form[key] || ""}
                    onChange={(e) => setField(key, e.target.value)}
                    className={`w-full rounded-lg border px-3 py-2 text-sm transition focus:outline-none focus:ring-2 ${
                      vErr
                        ? "border-rose-300 focus:ring-rose-200"
                        : "border-slate-300 focus:border-brand-500 focus:ring-brand-500/25"
                    }`}
                  />
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <label className="form-label">Review note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="form-input"
              placeholder="Optional note for the audit trail…"
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-100 pt-4">
            <button
              disabled={busy}
              onClick={() => act("save")}
              className="btn-secondary"
            >
              <IconSave /> Save edits
            </button>
            <button
              disabled={busy}
              onClick={() => act("approve")}
              className="btn-success"
            >
              <IconCheck /> Approve
            </button>
            <button
              disabled={busy}
              onClick={() => act("reject")}
              className="btn-danger"
            >
              <IconX /> Reject
            </button>
          </div>

          {(doc.validation?.errors || []).length > 0 && (
            <div className="mt-4 space-y-1">
              {doc.validation.errors.map((e, i) => (
                <p
                  key={i}
                  className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700"
                >
                  <IconError className="mt-0.5 shrink-0" /> {e}
                </p>
              ))}
            </div>
          )}
          {(doc.validation?.warnings || []).map((w, i) => (
            <p
              key={i}
              className="mt-1 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700"
            >
              <IconWarn className="mt-0.5 shrink-0" /> {w}
            </p>
          ))}
          {(doc.validation?.duplicates || []).map((d, i) => (
            <p
              key={i}
              className="mt-1 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
            >
              <IconDuplicate className="mt-0.5 shrink-0" /> Duplicate:{" "}
              {d.reason} (score {d.score}%)
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
