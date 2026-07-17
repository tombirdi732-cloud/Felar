/**
 * Простая арифметическая капча при создании объявления (ТЗ п. 7,
 * защита от спам-регистраций и авторазмещения).
 *
 * Вопрос подписывается HMAC, чтобы ответ нельзя было подделать на клиенте.
 * При необходимости заменяется на reCAPTCHA/hCaptcha/SmartCaptcha —
 * интерфейс (generateCaptcha / verifyCaptcha) сохраняется.
 */
import { createHmac, randomBytes } from "crypto";

const SECRET = process.env.CAPTCHA_SECRET || "felar-captcha-dev-secret";

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 24);
}

export function generateCaptcha(): { question: string; token: string } {
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  const answer = a + b;
  const nonce = randomBytes(6).toString("hex");
  const exp = Date.now() + 15 * 60 * 1000;
  const payload = `${answer}:${nonce}:${exp}`;
  return {
    question: `${a} + ${b}`,
    token: `${nonce}:${exp}:${sign(payload)}`,
  };
}

export function verifyCaptcha(token: string, userAnswer: string): boolean {
  const parts = token.split(":");
  if (parts.length !== 3) return false;
  const [nonce, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!exp || exp < Date.now()) return false;
  const answer = parseInt(userAnswer.trim(), 10);
  if (Number.isNaN(answer)) return false;
  return sign(`${answer}:${nonce}:${exp}`) === sig;
}
