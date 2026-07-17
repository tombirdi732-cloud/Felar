import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { Rating } from "@/components/Rating";
import { EmptyState } from "@/components/EmptyState";
import { IconStar } from "@/components/Icons";

export const metadata: Metadata = {
  title: "Мои отзывы",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function MyReviewsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const [received, written] = await Promise.all([
    prisma.review.findMany({
      where: { targetId: user.id, hidden: false },
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: { id: true, name: true } },
        conversation: { include: { listing: { select: { title: true, slug: true } } } },
      },
    }),
    prisma.review.findMany({
      where: { authorId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        target: { select: { id: true, name: true } },
        conversation: { include: { listing: { select: { title: true, slug: true } } } },
      },
    }),
  ]);

  const Section = ({
    title,
    items,
    who,
  }: {
    title: string;
    items: typeof received | typeof written;
    who: "author" | "target";
  }) => (
    <section className="mt-8">
      <h2 className="text-xl font-bold">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-[15px] text-ink-500">Пока пусто.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((r) => {
            const person = who === "author"
              ? (r as (typeof received)[number]).author
              : (r as (typeof written)[number]).target;
            return (
              <li key={r.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/user/${person.id}`} className="font-semibold hover:text-brand-700">
                    {person.name}
                  </Link>
                  <Rating value={r.rating} />
                </div>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-700">{r.text}</p>
                <p className="mt-2 text-xs text-ink-500">
                  {formatDate(r.createdAt)} · по объявлению{" "}
                  <Link href={`/listing/${r.conversation.listing.slug}`} className="underline hover:text-brand-700">
                    {r.conversation.listing.title}
                  </Link>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Отзывы</h1>
      {received.length === 0 && written.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<IconStar className="h-8 w-8" />}
            title="Отзывов пока нет"
            text="Отзывы появляются после реальных аренд: их могут оставить только участники переписки по объявлению — это защита от накрутки."
            actionHref="/catalog"
            actionLabel="Найти инструмент"
          />
        </div>
      ) : (
        <>
          <Section title="Полученные" items={received} who="author" />
          <Section title="Оставленные вами" items={written} who="target" />
        </>
      )}
    </div>
  );
}
