import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatPrice } from "@/lib/format";
import { markConversationRead } from "@/actions/chat";
import { ChatBox } from "@/components/ChatBox";
import { ReviewForm } from "@/components/ReviewForm";
import { NoPhoto } from "@/components/NoPhoto";
import { VerifiedBadge } from "@/components/Rating";

export const metadata: Metadata = {
  title: "Диалог",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      listing: {
        include: {
          photos: { orderBy: { sortOrder: "asc" }, take: 1 },
          user: { select: { id: true, name: true, docVerified: true } },
        },
      },
      renter: { select: { id: true, name: true, docVerified: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
      },
      reviews: { where: { authorId: user.id }, select: { id: true } },
    },
  });
  if (!conversation) notFound();

  const isRenter = conversation.renterId === user.id;
  const isOwner = conversation.listing.user.id === user.id;
  if (!isRenter && !isOwner) notFound();

  await markConversationRead(id);

  const companion = isRenter ? conversation.listing.user : conversation.renter;
  const alreadyReviewed = conversation.reviews.length > 0;
  const hasMessages = conversation.messages.length > 0;

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-3xl flex-col px-4 py-4">
      {/* Шапка диалога */}
      <div className="card flex items-center gap-3 p-3">
        <Link href={`/listing/${conversation.listing.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-ink-100">
            {conversation.listing.photos[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={conversation.listing.photos[0].url} alt="" className="h-full w-full object-cover" />
            ) : (
              <NoPhoto />
            )}
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate font-semibold">
              {companion.name}
              {companion.docVerified && <VerifiedBadge compact />}
            </p>
            <p className="truncate text-sm text-ink-500">
              {conversation.listing.title} · {formatPrice(conversation.listing.pricePerDay)}/сутки
            </p>
          </div>
        </Link>
        {hasMessages && !alreadyReviewed && (
          <ReviewForm conversationId={conversation.id} companionName={companion.name} />
        )}
      </div>

      <ChatBox
        conversationId={conversation.id}
        currentUserId={user.id}
        initialMessages={conversation.messages.map((m) => ({
          id: m.id,
          text: m.text,
          photoUrl: m.photoUrl,
          senderId: m.senderId,
          createdAt: m.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
