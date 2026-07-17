"use client";

import { useOptimistic, useTransition } from "react";
import { usePathname } from "next/navigation";
import { toggleFavorite } from "@/actions/favorite";
import { IconHeart } from "./Icons";

export function FavoriteButton({
  listingId,
  initialFavorite,
  large = false,
}: {
  listingId: string;
  initialFavorite: boolean;
  large?: boolean;
}) {
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [favorite, setOptimistic] = useOptimistic(initialFavorite);

  const onClick = () => {
    startTransition(async () => {
      setOptimistic(!favorite);
      await toggleFavorite(listingId, pathname);
    });
  };

  if (large) {
    return (
      <button type="button" onClick={onClick} disabled={isPending} className="btn-secondary w-full">
        <IconHeart
          className={`h-5 w-5 ${favorite ? "fill-brand-600 stroke-brand-600" : ""}`}
        />
        {favorite ? "В избранном" : "В избранное"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      aria-label={favorite ? "Убрать из избранного" : "Добавить в избранное"}
      className="grid h-9 w-9 place-items-center rounded-full bg-white/90 text-ink-700 shadow-card transition hover:scale-105 hover:text-brand-600"
    >
      <IconHeart className={`h-5 w-5 ${favorite ? "fill-brand-600 stroke-brand-600" : ""}`} />
    </button>
  );
}
