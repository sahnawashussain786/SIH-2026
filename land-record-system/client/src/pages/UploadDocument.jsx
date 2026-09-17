import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, errMsg } from "../services/api.js";
import { useToast } from "../context/ToastContext.jsx";
import ConfidenceBadge from "../components/ConfidenceBadge.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import AuthenticityBadge from "../components/AuthenticityBadge.jsx";
import Spinner from "../components/Spinner.jsx";
import {
  IconUploadSimple,
  IconFile,
  IconAI,
  IconCheck,
  IconCheckSolid,
  IconError,
  IconWarn,
  IconDuplicate,
  IconArrowRight,
  IconLanguage,
} from "../components/icons.js";

const FIELD_LABELS = {
  ownerName: "Owner Name",
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

const PIPELINE_STEPS = [
  { key: "prep", label: "Image quality enhancement" },
  { key: "lang", label: "Language detection" },
  { key: "ocr", label: "OCR / text recognition" },
  { key: "owner", label: "Land-owner extraction" },
  { key: "survey", label: "Survey & khatian extraction" },
  { key: "area", label: "Area extraction" },
  { key: "valid", label: "Validation completed" },
];

const LANGUAGES = [
  { value: "auto", label: "Auto Detect — all Indian languages" },
  { value: "eng", label: "English" },
  { value: "hin", label: "हिन्दी — Hindi" },
  { value: "ben", label: "বাংলা — Bengali" },
  { value: "mar", label: "मराठी — Marathi" },
  { value: "tel", label: "తెలుగు — Telugu" },
  { value: "tam", label: "தமிழ் — Tamil" },
  { value: "guj", label: "ગુજરાતી — Gujarati" },
  { value: "kan", label: "ಕನ್ನಡ — Kannada" },
  { value: "mal", label: "മലയാളം — Malayalam" },
  { value: "pan", label: "ਪੰਜਾਬੀ — Punjabi" },
  { value: "ori", label: "ଓଡ଼ିଆ — Odia" },
  { value: "ass", label: "অসমীয়া — Assamese" },
  { value: "urd", label: "اردو — Urdu" },
  { value: "san", label: "संस्कृतम् — Sanskrit" },
  { value: "nep", label: "नेपाली — Nepali" },
  { value: "kok", label: "कोंकणी — Konkani" },
  { value: "mai", label: "मैथिली — Maithili" },
  { value: "doi", label: "डोगरी — Dogri" },
  { value: "mni", label: "ꯃꯤꯇꯩꯂꯣꯟ — Manipuri" },
  { value: "bodo", label: "बड़ो — Bodo" },
  { value: "kas", label: "کٲشُر — Kashmiri" },
  { value: "sin", label: "سنڌي — Sindhi" },
  { value: "sat", label: "ᱥᱟᱱᱛᱟᱲᱤ — Santali" },
];

export default function UploadDocument() {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [meta, setMeta] = useState({
    documentType: "Khatian",
    language: "auto",
    district: "",
    state: "",
    title: "",
  });
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [doneSteps, setDoneSteps] = useState([]);
  const toast = useToast();

  // Serverless platforms cap request bodies (~4.5 MB on Vercel) — enforce a
  // smaller cap on production builds so users get a clear message instead of a
  // cryptic network error. Local dev keeps the full 15 MB.
  const MAX_MB = import.meta.env.PROD ? 4 : 15;

  const pickFile = (f) => {
    if (!f) return;
    const ok = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "image/tiff",
      "text/plain",
    ];
    if (!ok.includes(f.type)) {
      const m =
        "Only PDF, PNG, JPG, WEBP, TIFF or plain-text transcript files are allowed.";
      setError(m);
      toast.warning(m, { title: "Unsupported file type" });
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      const m = `File too large (max ${MAX_MB} MB${import.meta.env.PROD ? " on the deployed app — compress or crop the scan" : ""}).`;
      setError(m);
      toast.warning(m, { title: "File too large" });
      return;
    }
    setError("");
    setFile(f);
    setResult(null);
    setDoneSteps([]);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError("Please choose a scanned document (PDF or image).");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    setDoneSteps([]);

    // animate pipeline steps while waiting
    const timer = setInterval(() => {
      setDoneSteps((prev) =>
        prev.length < PIPELINE_STEPS.length
          ? [...prev, PIPELINE_STEPS[prev.length].key]
          : prev,
      );
    }, 700);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("documentType", meta.documentType);
      fd.append("language", meta.language);
      fd.append("district", meta.district);
      fd.append("state", meta.state);
      if (meta.title) fd.append("title", meta.title);

      // Instruct the AI to check whether the image is AI-generated (in addition
      // to extracting fields). Only meaningful for scans/images.
      const isImageDoc =
        [
          "image/png",
          "image/jpeg",
          "image/jpg",
          "image/webp",
          "image/tiff",
          "application/pdf",
        ].includes(file?.type || "") ||
        /\.(png|jpe?g|webp|tiff?)$/i.test(file?.name || "");
      if (isImageDoc) {
        fd.append("checkAuthenticity", "true");
      }

      const res = await api.post("/documents/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      // 202 = accepted; the AI pipeline keeps running server-side. Poll until
      // it finishes (this is the normal path on the deployed app).
      if (res.data.pending) {
        const id = res.data.document._id;
        const POLL_MS = 3000;
        const TIMEOUT_MS = 5 * 60 * 1000;
        const started = Date.now();
        let finalDoc = null;
        let failed = false;
        while (Date.now() - started < TIMEOUT_MS) {
          await new Promise((r) => setTimeout(r, POLL_MS));
          const s = await api.get(`/documents/${id}/status`);
          const st = s.data.document.status;
          if (st !== "processing" && st !== "uploaded") {
            if (st === "failed") {
              failed = true;
              break;
            }
            const full = await api.get(`/documents/${id}`);
            finalDoc = full.data.document;
            break;
          }
        }
        clearInterval(timer);
        if (failed) {
          const m =
            'AI processing failed for this document. It is saved in Documents with status "failed" — try re-uploading a clearer scan.';
          setError(m);
          toast.error(m, { title: "Processing failed", duration: 8000 });
          return;
        }
        if (!finalDoc) {
          const m =
            "Processing is taking longer than expected. The document is saved — check the Documents page in a minute.";
          setError(m);
          toast.warning(m, { title: "Still processing", duration: 8000 });
          return;
        }
        setDoneSteps(PIPELINE_STEPS.map((s) => s.key));
        setResult({ document: finalDoc, route: finalDoc.stage });
        toast.success(
          `"${finalDoc.title || file.name}" processed at ${finalDoc.overallConfidence}% confidence — ${finalDoc.stage === "auto_accept" ? "auto-accepted as a land record" : "sent for review"}.`,
          { title: "Extraction complete" },
        );
        return;
      }

      clearInterval(timer);
      setDoneSteps(PIPELINE_STEPS.map((s) => s.key));
      setResult(res.data);
      const d = res.data.document;
      toast.success(
        `"${d.title || file.name}" processed at ${d.overallConfidence}% confidence — ${d.stage === "auto_accept" ? "auto-accepted as a land record" : "sent for review"}.`,
        { title: "Extraction complete" },
      );
    } catch (err) {
      clearInterval(timer);
      const m = errMsg(err);
      setError(m);
      toast.error(m, { title: "Upload failed", duration: 8000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Upload Land Record</h1>
        <p className="page-subtitle">
          Upload a scanned document — the AI pipeline extracts, validates and
          routes it for verification.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Upload form */}
        <form onSubmit={submit} className="panel space-y-5 p-6 lg:col-span-3">
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
              dragOver
                ? "border-brand-500 bg-brand-50"
                : "border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50/40"
            }`}
          >
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-full transition ${dragOver ? "bg-brand-100 text-brand-700" : "bg-slate-200/70 text-slate-500"}`}
            >
              <IconUploadSimple className="text-2xl" />
            </span>
            <p className="mt-3 font-medium text-slate-700">
              {file ? file.name : "Drag & drop PDF / Image here"}
            </p>
            <p className="text-xs text-slate-400">
              or click to browse — PDF, PNG, JPG, WEBP, TIFF or .txt transcript
              (max 15 MB)
            </p>
            {file && (
              <p className="mt-1 text-xs font-medium text-brand-600">
                {(file.size / 1024).toFixed(0)} KB selected — click to change
              </p>
            )}
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
              <label className="form-label">Document Type</label>
              <select
                value={meta.documentType}
                onChange={(e) =>
                  setMeta({ ...meta, documentType: e.target.value })
                }
                className="form-input"
              >
                {["Khatian", "Khasra", "Patta", "Mutation Record", "Other"].map(
                  (t) => (
                    <option key={t}>{t}</option>
                  ),
                )}
              </select>
            </div>
            <div>
              <label className="form-label">
                <span className="inline-flex items-center gap-1">
                  <IconLanguage className="text-slate-400" /> Language
                </span>
              </label>
              <select
                value={meta.language}
                onChange={(e) => setMeta({ ...meta, language: e.target.value })}
                className="form-input"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">District (hint)</label>
              <input
                value={meta.district}
                onChange={(e) => setMeta({ ...meta, district: e.target.value })}
                className="form-input"
                placeholder="e.g. Burdwan"
              />
            </div>
            <div>
              <label className="form-label">State (hint)</label>
              <input
                value={meta.state}
                onChange={(e) => setMeta({ ...meta, state: e.target.value })}
                className="form-input"
                placeholder="e.g. West Bengal"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="btn-primary w-full py-3"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <Spinner light size="xs" /> Processing document…
              </span>
            ) : (
              <>
                <IconAI /> Process Document
              </>
            )}
          </button>
        </form>

        {/* Live pipeline panel */}
        <div className="panel p-6 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <IconAI className="text-brand-600" /> AI Processing Pipeline
          </h2>
          <ol className="mt-5 space-y-3.5 text-sm">
            {PIPELINE_STEPS.map((s, i) => {
              const done = doneSteps.includes(s.key);
              const active = !done && doneSteps.length === i && busy;
              return (
                <li
                  key={s.key}
                  className={`flex items-center gap-3 ${done ? "text-slate-700" : active ? "text-brand-700" : "text-slate-400"}`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      done
                        ? "bg-emerald-500 text-white"
                        : active
                          ? "animate-pulse bg-brand-600 text-white"
                          : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {done ? <IconCheck className="text-[10px]" /> : i + 1}
                  </span>
                  {s.label}
                </li>
              );
            })}
          </ol>
          {busy && (
            <p className="mt-4 flex items-center gap-2 text-xs text-slate-400">
              <Spinner size="xs" /> Running AI extraction — scanned documents can
              take up to a minute…
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </div>
      )}

      {result && (
        <div className="panel p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <IconFile className="text-brand-600" /> Extraction Result
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <AuthenticityBadge
                detailed
                authenticity={result.document.authenticity}
              />
              <span className="text-sm text-slate-500">Confidence:</span>
              <ConfidenceBadge value={result.document.overallConfidence} />
              <StatusBadge value={result.document.stage} />
              <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-500">
                engine: {result.document.aiMeta?.engine}
              </span>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="form-label">Extracted Fields</h3>
              <dl className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                {Object.entries(FIELD_LABELS).map(([key, label]) => {
                  const value = result.document.extracted?.[key] || "";
                  const fc = result.document.fieldConfidences?.find(
                    (f) => f.field === key,
                  );
                  return (
                    <div
                      key={key}
                      className="flex items-start justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <dt className="shrink-0 text-slate-500">{label}</dt>
                      <dd className="flex min-w-0 items-center justify-end gap-2 break-words text-right font-medium text-slate-800">
                        <span className="min-w-0 break-words">
                          {value || <span className="text-slate-300">—</span>}
                        </span>
                        {fc && <ConfidenceBadge value={fc.confidence} />}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
            <div className="space-y-3">
              <h3 className="form-label">
                Document Authenticity (AI-generated detection)
              </h3>
              <AuthenticityBadge
                detailed
                authenticity={result.document.authenticity}
              />
              <h3 className="form-label pt-2">Validation</h3>
              {(result.document.validation?.errors || []).length === 0 &&
                (result.document.validation?.warnings || []).length === 0 && (
                  <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-100">
                    <IconCheckSolid className="text-emerald-600" /> All
                    validation rules passed
                  </p>
                )}
              {(result.document.validation?.errors || []).map((e, i) => (
                <p
                  key={i}
                  className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-100"
                >
                  <IconError className="mt-0.5 shrink-0" /> {e}
                </p>
              ))}
              {(result.document.validation?.warnings || []).map((w, i) => (
                <p
                  key={i}
                  className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 ring-1 ring-amber-100"
                >
                  <IconWarn className="mt-0.5 shrink-0" /> {w}
                </p>
              ))}
              {(result.document.validation?.duplicates || []).map((d, i) => (
                <p
                  key={i}
                  className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-100"
                >
                  <IconDuplicate className="mt-0.5 shrink-0" /> Possible
                  duplicate record detected — {d.reason} (score {d.score}%)
                </p>
              ))}

              <h3 className="form-label pt-2">Pipeline &amp; Warnings</h3>
              <p className="text-xs text-slate-500">
                Steps:{" "}
                {(result.document.aiMeta?.pipeline || []).join(" → ") || "—"}
              </p>
              {(result.document.aiMeta?.warnings || []).map((w, i) => (
                <p key={i} className="text-xs text-amber-600">
                  {w}
                </p>
              ))}

              <div className="pt-2">
                {result.document.status === "verified" ||
                result.document.stage === "auto_accept" ? (
                  <Link
                    to="/records"
                    className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline"
                  >
                    View in Land Records <IconArrowRight className="text-sm" />
                  </Link>
                ) : (
                  <Link
                    to="/verification"
                    className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline"
                  >
                    Go to Verification queue{" "}
                    <IconArrowRight className="text-sm" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
