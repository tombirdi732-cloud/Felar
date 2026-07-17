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
      className="inline-flex items-center gap-1 rounded-full bg-ink-900 px-2 py-0.5 text-xs font-semibold text-brand-300"
      title="Личность подтверждена документом"
    >
      {/* Фирменный бейдж верификации заказчика */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/verified.png" alt="" className="h-3.5 w-3.5 object-contain" />
      {!compact && "Верифицирован"}
    </span>
  );
}
