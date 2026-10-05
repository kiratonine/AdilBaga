import { notFound } from 'next/navigation'

// Любой неизвестный путь под /ru и /kk — 404 из [lang]/not-found.tsx (с шапкой и на нужном языке)
export default function CatchAll() {
  notFound()
}
