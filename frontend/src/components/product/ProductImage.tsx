import { useState } from 'react'

type Props = {
  src: string | null
  alt: string
  className?: string
}

/** Картинка товара с плейсхолдером: нет URL или картинка не загрузилась */
export function ProductImage({ src, alt, className = '' }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = src !== null && src !== failedSrc

  return (
    <div className={`flex items-center justify-center overflow-hidden rounded-[var(--radius-control)] bg-surface ${className}`}>
      {showImage ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(src)}
          className="size-full object-contain mix-blend-multiply"
        />
      ) : (
        <svg viewBox="0 0 32 32" role="img" aria-label={alt} data-testid="image-placeholder" className="w-2/5 max-w-16 text-line">
          <path
            d="M11.2 6H26a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H11.2a2 2 0 0 1-1.5-.7l-6-7a2 2 0 0 1 0-2.6l6-7a2 2 0 0 1 1.5-.7Z"
            fill="currentColor"
          />
          <circle cx="10.6" cy="16" r="1.9" fill="var(--color-surface)" />
        </svg>
      )}
    </div>
  )
}
