'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from '../ui/Icon'

type Props = {
  src: string | null
  alt: string
  className?: string
  /** Плейсхолдер — иконка категории; без неё — ценник */
  icon?: IconName
}

/** Картинка товара с плейсхолдером: нет URL или картинка не загрузилась. Скругление задаёт вызывающий */
export function ProductImage({ src, alt, className = '', icon }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = src !== null && src !== failedSrc
  const img = useRef<HTMLImageElement>(null)

  // Картинка из серверного HTML могла упасть до гидрации — тогда onError уже не придёт
  useEffect(() => {
    const el = img.current
    if (el && el.complete && el.naturalWidth === 0) setFailedSrc(src)
  }, [src])

  return (
    <div className={`flex items-center justify-center overflow-hidden bg-surface ${className}`}>
      {showImage ? (
        <img
          ref={img}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(src)}
          className="size-full object-contain mix-blend-multiply"
        />
      ) : icon ? (
        <span role="img" aria-label={alt} data-testid="image-placeholder" className="flex">
          <Icon name={icon} size={64} className="text-muted" />
        </span>
      ) : (
        <svg viewBox="0 0 32 32" role="img" aria-label={alt} data-testid="image-placeholder" className="w-2/5 max-w-16 text-line">
          <path
            d="M11.2 6H26a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H11.2a2 2 0 0 1-1.5-.7l-6-8a2 2 0 0 1 0-2.6l6-8a2 2 0 0 1 1.5-.7Z"
            fill="currentColor"
          />
          <circle cx="10.6" cy="16" r="1.9" fill="var(--color-surface)" />
        </svg>
      )}
    </div>
  )
}
