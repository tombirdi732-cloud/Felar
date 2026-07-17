"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { slugify } from "@/lib/slug";

function refreshAdmin() {
  revalidatePath("/admin");
  revalidatePath("/catalog");
}

export async function resolveReport(reportId: string, action: "RESOLVED" | "DISMISSED", resolution?: string): Promise<void> {
  await requireAdmin();
  await prisma.report.update({
    where: { id: reportId },
    data: { status: action, resolution: resolution ?? null, resolvedAt: new Date() },
  });
  refreshAdmin();
}

export async function blockListing(listingId: string, block: boolean): Promise<void> {
  await requireAdmin();
  await prisma.listing.update({
    where: { id: listingId },
    data: { status: block ? "BLOCKED" : "ARCHIVED" },
  });
  refreshAdmin();
}

export async function blockUser(userId: string, block: boolean): Promise<void> {
  const admin = await requireAdmin();
  if (userId === admin.id) throw new Error("Нельзя заблокировать себя");
  await prisma.user.update({ where: { id: userId }, data: { blocked: block } });
  if (block) {
    await prisma.session.deleteMany({ where: { userId } });
  }
  refreshAdmin();
}

export async function grantVerification(userId: string, granted: boolean): Promise<void> {
  await requireAdmin();
  await prisma.user.update({
    where: { id: userId },
    data: { docVerified: granted, docRequested: false },
  });
  refreshAdmin();
}

export async function hideReview(reviewId: string, hidden: boolean): Promise<void> {
  await requireAdmin();
  await prisma.review.update({ where: { id: reviewId }, data: { hidden } });
  refreshAdmin();
}

export type CategoryState = { error?: string; ok?: boolean };

export async function saveCategory(
  _prev: CategoryState,
  formData: FormData
): Promise<CategoryState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const parentId = String(formData.get("parentId") ?? "").trim() || null;
  if (name.length < 2) return { error: "Название категории — минимум 2 символа" };

  if (id) {
    await prisma.category.update({ where: { id }, data: { name, parentId } });
  } else {
    const slug = slugify(name) || `category-${Date.now()}`;
    const exists = await prisma.category.findUnique({ where: { slug } });
    await prisma.category.create({
      data: { name, parentId, slug: exists ? `${slug}-${Date.now().toString(36)}` : slug },
    });
  }
  refreshAdmin();
  return { ok: true };
}

export async function toggleCategory(categoryId: string, active: boolean): Promise<void> {
  await requireAdmin();
  await prisma.category.update({ where: { id: categoryId }, data: { active } });
  refreshAdmin();
}
