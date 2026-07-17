"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { saveImage } from "@/lib/uploads";

export type ProfileState = { error?: string; ok?: boolean };

const profileSchema = z.object({
  name: z.string().trim().min(2, "Имя — минимум 2 символа").max(60),
  city: z.string().trim().max(80).optional(),
  about: z.string().trim().max(1000).optional(),
});

export async function updateProfile(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    city: String(formData.get("city") ?? "").trim() || undefined,
    about: String(formData.get("about") ?? "").trim() || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  let avatarUrl: string | undefined;
  const avatar = formData.get("avatar");
  if (avatar instanceof File && avatar.size > 0) {
    try {
      avatarUrl = await saveImage(avatar, "avatars");
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Ошибка загрузки аватара" };
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { ...parsed.data, ...(avatarUrl ? { avatarUrl } : {}) },
  });
  revalidatePath("/profile");
  return { ok: true };
}

/**
 * Заявка на верификацию по документу (ТЗ п. 4.1): пользователь загружает
 * фото паспорта/в.у., модератор проверяет и выдаёт бейдж в админ-панели.
 * Файл сохраняется в закрытый каталог uploads/docs (не публикуется).
 */
export async function requestDocVerification(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const user = await requireUser();
  if (user.docVerified) return { error: "Вы уже верифицированы" };
  if (!user.phoneVerified) return { error: "Сначала подтвердите номер телефона" };

  const doc = formData.get("document");
  if (!(doc instanceof File) || doc.size === 0) return { error: "Приложите фото документа" };

  let url: string;
  try {
    url = await saveImage(doc, "docs");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка загрузки файла" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { docRequested: true, about: user.about }, // заявка попадает в очередь админа
  });
  // Ссылка на документ передаётся модератору через служебную жалобу-заявку
  await prisma.report.create({
    data: {
      authorId: user.id,
      targetType: "USER",
      reportedUserId: user.id,
      reason: `[ВЕРИФИКАЦИЯ] Заявка на бейдж «Верифицирован». Документ: ${url}`,
    },
  });
  revalidatePath("/profile");
  return { ok: true };
}
