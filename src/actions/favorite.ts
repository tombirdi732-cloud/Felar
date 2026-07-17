"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function toggleFavorite(listingId: string, pathname: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const existing = await prisma.favorite.findUnique({
    where: { userId_listingId: { userId: user.id, listingId } },
  });
  if (existing) {
    await prisma.favorite.delete({
      where: { userId_listingId: { userId: user.id, listingId } },
    });
  } else {
    await prisma.favorite.create({ data: { userId: user.id, listingId } });
  }
  revalidatePath(pathname);
  revalidatePath("/favorites");
}
