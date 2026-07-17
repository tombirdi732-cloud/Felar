"use client";

import Link from "next/link";
import { useTransition } from "react";
import { deleteListing, promoteListing, setListingStatus } from "@/actions/listing";

export function ListingOwnerActions({
  listingId,
  slug,
  status,
}: {
  listingId: string;
  slug: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<unknown>) => startTransition(async () => { await fn(); });

  if (status === "BLOCKED") {
    return (
      <p className="w-full text-sm text-red-600 sm:w-auto">
        Заблокировано модератором — редактирование недоступно.
      </p>
    );
  }

  return (
    <div className="flex w-full flex-wrap gap-2 sm:w-auto" aria-busy={pending}>
      <Link href={`/listing/${slug}/edit`} className="btn-secondary !px-3.5 !py-2 text-sm">
        Изменить
      </Link>
      {status === "ACTIVE" && (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setListingStatus(listingId, "RENTED"))}
            className="btn-secondary !px-3.5 !py-2 text-sm"
          >
            В аренде
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setListingStatus(listingId, "ARCHIVED"))}
            className="btn-secondary !px-3.5 !py-2 text-sm"
          >
            Снять
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              const res = await promoteListing(listingId);
              if (res?.error) alert(res.error);
            }}
            className="btn-secondary !px-3.5 !py-2 text-sm text-brand-700"
            title="Платное поднятие в результатах поиска"
          >
            Поднять ↑
          </button>
        </>
      )}
      {(status === "RENTED" || status === "ARCHIVED") && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setListingStatus(listingId, "ACTIVE"))}
          className="btn-secondary !px-3.5 !py-2 text-sm"
        >
          Активировать
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm("Удалить объявление навсегда? Действие необратимо.")) {
            run(() => deleteListing(listingId));
          }
        }}
        className="btn-secondary !px-3.5 !py-2 text-sm text-red-600"
      >
        Удалить
      </button>
    </div>
  );
}
