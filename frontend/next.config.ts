import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants";
import { siteUrl, validateApiConfig } from './src/lib/config';
import { securityHeaders } from './src/lib/security-headers';

const nextConfig: NextConfig = {
  // Заголовок X-Powered-By: Next.js — лишняя информация о стеке
  poweredByHeader: false,
  experimental: {
    // CSS (~8 КБ gzip) — прямо в HTML: без отдельного запроса, который блокирует первую отрисовку
    inlineCss: true,
  },
};

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD || phase === PHASE_PRODUCTION_SERVER) {
    validateApiConfig({
      mode: process.env.NEXT_PUBLIC_API_MODE,
      publicBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
      serverBaseUrl: process.env.API_BASE_URL,
      nodeEnv: 'production',
      enableTestMocks: process.env.NEXT_PUBLIC_ENABLE_TEST_MOCKS,
    });
    siteUrl(process.env.NEXT_PUBLIC_SITE_URL, 'production');
    return {
      ...nextConfig,
      async headers() {
        return [{ source: '/:path*', headers: securityHeaders(
          process.env.NEXT_PUBLIC_API_BASE_URL,
          process.env.NEXT_PUBLIC_API_MODE === 'mock' && process.env.NEXT_PUBLIC_ENABLE_TEST_MOCKS === '1',
        ) }];
      },
    };
  }
  return nextConfig;
}
