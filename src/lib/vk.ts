/**
 * VK ID (OAuth 2.1 c PKCE) — основной способ входа (ТЗ п. 4.1).
 * Документация: https://id.vk.com/about/business/go/docs
 *
 * Активируется при заполненных VK_CLIENT_ID / VK_CLIENT_SECRET в .env;
 * без них кнопка «Войти через VK» показывает подсказку о настройке.
 */
import { createHash, randomBytes } from "crypto";

export function vkConfigured(): boolean {
  return Boolean(process.env.VK_CLIENT_ID && process.env.VK_CLIENT_SECRET);
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

export function vkRedirectUri(): string {
  return `${siteUrl()}/api/auth/vk/callback`;
}

export function generatePkce(): { verifier: string; challenge: string; state: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("hex");
  return { verifier, challenge, state };
}

export function vkAuthorizeUrl(challenge: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.VK_CLIENT_ID!,
    redirect_uri: vkRedirectUri(),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "vkid.personal_info",
  });
  return `https://id.vk.com/authorize?${params}`;
}

export type VkProfile = {
  vkId: string;
  name: string;
  avatarUrl: string | null;
};

export async function exchangeVkCode(
  code: string,
  verifier: string,
  deviceId: string,
  state: string
): Promise<VkProfile> {
  const tokenRes = await fetch("https://id.vk.com/oauth2/auth", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: process.env.VK_CLIENT_ID!,
      device_id: deviceId,
      redirect_uri: vkRedirectUri(),
      state,
    }),
  });
  if (!tokenRes.ok) throw new Error(`VK token exchange failed: ${tokenRes.status}`);
  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    user_id?: number;
    error?: string;
  };
  if (!tokenData.access_token || !tokenData.user_id) {
    throw new Error(`VK token error: ${tokenData.error ?? "no access_token"}`);
  }

  const infoRes = await fetch("https://id.vk.com/oauth2/user_info", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      access_token: tokenData.access_token,
      client_id: process.env.VK_CLIENT_ID!,
    }),
  });
  if (!infoRes.ok) throw new Error(`VK user_info failed: ${infoRes.status}`);
  const info = (await infoRes.json()) as {
    user?: { first_name?: string; last_name?: string; avatar?: string };
  };

  const first = info.user?.first_name ?? "";
  const last = info.user?.last_name ?? "";
  return {
    vkId: String(tokenData.user_id),
    name: `${first} ${last}`.trim() || `Пользователь VK`,
    avatarUrl: info.user?.avatar ?? null,
  };
}
