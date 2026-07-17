import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getRatingsForUsers } from "@/lib/rating";
import { ListingCard } from "@/components/ListingCard";
import { EmptyState } from "@/components/EmptyState";
import { IconHeart } from "@/components/Icons";

export const metadata: Metadata = {
  title: "Избранное",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const favorites = await prisma.favorite.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      listing: {
        include: {
          photos: { orderBy: { sortOrder: "asc" }, take: 1 },
          user: { select: { id: true, name: true, docVerified: true } },
        },
      },
    },
  });

  const visible = favorites.filter((f) => f.listing.status !== "BLOCKED");
  const ratings = await getRatingsForUsers(visible.map((f) => f.listing.user.id));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Избранное</h1>
      {visible.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<IconHeart className="h-8 w-8" />}
            title="В избранном пусто"
            text="Сохраняйте понравившиеся объявления сердечком — они соберутся здесь, чтобы не потерять."
            actionHref="/catalog"
            actionLabel="Перейти в каталог"
          />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {visible.map((f) => (
            <ListingCard
              key={f.listingId}
              listing={{ ...f.listing, ownerRating: ratings.get(f.listing.user.id) ?? null }}
              isFavorite
            />
          ))}
        </div>
      )}
    </div>
  );
}
