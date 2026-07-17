"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { sendSms } from "@/lib/sms";
import { rateLimit } from "@/lib/rate-limit";

export type AuthState = {
  error?: string;
  phone?: string;
  codeSent?: boolean;
  devHint?: string;
};

async function clientKey(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/** Шаг 1: запрос SMS-кода на телефон. */
export async function requestPhoneCode(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!phone) return { error: "Введите корректный российский номер телефона" };

  const ip = await clientKey();
  if (!rateLimit(`sms:${ip}`, 5, 3600) || !rateLimit(`sms:${phone}`, 3, 600)) {
    return { error: "Слишком много запросов кода. Попробуйте позже." };
  }

  const code = String(Math.floor(1000 + Math.random() * 9000));
  await prisma.phoneCode.deleteMany({ where: { phone } });
  await prisma.phoneCode.create({
    data: { phone, code, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  });
  await sendSms(phone, `СтройАренда: код подтверждения ${code}. Никому его не сообщайте.`);

  const isDev = (process.env.SMS_PROVIDER || "dev") === "dev";
  return {
    codeSent: true,
    phone,
    devHint: isDev
      ? "SMS-провайдер не подключён: код выведен в консоль сервера."
      : undefined,
  };
}

/** Шаг 2: проверка кода, вход/регистрация. */
export async function verifyPhoneCode(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const code = String(formData.get("code") ?? "").trim();
  if (!phone || !/^\d{4}$/.test(code)) {
    return { error: "Введите 4-значный код из SMS", codeSent: true, phone: phone ?? undefined };
  }

  const record = await prisma.phoneCode.findFirst({
    where: { phone, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!record || record.attempts >= 5) {
    return { error: "Код истёк. Запросите новый.", phone };
  }
  if (record.code !== code) {
    await prisma.phoneCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    return { error: "Неверный код", codeSent: true, phone };
  }
  await prisma.phoneCode.deleteMany({ where: { phone } });

  // Привязка телефона к уже вошедшему пользователю (верификация из профиля)
  const current = await getCurrentUser();
  if (current) {
    const taken = await prisma.user.findUnique({ where: { phone } });
    if (taken && taken.id !== current.id) {
      return { error: "Этот номер уже привязан к другому аккаунту", phone };
    }
    await prisma.user.update({
      where: { id: current.id },
      data: {
        phone,
        phoneVerified: true,
        role: process.env.ADMIN_PHONE && phone === normalizePhone(process.env.ADMIN_PHONE) ? "ADMIN" : undefined,
      },
    });
    redirect("/profile");
  }

  // Вход/регистрация по телефону
  let user = await prisma.user.findUnique({ where: { phone } });
  if (user?.blocked) return { error: "Аккаунт заблокирован модератором", phone };
  if (!user) {
    user = await prisma.user.create({
      data: { phone, phoneVerified: true, name: "Пользователь" },
    });
  } else if (!user.phoneVerified) {
    user = await prisma.user.update({ where: { id: user.id }, data: { phoneVerified: true } });
  }

  // Первичное назначение администратора через ADMIN_PHONE
  const adminPhone = process.env.ADMIN_PHONE ? normalizePhone(process.env.ADMIN_PHONE) : null;
  if (adminPhone && phone === adminPhone && user.role !== "ADMIN") {
    user = await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  }

  await createSession(user.id);
  redirect(user.name === "Пользователь" ? "/profile?welcome=1" : "/");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/");
}
