import { IconStar } from "./Icons";

export function Rating({
  value,
  count,
  size = "sm",
}: {
  value: number | null;
  count?: number;
  size?: "sm" | "md";
}) {
  const starCls = size === "md" ? "h-5 w-5" : "h-4 w-4";
  if (value == null) {
    return <span className="text-sm text-ink-500">Пока без отзывов</span>;
  }
  return (
    <span className="inline-flex items-center gap-1">
      <IconStar className={`${starCls} fill-amber-400 stroke-amber-400`} />
      <span className={`font-semibold ${size === "md" ? "text-base" : "text-sm"}`}>{value.toFixed(1)}</span>
      {count != null && (
        <span className="text-sm text-ink-500">({count})</span>
      )}
    </span>
  );
}

export function VerifiedBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"
      title="Личность подтверждена документом"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2.5 14.4 4l2.8-.2 1 2.7 2.3 1.6-.7 2.8.7 2.8-2.3 1.6-1 2.7-2.8-.2-2.4 1.5L9.6 20l-2.8.2-1-2.7-2.3-1.6.7-2.8-.7-2.8 2.3-1.6 1-2.7 2.8.2L12 2.5Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
      {!compact && "Верифицирован"}
    </span>
  );
}
