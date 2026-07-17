/**
 * Абстракция SMS-провайдера для подтверждения телефона.
 *
 * SMS_PROVIDER="dev"  — код не отправляется, а печатается в консоль сервера
 *                       (режим разработки, пока провайдер не подключён).
 * SMS_PROVIDER="smsaero" | "smsc" | ... — точка подключения боевого
 *                       провайдера: реализуется одной функцией ниже.
 */
export async function sendSms(phone: string, text: string): Promise<void> {
  const provider = process.env.SMS_PROVIDER || "dev";

  if (provider === "dev") {
    console.log(`[SMS:dev] → ${phone}: ${text}`);
    return;
  }

  // Здесь подключается боевой провайдер, например SMS Aero / SMSC / Twilio.
  // Ключ берётся из SMS_API_KEY.
  throw new Error(
    `SMS-провайдер «${provider}» не сконфигурирован. Реализуйте отправку в src/lib/sms.ts`
  );
}
