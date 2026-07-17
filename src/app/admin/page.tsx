import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { ReportActions } from "@/components/AdminActions";

export default async function AdminReportsPage() {
  const reports = await prisma.report.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      author: { select: { id: true, name: true } },
      listing: { select: { slug: true, title: true, status: true } },
      reportedUser: { select: { id: true, name: true, blocked: true, docVerified: true } },
    },
  });

  const open = reports.filter((r) => r.status === "OPEN");
  const closed = reports.filter((r) => r.status !== "OPEN");

  const Row = ({ r }: { r: (typeof reports)[number] }) => {
    const isVerificationRequest = r.reason.startsWith("[ВЕРИФИКАЦИЯ]");
    return (
      <li className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-ink-500">
              {formatDateTime(r.createdAt)} · от{" "}
              <Link href={`/user/${r.author.id}`} className="underline hover:text-brand-700">
                {r.author.name}
              </Link>
              {isVerificationRequest ? (
                <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
                  Заявка на верификацию
                </span>
              ) : (
                <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                  Жалоба: {r.targetType === "LISTING" ? "объявление" : r.targetType === "REVIEW" ? "отзыв" : "пользователь"}
                </span>
              )}
            </p>
            <p className="mt-1.5 whitespace-pre-line text-[15px] text-ink-900">{r.reason}</p>
            <div className="mt-1.5 space-y-0.5 text-sm text-ink-500">
              {r.listing && (
                <p>
                  Объявление:{" "}
                  <Link href={`/listing/${r.listing.slug}`} className="underline hover:text-brand-700">
                    {r.listing.title}
                  </Link>{" "}
                  ({r.listing.status})
                </p>
              )}
              {r.reportedUser && (
                <p>
                  Пользователь:{" "}
                  <Link href={`/user/${r.reportedUser.id}`} className="underline hover:text-brand-700">
                    {r.reportedUser.name}
                  </Link>
                  {r.reportedUser.blocked && " (заблокирован)"}
                </p>
              )}
              {r.status !== "OPEN" && (
                <p>
                  Итог: {r.status === "RESOLVED" ? "решено" : "отклонено"}
                  {r.resolution ? ` — ${r.resolution}` : ""}
                </p>
              )}
            </div>
          </div>
          {r.status === "OPEN" && <ReportActions reportId={r.id} />}
        </div>
      </li>
    );
  };

  return (
    <div>
      <h2 className="text-xl font-bold">Очередь: {open.length}</h2>
      {open.length === 0 ? (
        <p className="mt-3 text-[15px] text-ink-500">Открытых жалоб и заявок нет.</p>
      ) : (
        <ul className="mt-4 space-y-3">{open.map((r) => <Row key={r.id} r={r} />)}</ul>
      )}

      {closed.length > 0 && (
        <>
          <h2 className="mt-10 text-xl font-bold text-ink-500">Обработанные</h2>
          <ul className="mt-4 space-y-3 opacity-70">{closed.map((r) => <Row key={r.id} r={r} />)}</ul>
        </>
      )}
    </div>
  );
}
