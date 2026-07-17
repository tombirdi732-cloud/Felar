import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getActiveCities, getCategoriesTree, searchListings, type CatalogFilters as Filters } from "@/lib/listings";
import { ListingCard } from "./ListingCard";
import { CatalogFilters } from "./CatalogFilters";
import { Pagination } from "./Pagination";
import { EmptyState } from "./EmptyState";
import { IconSearch } from "./Icons";
import { plural } from "@/lib/format";
import Link from "next/link";

export type CatalogSearchParams = {
  q?: string;
  city?: string;
  priceMin?: string;
  priceMax?: string;
  verified?: string;
  sort?: string;
  page?: string;
};

export async function CatalogView({
  searchParams,
  categorySlug,
}: {
  searchParams: CatalogSearchParams;
  categorySlug?: string;
}) {
  const filters: Filters = {
    q: searchParams.q,
    categorySlug,
    city: searchParams.city,
    priceMin: searchParams.priceMin ? Number(searchParams.priceMin) : undefined,
    priceMax: searchParams.priceMax ? Number(searchParams.priceMax) : undefined,
    verifiedOnly: searchParams.verified === "1",
    sort: (searchParams.sort as Filters["sort"]) ?? "new",
    page: searchParams.page ? Number(searchParams.page) : 1,
  };

  const [result, categories, cities, user] = await Promise.all([
    searchListings(filters),
    getCategoriesTree(),
    getActiveCities(),
    getCurrentUser(),
  ]);

  const category = categorySlug
    ? await prisma.category.findUnique({ where: { slug: categorySlug }, include: { parent: true, children: { where: { active: true } } } })
    : null;

  const favoriteIds = user
    ? new Set(
        (
          await prisma.favorite.findMany({ where: { userId: user.id }, select: { listingId: true } })
        ).map((f) => f.listingId)
      )
    : new Set<string>();

  const title = searchParams.q
    ? `Поиск: «${searchParams.q}»`
    : category
      ? `${category.name} в аренду`
      : "Каталог инструмента и техники";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <nav className="text-sm text-ink-500" aria-label="Хлебные крошки">
        <Link href="/" className="hover:text-brand-700">Главная</Link>
        <span className="mx-1.5">/</span>
        <Link href="/catalog" className="hover:text-brand-700">Каталог</Link>
        {category?.parent && (
          <>
            <span className="mx-1.5">/</span>
            <Link href={`/catalog/${category.parent.slug}`} className="hover:text-brand-700">
              {category.parent.name}
            </Link>
          </>
        )}
        {category && (
          <>
            <span className="mx-1.5">/</span>
            <span className="text-ink-900">{category.name}</span>
          </>
        )}
      </nav>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="text-sm text-ink-500">
          {result.total} {plural(result.total, "объявление", "объявления", "объявлений")}
        </p>
      </div>

      {category && category.children.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {category.children.map((ch) => (
            <Link
              key={ch.id}
              href={`/catalog/${ch.slug}`}
              className="rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-sm font-medium text-ink-700 transition hover:border-brand-500 hover:text-brand-700"
            >
              {ch.name}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <CatalogFilters
            categories={categories.map((c) => ({
              slug: c.slug,
              name: c.name,
              children: c.children.map((ch) => ({ slug: ch.slug, name: ch.name })),
            }))}
            cities={cities}
            currentCategory={categorySlug}
          />
        </aside>

        <div>
          {result.items.length === 0 ? (
            <EmptyState
              icon={<IconSearch className="h-8 w-8" />}
              title="Ничего не нашлось"
              text="Попробуйте изменить запрос или сбросить фильтры. А если у вас есть такой инструмент — разместите объявление, его уже ищут."
              actionHref="/listing/new"
              actionLabel="Разместить объявление"
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {result.items.map((l) => (
                  <ListingCard key={l.id} listing={l} isFavorite={favoriteIds.has(l.id)} />
                ))}
              </div>
              <Pagination
                page={result.page}
                pages={result.pages}
                basePath={categorySlug ? `/catalog/${categorySlug}` : "/catalog"}
                searchParams={{
                  q: searchParams.q,
                  city: searchParams.city,
                  priceMin: searchParams.priceMin,
                  priceMax: searchParams.priceMax,
                  verified: searchParams.verified,
                  sort: searchParams.sort,
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
