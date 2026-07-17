import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CatalogView, type CatalogSearchParams } from "@/components/CatalogView";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<CatalogSearchParams>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) return {};
  return {
    title: `${category.name} в аренду от частных лиц`,
    description: `${category.name} в аренду рядом с вами: цены за сутки, залог, чат с владельцем. Аренда между частными лицами.`,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category || !category.active) notFound();
  return <CatalogView searchParams={await searchParams} categorySlug={slug} />;
}
