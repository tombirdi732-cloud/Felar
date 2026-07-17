"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { saveImage } from "@/lib/uploads";

/** Открыть (или найти существующий) диалог по объявлению. */
export async function startConversation(listingId: string): Promise<void> {
  const user = await requireUser();
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new Error("Объявление не найдено");
  if (listing.userId === user.id) redirect("/messages");

  const conversation = await prisma.conversation.upsert({
    where: { listingId_renterId: { listingId, renterId: user.id } },
    update: {},
    create: { listingId, renterId: user.id },
  });
  redirect(`/messages/${conversation.id}`);
}

export type SendMessageState = { error?: string };

export async function sendMessage(
  conversationId: string,
  _prev: SendMessageState,
  formData: FormData
): Promise<SendMessageState> {
  const user = await requireUser();
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { listing: { select: { userId: true } } },
  });
  if (!conversation) return { error: "Диалог не найден" };
  const isParty = conversation.renterId === user.id || conversation.listing.userId === user.id;
  if (!isParty) return { error: "Нет доступа к диалогу" };

  // Антифлуд (ТЗ п. 7): не более 20 сообщений в минуту
  if (!rateLimit(`msg:${user.id}`, 20, 60)) {
    return { error: "Слишком часто. Подождите немного." };
  }

  const text = String(formData.get("text") ?? "").trim().slice(0, 2000);
  const photo = formData.get("photo");
  let photoUrl: string | undefined;
  if (photo instanceof File && photo.size > 0) {
    try {
      photoUrl = await saveImage(photo, "chat");
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Ошибка загрузки фото" };
    }
  }
  if (!text && !photoUrl) return { error: "Пустое сообщение" };

  await prisma.message.create({
    data: { conversationId, senderId: user.id, text: text || null, photoUrl },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  revalidatePath(`/messages/${conversationId}`);
  return {};
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const user = await requireUser();
  await prisma.message.updateMany({
    where: { conversationId, senderId: { not: user.id }, readAt: null },
    data: { readAt: new Date() },
  });
}
