import Link from "next/link";
import { formatPrice, timeAgo } from "@/lib/format";
import { IconPin } from "./Icons";
import { Rating, VerifiedBadge } from "./Rating";
import { FavoriteButton } from "./FavoriteButton";
import { NoPhoto } from "./NoPhoto";

export type ListingCardData = {
  id: string;
  slug: string;
  title: string;
  pricePerDay: number;
  deposit: number;
  city: string;
  district: string | null;
  createdAt: Date;
  status?: string;
  photos: { url: string }[];
  user: { id: string; name: string; docVerified: boolean };
  ownerRating?: { avg: number; count: number } | null;
  promoted?: boolean;
  highlighted?: boolean;
};

export function ListingCard({
  listing,
  isFavorite,
  showFavorite = true,
}: {
  listing: ListingCardData;
  isFavorite?: boolean;
  showFavorite?: boolean;
}) {
  const photo = listing.photos[0];
  return (
    <article
      className={`card group relative overflow-hidden transition hover:shadow-card-hover ${
        listing.highlighted ? "ring-2 ring-brand-400" : ""
      }`}
    >
      <Link href={`/listing/${listing.slug}`} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-ink-100">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo.url}
              alt={listing.title}
              loading="lazy"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <NoPhoto />
          )}
          {listing.promoted && (
            <span className="absolute left-2 top-2 rounded-lg bg-brand-500/95 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-ink-900">
              Продвинуто
            </span>
          )}
          {listing.status === "RENTED" && (
            <span className="absolute left-2 bottom-2 rounded-lg bg-ink-900/80 px-2 py-1 text-[11px] font-bold text-white">
              Сейчас в аренде
            </span>
          )}
        </div>
        <div className="p-3.5">
          <p className="text-lg font-bold text-ink-900">
            {formatPrice(listing.pricePerDay)}
            <span className="text-sm font-medium text-ink-500"> / сутки</span>
          </p>
          <h3 className="mt-0.5 line-clamp-2 text-[15px] font-medium leading-snug text-ink-900 group-hover:text-brand-700">
            {listing.title}
          </h3>
          <p className="mt-1 text-sm text-ink-500">
            Залог: {listing.deposit > 0 ? formatPrice(listing.deposit) : "не требуется"}
          </p>
          <div className="mt-2 flex items-center gap-1 text-sm text-ink-500">
            <IconPin className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {listing.city}
              {listing.district ? `, ${listing.district}` : ""}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-ink-100 pt-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm text-ink-700">{listing.user.name}</span>
              {listing.user.docVerified && <VerifiedBadge compact />}
            </div>
            {listing.ownerRating ? (
              <Rating value={listing.ownerRating.avg} />
            ) : (
              <span className="whitespace-nowrap text-xs text-ink-500">{timeAgo(listing.createdAt)}</span>
            )}
          </div>
        </div>
      </Link>
      {showFavorite && (
        <div className="absolute right-2 top-2">
          <FavoriteButton listingId={listing.id} initialFavorite={Boolean(isFavorite)} />
        </div>
      )}
    </article>
  );
}
