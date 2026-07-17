import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Фото объявлений сохраняются в файловую систему (см. src/lib/uploads.ts)
  // и раздаются через /uploads — внешние источники изображений не используются,
  // кроме аватаров, полученных из VK при входе через VK ID.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "sun*.userapi.com" },
      { protocol: "https", hostname: "*.vk.com" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb", // до 8 фото на объявление
    },
  },
};

export default nextConfig;
