import type { Metadata } from "next";
import { CatalogView, type CatalogSearchParams } from "@/components/CatalogView";

export const metadata: Metadata = {
  title: "Каталог инструмента и техники в аренду",
  description:
    "Электроинструмент, строительная и садовая техника в аренду от частных лиц. Поиск по городу, цене и категории.",
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  return <CatalogView searchParams={await searchParams} />;
}
