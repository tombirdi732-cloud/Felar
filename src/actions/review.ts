"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export type ReviewState = { error?: string; ok?: boolean };

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  text: z.string().trim().min(10, "Отзыв — минимум 10 символов").max(2000),
});

/**
 * Отзыв можно оставить ТОЛЬКО по существующему диалогу (объявление + переписка)
 * и только участнику этого диалога о втором участнике — ТЗ п. 9,
 * физическое исключение накрутки.
 */
export async function leaveReview(
  conversationId: string,
  _prev: ReviewState,
  formData: FormData
): Promise<ReviewState> {
  const user = await requireUser();

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      listing: { select: { userId: true } },
      _count: { select: { messages: true } },
    },
  });
  if (!conversation) return { error: "Диалог не найден" };

  const ownerId = conversation.listing.userId;
  const renterId = conversation.renterId;
  if (user.id !== ownerId && user.id !== renterId) return { error: "Нет доступа" };
  if (conversation._count.messages === 0) {
    return { error: "Отзыв можно оставить только после переписки по объявлению" };
  }
  const targetId = user.id === ownerId ? renterId : ownerId;

  const parsed = reviewSchema.safeParse({
    rating: formData.get("rating"),
    text: formData.get("text"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const existing = await prisma.review.findUnique({
    where: { conversationId_authorId: { conversationId, authorId: user.id } },
  });
  if (existing) return { error: "Вы уже оставили отзыв по этой аренде" };

  await prisma.review.create({
    data: {
      conversationId,
      authorId: user.id,
      targetId,
      rating: parsed.data.rating,
      text: parsed.data.text,
    },
  });

  // Страницы профиля и диалога динамические, поэтому ревалидация не нужна;
  // намеренный revalidatePath здесь перерисовал бы диалог и размонтировал
  // модалку до показа подтверждения.
  return { ok: true };
}
