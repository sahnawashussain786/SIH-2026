const level = (c) => (c >= 90 ? 'high' : c >= 70 ? 'medium' : 'low');

const styles = {
  high: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  medium: 'bg-amber-100 text-amber-800 ring-amber-200',
  low: 'bg-rose-100 text-rose-800 ring-rose-200',
};

export default function ConfidenceBadge({ value }) {
  const l = level(value);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${styles[l]}`}>
      {value}% {l === 'high' ? '✓' : l === 'medium' ? '•' : '⚠'}
    </span>
  );
}
