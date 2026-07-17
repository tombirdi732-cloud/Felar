"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { IconClose, IconFilter } from "./Icons";

type CategoryOption = {
  slug: string;
  name: string;
  children: { slug: string; name: string }[];
};

export function CatalogFilters({
  categories,
  cities,
  currentCategory,
}: {
  categories: CategoryOption[];
  cities: string[];
  currentCategory?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  const apply = (formData: FormData) => {
    const next = new URLSearchParams();
    const q = params.get("q");
    if (q) next.set("q", q);
    for (const key of ["city", "priceMin", "priceMax", "sort"]) {
      const v = String(formData.get(key) ?? "").trim();
      if (v) next.set(key, v);
    }
    if (formData.get("verified")) next.set("verified", "1");
    const category = String(formData.get("category") ?? "");
    setOpen(false);
    router.push(category ? `/catalog/${category}?${next}` : `/catalog?${next}`);
  };

  const hasActive =
    Boolean(params.get("city") || params.get("priceMin") || params.get("priceMax") || params.get("verified"));

  const form = (
    <form action={apply} className="space-y-4">
      <div>
        <label className="label" htmlFor="f-category">Категория</label>
        <select id="f-category" name="category" defaultValue={currentCategory ?? ""} className="field">
          <option value="">Все категории</option>
          {categories.map((c) => (
            <optgroup key={c.slug} label={c.name}>
              <option value={c.slug}>{c.name} — все</option>
              {c.children.map((ch) => (
                <option key={ch.slug} value={ch.slug}>{ch.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="f-city">Город</label>
        <input
          id="f-city"
          name="city"
          list="cities"
          defaultValue={params.get("city") ?? ""}
          placeholder="Например, Москва"
          className="field"
        />
        <datalist id="cities">
          {cities.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      <div>
        <span className="label">Цена за сутки, ₽</span>
        <div className="flex gap-2">
          <input name="priceMin" type="number" min={0} placeholder="от" defaultValue={params.get("priceMin") ?? ""} className="field" />
          <input name="priceMax" type="number" min={0} placeholder="до" defaultValue={params.get("priceMax") ?? ""} className="field" />
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 text-[15px] text-ink-700">
        <input
          type="checkbox"
          name="verified"
          defaultChecked={params.get("verified") === "1"}
          className="h-4.5 w-4.5 accent-brand-600"
        />
        Только верифицированные владельцы
      </label>

      <div>
        <label className="label" htmlFor="f-sort">Сортировка</label>
        <select id="f-sort" name="sort" defaultValue={params.get("sort") ?? "new"} className="field">
          <option value="new">Сначала новые</option>
          <option value="price_asc">Дешевле</option>
          <option value="price_desc">Дороже</option>
          <option value="rating">По рейтингу владельца</option>
        </select>
      </div>

      <div className="flex gap-2 pt-1">
        <button type="submit" className="btn-primary flex-1">Показать</button>
        {hasActive && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setOpen(false);
              router.push(currentCategory ? `/catalog/${currentCategory}` : "/catalog");
            }}
          >
            Сбросить
          </button>
        )}
      </div>
    </form>
  );

  return (
    <>
      {/* Мобильная кнопка фильтров */}
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary w-full lg:hidden">
        <IconFilter className="h-5 w-5" />
        Фильтры{hasActive ? " •" : ""}
      </button>

      {/* Десктоп: сайдбар */}
      <div className="card hidden p-5 lg:block">
        <h2 className="mb-4 text-lg font-bold">Фильтры</h2>
        {form}
      </div>

      {/* Мобильный слой */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Фильтры</h2>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost" aria-label="Закрыть">
                <IconClose className="h-5 w-5" />
              </button>
            </div>
            {form}
          </div>
        </div>
      )}
    </>
  );
}
