"use client";

import { useState } from "react";
import { NoPhoto } from "./NoPhoto";

export function Gallery({ photos, title }: { photos: { id: string; url: string }[]; title: string }) {
  const [active, setActive] = useState(0);

  if (photos.length === 0) {
    return (
      <div className="aspect-[4/3] overflow-hidden rounded-2xl">
        <NoPhoto />
      </div>
    );
  }

  return (
    <div>
      <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-ink-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photos[active].url}
          alt={`${title} — фото ${active + 1}`}
          className="h-full w-full object-cover"
        />
      </div>
      {photos.length > 1 && (
        <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-8">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActive(i)}
              className={`aspect-square overflow-hidden rounded-lg border-2 transition ${
                i === active ? "border-brand-600" : "border-transparent opacity-70 hover:opacity-100"
              }`}
              aria-label={`Фото ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
