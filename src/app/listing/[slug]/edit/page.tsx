import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCategoriesTree } from "@/lib/listings";
import { updateListing } from "@/actions/listing";
import { ListingForm } from "@/components/ListingForm";

export const metadata: Metadata = {
  title: "Редактирование объявления",
  robots: { index: false },
};

export default async function EditListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const listing = await prisma.listing.findUnique({
    where: { slug },
    include: { photos: { orderBy: { sortOrder: "asc" } } },
  });
  if (!listing || (listing.userId !== user.id && user.role !== "ADMIN")) notFound();

  const categories = await getCategoriesTree();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Редактирование объявления</h1>
      <div className="mt-6">
        <ListingForm
          action={updateListing.bind(null, listing.id)}
          categories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            children: c.children.map((ch) => ({ id: ch.id, name: ch.name })),
          }))}
          values={listing}
          existingPhotos={listing.photos}
          submitLabel="Сохранить изменения"
        />
      </div>
    </div>
  );
}
