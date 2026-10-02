import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const nextConfig: NextConfig = {
  /* config options here */
};

export default function config(phase: string): NextConfig {
  // Адрес сайта подставляется при сборке (lib/site.ts) — без него canonical, hreflang и sitemap будут на localhost
  // Конфиг читают и воркеры сборки — флаг в env (они его наследуют), чтобы предупредить один раз
  if (phase === PHASE_PRODUCTION_BUILD && !process.env.NEXT_PUBLIC_SITE_URL && !process.env.SITE_URL_WARNED) {
    process.env.SITE_URL_WARNED = "1";
    console.warn("⚠ NEXT_PUBLIC_SITE_URL не задан — ссылки для поисковиков будут на http://localhost:3000");
  }
  return nextConfig;
}
