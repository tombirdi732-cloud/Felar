import { cookies } from "next/headers";
import { cache } from "react";
import { randomBytes } from "crypto";
import { prisma } from "./db";
import type { User } from "@prisma/client";

const SESSION_COOKIE = "felar_session";
const SESSION_DAYS = 30;

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Secure-флаг привязан к протоколу сайта, а не к NODE_ENV: на боевом
    // сервере без SSL (доступ по http://IP) браузер не сохраняет
    // Secure-куки, и сессия «слетает» после каждого входа.
    secure: (process.env.NEXT_PUBLIC_SITE_URL || "").startsWith("https"),
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
    jar.delete(SESSION_COOKIE);
  }
}

/** Текущий пользователь (null для гостя). Кэшируется в рамках запроса. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  if (session.user.blocked) return null;
  return session.user;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}
