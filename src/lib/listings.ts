import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getRatingsForUsers } from "./rating";

export const PAGE_SIZE = 24;

export type CatalogFilters = {
  q?: string;
  categorySlug?: string;
  city?: string;
  priceMin?: number;
  priceMax?: number;
  verifiedOnly?: boolean;
  sort?: "new" | "price_asc" | "price_desc" | "rating";
  page?: number;
};

export type CatalogListing = Awaited<ReturnType<typeof searchListings>>["items"][number];

export async function searchListings(filters: CatalogFilters) {
  const where: Prisma.ListingWhereInput = { status: "ACTIVE", user: { blocked: false } };

  if (filters.q) {
    const q = filters.q.trim();
    // SQLite LIKE регистрозависим для кириллицы, поэтому ищем по вариантам
    // регистра; на PostgreSQL заменяется на mode: "insensitive".
    const lower = q.toLowerCase();
    const variants = [
      ...new Set([q, lower, q.toUpperCase(), lower.charAt(0).toUpperCase() + lower.slice(1)]),
    ];
    where.OR = variants.flatMap((v) => [
      { title: { contains: v } },
      { description: { contains: v } },
    ]);
  }

  if (filters.categorySlug) {
    const category = await prisma.category.findUnique({
      where: { slug: filters.categorySlug },
      include: { children: { select: { id: true } } },
    });
    if (category) {
      const ids = [category.id, ...category.children.map((c) => c.id)];
      where.categoryId = { in: ids };
    }
  }

  if (filters.city) where.city = { contains: filters.city.trim() };
  if (filters.priceMin != null || filters.priceMax != null) {
    where.pricePerDay = {
      ...(filters.priceMin != null ? { gte: filters.priceMin } : {}),
      ...(filters.priceMax != null ? { lte: filters.priceMax } : {}),
    };
  }
  if (filters.verifiedOnly) where.user = { blocked: false, docVerified: true };

  let orderBy: Prisma.ListingOrderByWithRelationInput[] = [];
  switch (filters.sort) {
    case "price_asc":
      orderBy = [{ pricePerDay: "asc" }];
      break;
    case "price_desc":
      orderBy = [{ pricePerDay: "desc" }];
      break;
    default:
      orderBy = [{ createdAt: "desc" }];
  }
  // Платно поднятые объявления всегда выше (ТЗ п. 6)
  const now = new Date();

  const page = Math.max(1, filters.page ?? 1);
  const [total, rows] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        photos: { orderBy: { sortOrder: "asc" }, take: 1 },
        user: { select: { id: true, name: true, docVerified: true } },
        category: { select: { slug: true, name: true } },
      },
    }),
  ]);

  // Поднятые — в начало страницы, затем рейтинг владельца при sort=rating
  const ratings = await getRatingsForUsers(rows.map((r) => r.user.id));
  let items = rows.map((r) => ({
    ...r,
    ownerRating: ratings.get(r.user.id) ?? null,
    promoted: r.promotedUntil != null && r.promotedUntil > now,
    highlighted: r.highlightedUntil != null && r.highlightedUntil > now,
  }));

  if (filters.sort === "rating") {
    items = items.sort((a, b) => (b.ownerRating?.avg ?? 0) - (a.ownerRating?.avg ?? 0));
  }
  items = items.sort((a, b) => Number(b.promoted) - Number(a.promoted));

  return { items, total, page, pages: Math.ceil(total / PAGE_SIZE) };
}

/** Список городов, в которых есть активные объявления (для фильтра). */
export async function getActiveCities(): Promise<string[]> {
  const rows = await prisma.listing.findMany({
    where: { status: "ACTIVE" },
    select: { city: true },
    distinct: ["city"],
    orderBy: { city: "asc" },
    take: 200,
  });
  return rows.map((r) => r.city);
}

export async function getCategoriesTree() {
  const [categories, counts] = await Promise.all([
    prisma.category.findMany({
      where: { parentId: null, active: true },
      orderBy: { sortOrder: "asc" },
      include: {
        children: { where: { active: true }, orderBy: { sortOrder: "asc" } },
      },
    }),
    prisma.listing.groupBy({
      by: ["categoryId"],
      where: { status: "ACTIVE" },
      _count: true,
    }),
  ]);
  const byCategory = new Map(counts.map((c) => [c.categoryId, c._count]));
  // Счётчик корневой категории включает объявления её подкатегорий
  return categories.map((c) => ({
    ...c,
    _count: {
      listings:
        (byCategory.get(c.id) ?? 0) +
        c.children.reduce((sum, ch) => sum + (byCategory.get(ch.id) ?? 0), 0),
    },
  }));
}
