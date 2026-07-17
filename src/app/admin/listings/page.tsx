import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDateTime, formatPrice } from "@/lib/format";
import { ListingModerationActions } from "@/components/AdminActions";

export default async function AdminListingsPage() {
  const listings = await prisma.listing.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { id: true, name: true, blocked: true } },
      _count: { select: { reports: { where: { status: "OPEN" } } } },
    },
  });

  return (
    <div>
      <h2 className="text-xl font-bold">Последние объявления</h2>
      {listings.length === 0 ? (
        <p className="mt-3 text-[15px] text-ink-500">Объявлений пока нет.</p>
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-100 text-xs uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">Объявление</th>
                <th className="px-4 py-3">Владелец</th>
                <th className="px-4 py-3">Цена/сутки</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Жалобы</th>
                <th className="px-4 py-3">Создано</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.id} className="border-b border-ink-100 last:border-0">
                  <td className="max-w-64 px-4 py-3">
                    <Link href={`/listing/${l.slug}`} className="line-clamp-1 font-medium hover:text-brand-700">
                      {l.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/user/${l.user.id}`} className="hover:text-brand-700">
                      {l.user.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatPrice(l.pricePerDay)}</td>
                  <td className="px-4 py-3">{l.status}</td>
                  <td className="px-4 py-3">
                    {l._count.reports > 0 ? (
                      <span className="font-bold text-red-600">{l._count.reports}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-ink-500">{formatDateTime(l.createdAt)}</td>
                  <td className="px-4 py-3">
                    <ListingModerationActions listingId={l.id} blocked={l.status === "BLOCKED"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
