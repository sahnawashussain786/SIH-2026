import { API_BASE } from '../services/api.js';

export default function DocumentViewer({ doc }) {
  // GridFS-backed endpoint (works in dev via the Vite proxy and on Vercel via
  // the deployed API) — falls back to the legacy /uploads path for old records.
  const url = doc.fileUrl && !doc.fileUrl.includes('pending')
    ? (doc.fileUrl.startsWith('http') ? doc.fileUrl : `${API_BASE}${doc.fileUrl}`)
    : `/uploads/${doc.storedName}`;
  const isImage = doc.mimeType?.startsWith('image/');
  const isPdf = doc.mimeType === 'application/pdf';

  if (isImage) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-3">
        <img src={url} alt={doc.title} className="max-h-[70vh] w-auto max-w-full rounded object-contain shadow-sm" />
      </div>
    );
  }
  if (isPdf) {
    return <iframe title={doc.title} src={url} className="h-[70vh] w-full rounded-lg border border-slate-200 bg-white" />;
  }
  return (
    <pre className="h-[70vh] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 font-mono text-[13px] leading-relaxed text-slate-700">
      {doc.ocrText || '(no preview available — run OCR to populate text)'}
    </pre>
  );
}
