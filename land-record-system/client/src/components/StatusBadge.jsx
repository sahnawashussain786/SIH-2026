const MAP = {
  uploaded: 'bg-slate-100 text-slate-700',
  processing: 'bg-blue-100 text-blue-700',
  processed: 'bg-sky-100 text-sky-700',
  verified: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
  failed: 'bg-rose-100 text-rose-700',
  auto_accept: 'bg-emerald-100 text-emerald-700',
  manual_review: 'bg-amber-100 text-amber-700',
  mandatory_verification: 'bg-rose-100 text-rose-700',
  approved: 'bg-emerald-100 text-emerald-700',
};

const LABELS = {
  uploaded: 'Uploaded',
  processing: 'Processing',
  processed: 'Processed',
  verified: 'Verified',
  rejected: 'Rejected',
  failed: 'Failed',
  auto_accept: 'Auto-accepted',
  manual_review: 'Manual review',
  mandatory_verification: 'Mandatory verification',
  approved: 'Approved',
};

export default function StatusBadge({ value }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${MAP[value] || 'bg-slate-100 text-slate-700'}`}>
      {LABELS[value] || value}
    </span>
  );
}
