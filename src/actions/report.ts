"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export type ReportState = { error?: string; ok?: boolean };

export async function submitReport(
  target: { listingId?: string; userId?: string; reviewId?: string },
  _prev: ReportState,
  formData: FormData
): Promise<ReportState> {
  const user = await requireUser();
  if (!rateLimit(`report:${user.id}`, 10, 3600)) {
    return { error: "Слишком много жалоб. Попробуйте позже." };
  }
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 2000);
  if (reason.length < 10) return { error: "Опишите причину жалобы (минимум 10 символов)" };

  const targetType = target.listingId ? "LISTING" : target.reviewId ? "REVIEW" : "USER";

  await prisma.report.create({
    data: {
      authorId: user.id,
      targetType,
      listingId: target.listingId,
      reportedUserId: target.userId,
      reason: target.reviewId ? `[Отзыв ${target.reviewId}] ${reason}` : reason,
    },
  });
  return { ok: true };
}
