"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { uniqueSlug } from "@/lib/slug";
import { saveImage, deleteUpload } from "@/lib/uploads";
import { verifyCaptcha } from "@/lib/captcha";
import { rateLimit } from "@/lib/rate-limit";

export type ListingFormState = { error?: string };

const MAX_PHOTOS = 8;

const listingSchema = z.object({
  title: z.string().trim().min(5, "Название — минимум 5 символов").max(120),
  categoryId: z.string().min(1, "Выберите категорию"),
  description: z.string().trim().min(20, "Описание — минимум 20 символов").max(5000),
  pricePerDay: z.coerce.number().int().min(1, "Укажите цену за сутки").max(10_000_000),
  priceWeek: z.coerce.number().int().min(1).max(10_000_000).optional(),
  priceMonth: z.coerce.number().int().min(1).max(10_000_000).optional(),
  deposit: z.coerce.number().int().min(0).max(100_000_000),
  city: z.string().trim().min(2, "Укажите город").max(80),
  district: z.string().trim().max(120).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  conditions: z.string().trim().max(1000).optional(),
});

function parseForm(formData: FormData) {
  const opt = (name: string) => {
    const v = String(formData.get(name) ?? "").trim();
    return v === "" ? undefined : v;
  };
  return listingSchema.safeParse({
    title: formData.get("title"),
    categoryId: formData.get("categoryId"),
    description: formData.get("description"),
    pricePerDay: formData.get("pricePerDay"),
    priceWeek: opt("priceWeek"),
    priceMonth: opt("priceMonth"),
    deposit: String(formData.get("deposit") ?? "0") || "0",
    city: formData.get("city"),
    district: opt("district"),
    lat: opt("lat"),
    lng: opt("lng"),
    conditions: opt("conditions"),
  });
}

async function savePhotos(formData: FormData, listingId: string, existing: number) {
  const files = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (existing + files.length > MAX_PHOTOS) {
    throw new Error(`Не более ${MAX_PHOTOS} фото на объявление`);
  }
  let order = existing;
  for (const file of files) {
    const url = await saveImage(file, "listings");
    await prisma.listingPhoto.create({ data: { listingId, url, sortOrder: order++ } });
  }
}

export async function createListing(
  _prev: ListingFormState,
  formData: FormData
): Promise<ListingFormState> {
  const user = await requireUser();
  if (!user.phoneVerified) {
    return { error: "Для размещения объявлений подтвердите номер телефона в профиле" };
  }
  if (!rateLimit(`listing:${user.id}`, 10, 3600)) {
    return { error: "Слишком много объявлений за час. Попробуйте позже." };
  }
  if (!verifyCaptcha(String(formData.get("captchaToken") ?? ""), String(formData.get("captchaAnswer") ?? ""))) {
    return { error: "Неверный ответ на проверку. Попробуйте ещё раз." };
  }

  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const photoFiles = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (photoFiles.length < 1) return { error: "Добавьте минимум одно фото" };

  const category = await prisma.category.findUnique({ where: { id: parsed.data.categoryId } });
  if (!category) return { error: "Категория не найдена" };

  const listing = await prisma.listing.create({
    data: {
      ...parsed.data,
      slug: uniqueSlug(parsed.data.title),
      userId: user.id,
    },
  });

  try {
    await savePhotos(formData, listing.id, 0);
  } catch (e) {
    await prisma.listing.delete({ where: { id: listing.id } });
    return { error: e instanceof Error ? e.message : "Ошибка загрузки фото" };
  }

  revalidatePath("/catalog");
  redirect(`/listing/${listing.slug}`);
}

export async function updateListing(
  listingId: string,
  _prev: ListingFormState,
  formData: FormData
): Promise<ListingFormState> {
  const user = await requireUser();
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { photos: true },
  });
  if (!listing || (listing.userId !== user.id && user.role !== "ADMIN")) {
    return { error: "Объявление не найдено" };
  }

  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // удаление отмеченных фото
  const removeIds = formData.getAll("removePhoto").map(String);
  const keep = listing.photos.filter((p) => !removeIds.includes(p.id));
  const newFiles = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (keep.length + newFiles.length < 1) return { error: "У объявления должно остаться хотя бы одно фото" };

  await prisma.listing.update({ where: { id: listingId }, data: parsed.data });

  for (const id of removeIds) {
    const photo = listing.photos.find((p) => p.id === id);
    if (photo) {
      await prisma.listingPhoto.delete({ where: { id } });
      await deleteUpload(photo.url);
    }
  }
  try {
    await savePhotos(formData, listingId, keep.length);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка загрузки фото" };
  }

  revalidatePath(`/listing/${listing.slug}`);
  redirect(`/listing/${listing.slug}`);
}

export async function setListingStatus(listingId: string, status: "ACTIVE" | "RENTED" | "ARCHIVED"): Promise<void> {
  const user = await requireUser();
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.userId !== user.id) throw new Error("Нет доступа");
  if (listing.status === "BLOCKED") throw new Error("Объявление заблокировано модератором");
  await prisma.listing.update({ where: { id: listingId }, data: { status } });
  revalidatePath("/profile/listings");
  revalidatePath(`/listing/${listing.slug}`);
}

export async function deleteListing(listingId: string): Promise<void> {
  const user = await requireUser();
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { photos: true },
  });
  if (!listing || (listing.userId !== user.id && user.role !== "ADMIN")) throw new Error("Нет доступа");
  for (const p of listing.photos) await deleteUpload(p.url);
  await prisma.listing.delete({ where: { id: listingId } });
  revalidatePath("/profile/listings");
  revalidatePath("/catalog");
}

/**
 * Поднятие объявления в поиске (ТЗ п. 6, платная опция).
 * Приём оплаты не подключён: сейчас действие фиксирует намерение и
 * архитектурно готово к интеграции платёжного провайдера (ЮKassa и т.п.).
 */
export async function promoteListing(listingId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.userId !== user.id) return { error: "Нет доступа" };
  return {
    error:
      "Оплата продвижения появится после подключения платёжного провайдера. Опция заложена архитектурно.",
  };
}
