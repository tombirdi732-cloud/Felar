import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import { IconChat } from "@/components/Icons";
import { NoPhoto } from "@/components/NoPhoto";

export const metadata: Metadata = {
  title: "Сообщения",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ renterId: user.id }, { listing: { userId: user.id } }] },
    orderBy: { updatedAt: "desc" },
    include: {
      listing: {
        include: {
          photos: { orderBy: { sortOrder: "asc" }, take: 1 },
          user: { select: { id: true, name: true } },
        },
      },
      renter: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: {
        select: {
          messages: { where: { readAt: null, senderId: { not: user.id } } },
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Сообщения</h1>

      {conversations.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<IconChat className="h-8 w-8" />}
            title="Диалогов пока нет"
            text="Найдите нужный инструмент в каталоге и напишите владельцу — переписка появится здесь."
            actionHref="/catalog"
            actionLabel="Перейти в каталог"
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {conversations.map((c) => {
            const companion = c.renterId === user.id ? c.listing.user : c.renter;
            const last = c.messages[0];
            const unread = c._count.messages;
            return (
              <li key={c.id}>
                <Link
                  href={`/messages/${c.id}`}
                  className="card flex items-center gap-4 p-3.5 transition hover:shadow-card-hover"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-ink-100">
                    {c.listing.photos[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.listing.photos[0].url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <NoPhoto />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate font-semibold">{companion.name}</p>
                      {last && (
                        <span className="shrink-0 text-xs text-ink-500">{formatDateTime(last.createdAt)}</span>
                      )}
                    </div>
                    <p className="truncate text-sm text-ink-500">{c.listing.title}</p>
                    <p className="mt-0.5 truncate text-sm text-ink-700">
                      {last ? (last.text ?? "📷 Фото") : "Диалог создан"}
                    </p>
                  </div>
                  {unread > 0 && (
                    <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-brand-600 px-1.5 text-xs font-bold text-white">
                      {unread}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
