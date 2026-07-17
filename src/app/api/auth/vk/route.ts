import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generatePkce, siteUrl, vkAuthorizeUrl, vkConfigured } from "@/lib/vk";

export async function GET() {
  if (!vkConfigured()) {
    return NextResponse.redirect(`${siteUrl()}/auth?error=vk_not_configured`);
  }
  const { verifier, challenge, state } = generatePkce();
  const jar = await cookies();
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  };
  jar.set("vk_verifier", verifier, cookieOpts);
  jar.set("vk_state", state, cookieOpts);
  return NextResponse.redirect(vkAuthorizeUrl(challenge, state));
}
