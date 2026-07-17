import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { exchangeVkCode, siteUrl } from "@/lib/vk";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const deviceId = url.searchParams.get("device_id") ?? "";

  const jar = await cookies();
  const verifier = jar.get("vk_verifier")?.value;
  const expectedState = jar.get("vk_state")?.value;
  jar.delete("vk_verifier");
  jar.delete("vk_state");

  if (!code || !state || !verifier || state !== expectedState) {
    return NextResponse.redirect(`${siteUrl()}/auth?error=vk_state`);
  }

  try {
    const profile = await exchangeVkCode(code, verifier, deviceId, state);

    let user = await prisma.user.findUnique({ where: { vkId: profile.vkId } });
    if (user?.blocked) {
      return NextResponse.redirect(`${siteUrl()}/auth?error=blocked`);
    }
    if (!user) {
      // Автозаполнение имени и фото из VK (ТЗ п. 4.1) — пользователь
      // может изменить их в профиле.
      user = await prisma.user.create({
        data: {
          vkId: profile.vkId,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
        },
      });
    }
    await createSession(user.id);
    return NextResponse.redirect(`${siteUrl()}/${user.phoneVerified ? "" : "profile?verify=1"}`);
  } catch (e) {
    console.error("VK auth error:", e);
    return NextResponse.redirect(`${siteUrl()}/auth?error=vk_failed`);
  }
}
