import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

/** Индексация карточек и категорий поисковиками (ТЗ п. 7, SEO). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, listings] = await Promise.all([
    prisma.category.findMany({ where: { active: true }, select: { slug: true } }),
    prisma.listing.findMany({
      where: { status: "ACTIVE" },
      select: { slug: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
  ]);

  return [
    { url: siteUrl, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/catalog`, changeFrequency: "hourly", priority: 0.9 },
    ...categories.map((c) => ({
      url: `${siteUrl}/catalog/${c.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...listings.map((l) => ({
      url: `${siteUrl}/listing/${l.slug}`,
      lastModified: l.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
