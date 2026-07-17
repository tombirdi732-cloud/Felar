import Link from "next/link";
import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  text,
  actionHref,
  actionLabel,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-16 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-brand-600">
        {icon}
      </div>
      <h2 className="mt-5 text-xl font-bold text-ink-900">{title}</h2>
      <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-500">{text}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="btn-primary mt-6">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
