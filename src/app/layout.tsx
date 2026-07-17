import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import "./globals.css";

const inter = Inter({
  subsets: ["cyrillic", "latin"],
  variable: "--font-inter",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Felar — аренда инструмента и техники у людей рядом",
    template: "%s — Felar",
  },
  description:
    "Классифайд аренды электроинструмента, строительной и садовой техники между частными лицами. Найдите инструмент рядом, договоритесь в чате, заберите лично.",
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Felar",
    // OG-изображение 1200x630 предоставляется заказчиком (ТЗ п. 5):
    // положите файл в public/og.png — путь уже подключён.
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={inter.variable}>
      <body className="flex min-h-screen flex-col font-sans">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
