import { IconLoader } from "./icons.js";

/**
 * Reusable loading spinner.
 *
 * size: "xs" | "sm" | "md" | "lg"
 * light: renders white (for use on dark / colored surfaces)
 */
export default function Spinner({ size = "sm", light = false, className = "" }) {
  const dims = {
    xs: "h-3 w-3 border",
    sm: "h-4 w-4 border-2",
    md: "h-6 w-6 border-2",
    lg: "h-8 w-8 border-[3px]",
  }[size];

  return (
    <span
      role="status"
      aria-label="Loading"
      className={`spinner inline-block shrink-0 rounded-full ${dims} ${
        light
          ? "border-white/30 border-t-white"
          : "border-slate-300 border-t-brand-600"
      } ${className}`}
    />
  );
}

/** Centered page-level loader with a pulsing caption. */
export function PageLoader({ label = "Loading…" }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
      <Spinner size="lg" />
      <p className="text-sm animate-pulse">{label}</p>
    </div>
  );
}

/** Inline spinner + text for buttons and rows. */
export function LoadingLabel({ text = "Loading…", size = "sm" }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Spinner size={size} /> {text}
    </span>
  );
}

// Also export as named, so both `import Spinner` and `import { Spinner }` work
export { Spinner };
