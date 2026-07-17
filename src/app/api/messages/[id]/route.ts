import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/** Поллинг новых сообщений диалога (используется клиентом чата). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: { listing: { select: { userId: true } } },
  });
  if (!conversation || (conversation.renterId !== user.id && conversation.listing.userId !== user.id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const after = new URL(req.url).searchParams.get("after");
  const messages = await prisma.message.findMany({
    where: {
      conversationId: id,
      ...(after ? { createdAt: { gt: new Date(after) } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  // входящие помечаем прочитанными
  await prisma.message.updateMany({
    where: { conversationId: id, senderId: { not: user.id }, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      text: m.text,
      photoUrl: m.photoUrl,
      senderId: m.senderId,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}
