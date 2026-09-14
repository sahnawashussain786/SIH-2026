import {
  IconClock, IconRefresh, IconCheckSolid, IconX, IconReject, IconCheck, IconEye, IconWarn, IconApproved,
} from './icons.js';

const MAP = {
  uploaded: { cls: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200', Icon: null },
  processing: { cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100', Icon: IconClock },
  processed: { cls: 'bg-sky-50 text-sky-700 ring-1 ring-sky-100', Icon: IconRefresh },
  verified: { cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100', Icon: IconCheckSolid },
  rejected: { cls: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100', Icon: IconReject },
  failed: { cls: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100', Icon: IconX },
  auto_accept: { cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100', Icon: IconApproved },
  manual_review: { cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100', Icon: IconEye },
  mandatory_verification: { cls: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100', Icon: IconWarn },
  approved: { cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100', Icon: IconCheck },
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
  const { cls, Icon } = MAP[value] || { cls: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200', Icon: null };
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {Icon && <Icon className="text-[11px]" />}
      {LABELS[value] || value}
    </span>
  );
}
