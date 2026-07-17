import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getUserRating } from "@/lib/rating";
import { formatDate, formatMonthYear, formatPrice, plural } from "@/lib/format";
import { startConversation } from "@/actions/chat";
import { Gallery } from "@/components/Gallery";
import { FavoriteButton } from "@/components/FavoriteButton";
import { ReportButton } from "@/components/ReportButton";
import { Rating, VerifiedBadge } from "@/components/Rating";
import { IconChat, IconPin, IconShield, IconUser } from "@/components/Icons";

type Props = { params: Promise<{ slug: string }> };

async function getListing(slug: string) {
  return prisma.listing.findUnique({
    where: { slug },
    include: {
      photos: { orderBy: { sortOrder: "asc" } },
      category: { include: { parent: true } },
      user: true,
    },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getListing(slug);
  if (!listing) return {};
  const description = `${listing.title} в аренду — ${formatPrice(listing.pricePerDay)}/сутки, залог ${
    listing.deposit > 0 ? formatPrice(listing.deposit) : "не требуется"
  }. ${listing.city}. Аренда от частного лица на Felar.`;
  return {
    title: `${listing.title} — аренда в ${listing.city}`,
    description,
    openGraph: {
      title: listing.title,
      description,
      images: listing.photos[0] ? [listing.photos[0].url] : undefined,
    },
  };
}

export default async function ListingPage({ params }: Props) {
  const { slug } = await params;
  const listing = await getListing(slug);
  if (!listing) notFound();

  const user = await getCurrentUser();
  const isOwner = user?.id === listing.user.id;
  const visible = listing.status === "ACTIVE" || listing.status === "RENTED";
  if (!visible && !isOwner && user?.role !== "ADMIN") notFound();

  const [rating, ownerListingsCount, reviews, favorite] = await Promise.all([
    getUserRating(listing.user.id),
    prisma.listing.count({ where: { userId: listing.user.id, status: "ACTIVE" } }),
    prisma.review.findMany({
      where: {
        targetId: listing.user.id,
        hidden: false,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    }),
    user
      ? prisma.favorite.findUnique({
          where: { userId_listingId: { userId: user.id, listingId: listing.id } },
        })
      : null,
  ]);

  // счётчик просмотров (без учёта владельца)
  if (!isOwner) {
    await prisma.listing.update({ where: { id: listing.id }, data: { views: { increment: 1 } } }).catch(() => {});
  }

  const startChat = startConversation.bind(null, listing.id);
  const mapSrc =
    listing.lat != null && listing.lng != null
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${listing.lng - 0.02},${listing.lat - 0.012},${listing.lng + 0.02},${listing.lat + 0.012}&layer=mapnik&marker=${listing.lat},${listing.lng}`
      : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <nav className="text-sm text-ink-500" aria-label="Хлебные крошки">
        <Link href="/" className="hover:text-brand-700">Главная</Link>
        <span className="mx-1.5">/</span>
        <Link href="/catalog" className="hover:text-brand-700">Каталог</Link>
        {listing.category.parent && (
          <>
            <span className="mx-1.5">/</span>
            <Link href={`/catalog/${listing.category.parent.slug}`} className="hover:text-brand-700">
              {listing.category.parent.name}
            </Link>
          </>
        )}
        <span className="mx-1.5">/</span>
        <Link href={`/catalog/${listing.category.slug}`} className="hover:text-brand-700">
          {listing.category.name}
        </Link>
      </nav>

      {listing.status !== "ACTIVE" && (
        <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-[15px] text-amber-800">
          {listing.status === "RENTED" && "Сейчас инструмент в аренде — владелец отметит, когда он освободится."}
          {listing.status === "ARCHIVED" && "Объявление снято с публикации."}
          {listing.status === "BLOCKED" && "Объявление заблокировано модератором."}
        </div>
      )}

      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* Левая колонка */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{listing.title}</h1>
          <p className="mt-1.5 flex items-center gap-1.5 text-[15px] text-ink-500">
            <IconPin className="h-4.5 w-4.5" />
            {listing.city}
            {listing.district ? `, ${listing.district}` : ""}
            <span className="mx-1">·</span>
            {formatDate(listing.createdAt)}
            <span className="mx-1">·</span>
            {listing.views} {plural(listing.views, "просмотр", "просмотра", "просмотров")}
          </p>

          <div className="mt-5">
            <Gallery photos={listing.photos} title={listing.title} />
          </div>

          <section className="mt-8">
            <h2 className="text-xl font-bold">Описание</h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed text-ink-700">{listing.description}</p>
          </section>

          {listing.conditions && (
            <section className="mt-8">
              <h2 className="text-xl font-bold">Условия аренды</h2>
              <p className="mt-3 whitespace-pre-line leading-relaxed text-ink-700">{listing.conditions}</p>
            </section>
          )}

          <section className="mt-8">
            <h2 className="text-xl font-bold">Расположение</h2>
            <p className="mt-2 text-[15px] text-ink-500">
              Точка примерная — точный адрес владелец сообщит в чате после договорённости.
            </p>
            {mapSrc ? (
              <iframe
                src={mapSrc}
                className="mt-3 h-72 w-full rounded-2xl border border-ink-100"
                loading="lazy"
                title="Карта с примерным расположением"
              />
            ) : (
              <div className="mt-3 flex h-40 items-center justify-center gap-2 rounded-2xl bg-ink-100 text-ink-500">
                <IconPin className="h-5 w-5" />
                {listing.city}
                {listing.district ? `, ${listing.district}` : ""}
              </div>
            )}
          </section>

          {/* Отзывы об арендодателе */}
          <section className="mt-8">
            <h2 className="text-xl font-bold">
              Отзывы об арендодателе{" "}
              {rating.count > 0 && (
                <span className="text-base font-medium text-ink-500">
                  {rating.avg} · {rating.count} {plural(rating.count, "отзыв", "отзыва", "отзывов")}
                </span>
              )}
            </h2>
            {reviews.length === 0 ? (
              <p className="mt-3 text-[15px] text-ink-500">
                Отзывов пока нет. Они появляются после реальных аренд — оставить отзыв могут
                только участники переписки по объявлению.
              </p>
            ) : (
              <ul className="mt-4 space-y-4">
                {reviews.map((r) => (
                  <li key={r.id} className="card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        {r.author.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.author.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <span className="grid h-8 w-8 place-items-center rounded-full bg-ink-100 text-ink-500">
                            <IconUser className="h-4 w-4" />
                          </span>
                        )}
                        <Link href={`/user/${r.author.id}`} className="font-medium hover:text-brand-700">
                          {r.author.name}
                        </Link>
                      </div>
                      <Rating value={r.rating} />
                    </div>
                    <p className="mt-2.5 text-[15px] leading-relaxed text-ink-700">{r.text}</p>
                    <p className="mt-2 text-xs text-ink-500">{formatDate(r.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Правая колонка */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="card p-5">
            <p className="text-3xl font-extrabold">
              {formatPrice(listing.pricePerDay)}
              <span className="text-base font-medium text-ink-500"> / сутки</span>
            </p>
            {(listing.priceWeek || listing.priceMonth) && (
              <div className="mt-2 space-y-1 text-[15px] text-ink-700">
                {listing.priceWeek && <p>Неделя: <b>{formatPrice(listing.priceWeek)}</b></p>}
                {listing.priceMonth && <p>Месяц: <b>{formatPrice(listing.priceMonth)}</b></p>}
              </div>
            )}
            <p className="mt-3 flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2.5 text-[15px] text-ink-700">
              <IconShield className="h-5 w-5 shrink-0 text-brand-600" />
              Залог: <b>{listing.deposit > 0 ? formatPrice(listing.deposit) : "не требуется"}</b>
            </p>

            {isOwner ? (
              <div className="mt-4 space-y-2">
                <Link href={`/listing/${listing.slug}/edit`} className="btn-primary w-full">
                  Редактировать
                </Link>
                <Link href="/profile/listings" className="btn-secondary w-full">
                  Мои объявления
                </Link>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {user ? (
                  <form action={startChat}>
                    <button type="submit" className="btn-primary w-full">
                      <IconChat className="h-5 w-5" /> Написать владельцу
                    </button>
                  </form>
                ) : (
                  <Link href="/auth" className="btn-primary w-full">
                    <IconChat className="h-5 w-5" /> Войти и написать
                  </Link>
                )}
                <FavoriteButton listingId={listing.id} initialFavorite={Boolean(favorite)} large />
              </div>
            )}
            <p className="mt-3 text-xs leading-relaxed text-ink-500">
              Оплата и залог передаются лично при встрече. Платформа не участвует в расчётах.
            </p>
          </div>

          {/* Владелец */}
          <div className="card p-5">
            <Link href={`/user/${listing.user.id}`} className="flex items-center gap-3">
              {listing.user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={listing.user.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <span className="grid h-14 w-14 place-items-center rounded-full bg-ink-100 text-ink-500">
                  <IconUser className="h-6 w-6" />
                </span>
              )}
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-bold">
                  <span className="truncate">{listing.user.name}</span>
                  {listing.user.docVerified && <VerifiedBadge compact />}
                </p>
                <Rating value={rating.avg} count={rating.count} />
              </div>
            </Link>
            <div className="mt-3 space-y-1 border-t border-ink-100 pt-3 text-sm text-ink-500">
              <p>На Felar с {formatMonthYear(listing.user.createdAt)}</p>
              <p>
                {ownerListingsCount} {plural(ownerListingsCount, "активное объявление", "активных объявления", "активных объявлений")}
              </p>
              {listing.user.phoneVerified && <p>Телефон подтверждён</p>}
            </div>
          </div>

          {!isOwner && (
            <div className="px-1">
              <ReportButton listingId={listing.id} authorized={Boolean(user)} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
