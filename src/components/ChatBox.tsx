"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { sendMessage, type SendMessageState } from "@/actions/chat";
import { IconCamera } from "./Icons";
import { SubmitButton } from "./SubmitButton";

export type ChatMessage = {
  id: string;
  text: string | null;
  photoUrl: string | null;
  senderId: string;
  createdAt: string;
};

const POLL_INTERVAL_MS = 5000;

export function ChatBox({
  conversationId,
  currentUserId,
  initialMessages,
}: {
  conversationId: string;
  currentUserId: string;
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const action = sendMessage.bind(null, conversationId);
  const [state, formAction] = useActionState<SendMessageState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (!result.error) {
        formRef.current?.reset();
        setPhotoName(null);
        await poll();
      }
      return result;
    },
    {}
  );
  const [photoName, setPhotoName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastTsRef = useRef<string | null>(
    initialMessages.length > 0 ? initialMessages[initialMessages.length - 1].createdAt : null
  );

  const poll = async () => {
    try {
      const qs = lastTsRef.current ? `?after=${encodeURIComponent(lastTsRef.current)}` : "";
      const res = await fetch(`/api/messages/${conversationId}${qs}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { messages: ChatMessage[] };
      if (data.messages.length > 0) {
        lastTsRef.current = data.messages[data.messages.length - 1].createdAt;
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id));
          return [...prev, ...data.messages.filter((m) => !known.has(m.id))];
        });
      }
    } catch {
      // сеть мигнула — попробуем на следующем тике
    }
  };

  useEffect(() => {
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <>
      <div className="card mt-3 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-[15px] text-ink-500">
            Напишите первое сообщение — уточните наличие, сроки и место встречи.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.senderId === currentUserId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed ${
                  mine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-ink-100 text-ink-900"
                }`}
              >
                {m.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.photoUrl} alt="Фото в сообщении" className="mb-1.5 max-h-64 rounded-xl" />
                )}
                {m.text && <p className="whitespace-pre-line break-words">{m.text}</p>}
                <p className={`mt-1 text-right text-[11px] ${mine ? "text-white/70" : "text-ink-500"}`}>
                  {new Date(m.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form ref={formRef} action={formAction} className="mt-3">
        {state.error && <p className="mb-2 text-sm text-red-600">{state.error}</p>}
        <div className="flex items-end gap-2">
          <label className="btn-ghost shrink-0 cursor-pointer !px-2.5" title="Прикрепить фото">
            <IconCamera className={`h-6 w-6 ${photoName ? "text-brand-600" : ""}`} />
            <input
              type="file"
              name="photo"
              accept="image/*"
              className="hidden"
              onChange={(e) => setPhotoName(e.target.files?.[0]?.name ?? null)}
            />
          </label>
          <textarea
            name="text"
            rows={1}
            maxLength={2000}
            placeholder={photoName ? `Фото: ${photoName}` : "Сообщение…"}
            className="field max-h-32 min-h-11 flex-1 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                formRef.current?.requestSubmit();
              }
            }}
          />
          <SubmitButton className="btn-primary shrink-0" pendingText="…">
            Отправить
          </SubmitButton>
        </div>
      </form>
    </>
  );
}
