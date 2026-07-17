import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCategoriesTree } from "@/lib/listings";
import { generateCaptcha } from "@/lib/captcha";
import { createListing } from "@/actions/listing";
import { ListingForm } from "@/components/ListingForm";

export const metadata: Metadata = {
  title: "Разместить объявление",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function NewListingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth?next=/listing/new");

  const categories = await getCategoriesTree();
  const captcha = generateCaptcha();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Новое объявление</h1>
      <p className="mt-2 text-[15px] text-ink-500">
        Размещение бесплатное. Объявление увидят все посетители каталога.
      </p>

      {!user.phoneVerified && (
        <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-[15px] text-amber-800">
          Для размещения объявлений нужно подтвердить номер телефона —{" "}
          <Link href="/auth" className="font-semibold underline">подтвердить сейчас</Link>.
        </div>
      )}

      <div className="mt-6">
        <ListingForm
          action={createListing}
          categories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            children: c.children.map((ch) => ({ id: ch.id, name: ch.name })),
          }))}
          captcha={captcha}
          submitLabel="Опубликовать объявление"
        />
      </div>
    </div>
  );
}
