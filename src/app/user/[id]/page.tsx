import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getUserRating, getRatingsForUsers } from "@/lib/rating";
import { formatDate, formatMonthYear, plural } from "@/lib/format";
import { ListingCard } from "@/components/ListingCard";
import { Rating, VerifiedBadge } from "@/components/Rating";
import { ReportButton } from "@/components/ReportButton";
import { IconPin, IconUser } from "@/components/Icons";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return {};
  return {
    title: `${user.name} — профиль арендодателя`,
    description: `Объявления и отзывы пользователя ${user.name} на Tom | СтройАренда.`,
  };
}

export default async function PublicProfilePage({ params }: Props) {
  const { id } = await params;
  const profile = await prisma.user.findUnique({ where: { id } });
  if (!profile || profile.blocked) notFound();

  const viewer = await getCurrentUser();

  const [rating, listings, reviews] = await Promise.all([
    getUserRating(profile.id),
    prisma.listing.findMany({
      where: { userId: profile.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: {
        photos: { orderBy: { sortOrder: "asc" }, take: 1 },
        user: { select: { id: true, name: true, docVerified: true } },
      },
    }),
    prisma.review.findMany({
      where: { targetId: profile.id, hidden: false },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    }),
  ]);

  const favoriteIds = viewer
    ? new Set(
        (
          await prisma.favorite.findMany({ where: { userId: viewer.id }, select: { listingId: true } })
        ).map((f) => f.listingId)
      )
    : new Set<string>();
  const ratings = await getRatingsForUsers([profile.id]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="card flex flex-wrap items-center gap-5 p-6">
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <span className="grid h-20 w-20 place-items-center rounded-full bg-ink-100 text-ink-500">
            <IconUser className="h-9 w-9" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
            {profile.name}
            {profile.docVerified && <VerifiedBadge />}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
            <Rating value={rating.avg} count={rating.count} size="md" />
            <span>На платформе с {formatMonthYear(profile.createdAt)}</span>
            {profile.city && (
              <span className="flex items-center gap-1"><IconPin className="h-4 w-4" />{profile.city}</span>
            )}
            {profile.phoneVerified && <span>Телефон подтверждён</span>}
          </div>
          {profile.about && <p className="mt-2 max-w-2xl text-[15px] text-ink-700">{profile.about}</p>}
        </div>
        {viewer && viewer.id !== profile.id && (
          <ReportButton userId={profile.id} authorized />
        )}
      </div>

      <section className="mt-8">
        <h2 className="text-xl font-bold">
          Активные объявления{" "}
          <span className="text-base font-medium text-ink-500">({listings.length})</span>
        </h2>
        {listings.length === 0 ? (
          <p className="mt-3 text-[15px] text-ink-500">Сейчас активных объявлений нет.</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {listings.map((l) => (
              <ListingCard
                key={l.id}
                listing={{ ...l, ownerRating: ratings.get(profile.id) ?? null }}
                isFavorite={favoriteIds.has(l.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold">
          Отзывы <span className="text-base font-medium text-ink-500">({rating.count})</span>
        </h2>
        {reviews.length === 0 ? (
          <p className="mt-3 text-[15px] text-ink-500">
            Отзывов пока нет — они появляются после реальных аренд.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {reviews.map((r) => (
              <li key={r.id} className="card p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{r.author.name}</span>
                  <Rating value={r.rating} />
                </div>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-700">{r.text}</p>
                <p className="mt-2 text-xs text-ink-500">{formatDate(r.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
