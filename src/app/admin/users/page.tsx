import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { UserModerationActions } from "@/components/AdminActions";
import { VerifiedBadge } from "@/components/Rating";

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { _count: { select: { listings: true, reportsAgainst: { where: { status: "OPEN" } } } } },
  });

  return (
    <div>
      <h2 className="text-xl font-bold">Пользователи ({users.length})</h2>
      {users.length === 0 ? (
        <p className="mt-3 text-[15px] text-ink-500">Пользователей пока нет.</p>
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-100 text-xs uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">Имя</th>
                <th className="px-4 py-3">Контакты</th>
                <th className="px-4 py-3">Объявл.</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Регистрация</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-ink-100 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/user/${u.id}`} className="font-medium hover:text-brand-700">
                      {u.name}
                    </Link>
                    {u.role === "ADMIN" && (
                      <span className="ml-2 rounded-full bg-ink-900 px-2 py-0.5 text-[11px] font-bold text-white">админ</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-500">
                    {u.phone ? formatPhone(u.phone) : u.vkId ? `VK id${u.vkId}` : "—"}
                  </td>
                  <td className="px-4 py-3">{u._count.listings}</td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {u.blocked && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">заблокирован</span>
                      )}
                      {u.docVerified && <VerifiedBadge compact />}
                      {u.docRequested && !u.docVerified && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">заявка</span>
                      )}
                      {u._count.reportsAgainst > 0 && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                          жалоб: {u._count.reportsAgainst}
                        </span>
                      )}
                      {!u.blocked && !u.docVerified && !u.docRequested && u._count.reportsAgainst === 0 && "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-ink-500">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-3">
                    {u.role !== "ADMIN" && (
                      <UserModerationActions
                        userId={u.id}
                        blocked={u.blocked}
                        docVerified={u.docVerified}
                        docRequested={u.docRequested}
                      />
                    )}
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
