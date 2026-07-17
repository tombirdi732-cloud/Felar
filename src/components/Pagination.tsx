import Link from "next/link";

export function Pagination({
  page,
  pages,
  basePath,
  searchParams,
}: {
  page: number;
  pages: number;
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  if (pages <= 1) return null;

  const href = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (v) params.set(k, v);
    if (p > 1) params.set("page", String(p));
    else params.delete("page");
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const numbers: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++) numbers.push(p);

  return (
    <nav className="mt-8 flex items-center justify-center gap-1.5" aria-label="Страницы">
      {page > 1 && (
        <Link href={href(page - 1)} className="btn-secondary !px-3.5">←</Link>
      )}
      {numbers[0] > 1 && <span className="px-1 text-ink-500">…</span>}
      {numbers.map((p) => (
        <Link
          key={p}
          href={href(p)}
          aria-current={p === page ? "page" : undefined}
          className={
            p === page
              ? "inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 font-semibold text-white"
              : "inline-flex h-11 w-11 items-center justify-center rounded-xl border border-ink-300 bg-white font-medium text-ink-700 hover:border-ink-500"
          }
        >
          {p}
        </Link>
      ))}
      {numbers[numbers.length - 1] < pages && <span className="px-1 text-ink-500">…</span>}
      {page < pages && (
        <Link href={href(page + 1)} className="btn-secondary !px-3.5">→</Link>
      )}
    </nav>
  );
}
