import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatPrice, plural, timeAgo } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import { IconBox, IconPlus } from "@/components/Icons";
import { NoPhoto } from "@/components/NoPhoto";
import { ListingOwnerActions } from "@/components/ListingOwnerActions";

export const metadata: Metadata = {
  title: "Мои объявления",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

const statusLabel: Record<string, { text: string; cls: string }> = {
  ACTIVE: { text: "Активно", cls: "bg-emerald-50 text-emerald-700" },
  RENTED: { text: "В аренде", cls: "bg-sky-50 text-sky-700" },
  ARCHIVED: { text: "В архиве", cls: "bg-ink-100 text-ink-500" },
  BLOCKED: { text: "Заблокировано", cls: "bg-red-50 text-red-700" },
};

export default async function MyListingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const listings = await prisma.listing.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { photos: { orderBy: { sortOrder: "asc" }, take: 1 } },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Мои объявления</h1>
        <Link href="/listing/new" className="btn-primary">
          <IconPlus className="h-5 w-5" /> Разместить
        </Link>
      </div>

      {listings.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<IconBox className="h-8 w-8" />}
            title="У вас пока нет объявлений"
            text="Сдайте в аренду инструмент, который простаивает: дрель, мойку, бетономешалку — что угодно из вашей мастерской."
            actionHref="/listing/new"
            actionLabel="Разместить первое объявление"
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {listings.map((l) => {
            const status = statusLabel[l.status];
            return (
              <li key={l.id} className="card flex flex-wrap items-center gap-4 p-4">
                <Link href={`/listing/${l.slug}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-ink-100">
                  {l.photos[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.photos[0].url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <NoPhoto />
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/listing/${l.slug}`} className="line-clamp-1 font-semibold hover:text-brand-700">
                    {l.title}
                  </Link>
                  <p className="mt-0.5 text-sm text-ink-500">
                    {formatPrice(l.pricePerDay)}/сутки · {l.views}{" "}
                    {plural(l.views, "просмотр", "просмотра", "просмотров")} · {timeAgo(l.createdAt)}
                  </p>
                  <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.cls}`}>
                    {status.text}
                  </span>
                </div>
                <ListingOwnerActions listingId={l.id} slug={l.slug} status={l.status} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
