import { IconCheckCircle, IconWarn, IconHelp } from './icons.js';

const level = (c) => (c >= 90 ? 'high' : c >= 70 ? 'medium' : 'low');

const styles = {
  high: { cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200', Icon: IconCheckCircle },
  medium: { cls: 'bg-amber-50 text-amber-800 ring-amber-200', Icon: IconWarn },
  low: { cls: 'bg-rose-50 text-rose-800 ring-rose-200', Icon: IconHelp },
};

export default function ConfidenceBadge({ value }) {
  const l = level(value);
  const { cls, Icon } = styles[l];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ring-1 ${cls}`}>
      <Icon className="text-[11px]" /> {value}%
    </span>
  );
}
