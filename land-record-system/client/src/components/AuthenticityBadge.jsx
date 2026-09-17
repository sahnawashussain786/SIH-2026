import {
  FaCheckCircle as IconCheckSolid,
  FaTimesCircle as IconErrorSolid,
  FaExclamationCircle as IconWarnSolid,
} from "react-icons/fa";
import { FiInfo as IconInfo } from "react-icons/fi";

const VERDICTS = {
  ai_generated: {
    label: "Likely AI-Generated",
    icon: IconErrorSolid,
    cls: "bg-rose-50 text-rose-700 ring-rose-200",
    tip: "Metadata forensics and/or Gemini visual inspection found strong signs this image was created by an AI generator.",
  },
  suspicious: {
    label: "Suspicious — needs review",
    icon: IconWarnSolid,
    cls: "bg-amber-50 text-amber-700 ring-amber-200",
    tip: "Some warning signs found (editing software, generator-style dimensions, C2PA marker). Manual verification recommended.",
  },
  likely_authentic: {
    label: "Likely Authentic Scan",
    icon: IconCheckSolid,
    cls: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    tip: "No AI-generation fingerprints found; visuals consistent with a genuine scan/photograph of a paper document.",
  },
};

/** AI-generated-image detection verdict badge (documents & records). */
export default function AuthenticityBadge({ authenticity, detailed = false }) {
  if (!authenticity?.verdict) return null;
  const v = VERDICTS[authenticity.verdict] || VERDICTS.likely_authentic;
  const Icon = v.icon;

  const body = (
    <span
      title={v.tip}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${v.cls}`}
    >
      <Icon className="text-[11px]" />
      {v.label}
      {detailed && (
        <span className="font-mono text-[10px] font-normal opacity-70">
          AI-score {authenticity.score}/100
        </span>
      )}
    </span>
  );

  if (!detailed || !authenticity.reasons?.length) return body;
  return (
    <details className="group mt-1">
      <summary className="inline-block cursor-pointer list-none">
        {body}
      </summary>
      <ul className="mt-2 space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
        {authenticity.reasons.map((r, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <IconInfo className="mt-0.5 shrink-0 text-slate-400" />
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
