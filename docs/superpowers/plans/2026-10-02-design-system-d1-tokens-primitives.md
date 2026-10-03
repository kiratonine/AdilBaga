# Дизайн-код D1: токены и примитивы — план внедрения

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Завести новые дизайн-токены и базовые UI-примитивы (Button, Chip, Badge, Segmented, Icon, Sheet), не меняя раскладку страниц.

**Architecture:** Токены — в `@theme` и `@utility` файла `src/app/globals.css` (Tailwind 4). Примитивы — маленькие презентационные компоненты в `src/components/ui/`, каждый в своём файле, с экспортом функции-класса там, где стиль нужен на чужом элементе (`<Link>`, `<select>`). Страницы на новые примитивы переводятся в D2–D4; в D1 меняются только места, где старый код ломался бы (общий `Button`, `bg-page`), и `LanguageSwitch` (тривиальный перевод на `Segmented`).

**Tech Stack:** Next 16.3 (App Router), React 19, Tailwind 4, TypeScript 6, Vitest 5 + Testing Library (jsdom), oxlint, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-02-design-system-design.md` (§2 токены, §3 примитивы, §8 доступность, §10 этап D1).

Рабочая папка всех команд — `frontend-next/` (после переключения миграции — `frontend/`; пути внутри `src/` те же).

## Global Constraints

- Цвета: `page #F4F5F6`, `card #FFFFFF`, `surface #F3F5F4`, `line #E2E6E4`, `ink #1A1F24`, `muted #697178`, `accent #17744A`, `accent-soft #E5F2EA`, `danger #B42318`, `tile-1…5` = `#F6EEE3`, `#E6F0F8`, `#EFEAF7`, `#FBEAE2`, `#FBF4D9`.
- Зелёный (`accent`) — только минимальная цена, сумма выгоды, бейджи `discount`/`best`. Не для кнопок, фокуса, навигации.
- Основная кнопка — `ink` фон, белый текст. Фокус `:focus-visible` — outline 2px `ink`, offset 2px.
- Шрифты: Golos Text — UI, Montserrat — цены и логотип; fontsource, без новых шрифтов.
- Базовый `body` — 15px / 1.47.
- Скругления: `--radius-card 12px`, `--radius-media 8px`, `--radius-control 12px`, чипы/сегменты/бейджи — `9999px`, шторка — 16px сверху.
- Тени: `--shadow-hover: 0 4px 16px rgb(26 31 36 / 0.08)`, `--shadow-sheet: 0 -8px 32px rgb(26 31 36 / 0.12)`.
- Кнопки 44px высотой; чипы 40px (мобильный) / 36px (≥ md); кнопка закрытия шторки — зона 44px.
- Иконки — линейные SVG 24px, `stroke-width 2`, `currentColor`, без иконочных библиотек.
- Новых npm-зависимостей нет.
- В D1 фон `body` остаётся белым (`bg-card`): серый `page` включается для группы `(site)` только в D3.
- Существующие testid не меняются; `load-more` остаётся на кнопке «Показать ещё».
- Комментарии в коде — по-русски, коротко, как в окружающем коде; импорты относительные.

## Review Focus

1. Закрытие шторки по Esc (браузер закрывает `<dialog>` сам) должно вернуть `open=false` у родителя, иначе следующее открытие не сработает → тест в Task 6 (событие `close`).
2. Клик по затемнению закрывает шторку, клик внутри — нет → тест в Task 6.
3. Пока шторка открыта, страница под ней не прокручивается → CSS `body:has(dialog[open])` в Task 6, ручная проверка в Task 7.
4. `Button` внутри `<form>` не должен отправлять форму (по умолчанию `type="button"`) → тест в Task 2.
5. Замена `bg-page` → `bg-card`: ни один белый элемент не должен стать серым, когда `page` станет `#F4F5F6` → grep-проверка в Task 1 и визуальная в Task 7.

---

### Task 1: Токены в `globals.css` и перевод белых фонов на `card`

**Files:**
- Modify: `src/app/globals.css` (весь блок `@theme`, `@layer base`, новые `@utility`)
- Modify (замена `bg-page`/`text-page` → `bg-card`/`text-card`): `src/components/catalog/DynamicFilters.tsx:70`, `src/components/catalog/SortSelect.tsx:16`, `src/components/layout/Header.tsx:25`, `src/components/layout/LanguageSwitch.tsx:52`, `src/components/layout/Main.tsx:12`, `src/components/layout/SearchBox.tsx:97`, `src/components/product/ProductCard.tsx:23`, `src/components/ui/Skeleton.tsx:14`, `src/components/ui/States.tsx:63`, `src/views/CategoryPage.tsx:78`, `src/views/LandingPage.tsx:22,167`

**Interfaces:**
- Produces: Tailwind-утилиты цветов `bg-card`, `text-card`, `bg-tile-1`…`bg-tile-5` (плюс прежние); `shadow-hover`, `shadow-sheet`; `rounded-card`, `rounded-media`, `rounded-control`; типографика `text-caption`, `text-meta`, `text-card-title`, `text-h1`, `text-h2`, `text-h3`, `text-price-card`, `text-price-page`, `text-price-row`.

Проверяемого юнит-тестами поведения здесь нет (`vitest` запускается с `css: false`); проверка — grep, typecheck, сборка и визуально в Task 7.

- [ ] **Step 1: Заменить блок `@theme` и `@layer base` в `src/app/globals.css`**

Новый `@theme` (заменяет прежний целиком):

```css
/*
  Adil Bağa — дизайн-токены (docs/superpowers/specs/2026-10-02-design-system-design.md).
  Нейтральная база, один акцент: зелёный = «здесь выгоднее».
  Акцент — только минимальная цена и выгода, не кнопки, не фокус, не декор.
*/
@theme {
  /* page — серый фон страниц сайта (включается в D3), card — белые блоки */
  --color-page: #f4f5f6;
  --color-card: #ffffff;
  --color-surface: #f3f5f4;
  --color-line: #e2e6e4;
  --color-ink: #1a1f24;
  --color-muted: #697178;
  --color-accent: #17744a;
  --color-accent-soft: #e5f2ea;
  --color-danger: #b42318;

  /* Пастель плиток категорий, по индексу i % 5. Зелёной нет — зелёный занят выгодой */
  --color-tile-1: #f6eee3;
  --color-tile-2: #e6f0f8;
  --color-tile-3: #efeaf7;
  --color-tile-4: #fbeae2;
  --color-tile-5: #fbf4d9;

  --font-sans: 'Golos Text Variable', system-ui, sans-serif;
  /* Выразительный геометричный гротеск — для цен и логотипа */
  --font-display: 'Montserrat Variable', 'Golos Text Variable', sans-serif;

  --radius-card: 12px;
  --radius-media: 8px;
  --radius-control: 12px;

  --shadow-hover: 0 4px 16px rgb(26 31 36 / 0.08);
  --shadow-sheet: 0 -8px 32px rgb(26 31 36 / 0.12);
}
```

Новый `@layer base` (заменяет прежний целиком):

```css
@layer base {
  html {
    color-scheme: light;
    -webkit-text-size-adjust: 100%;
  }

  /* Белый фон до D3: серый page включит layout группы (site) */
  body {
    @apply bg-card text-ink font-sans antialiased;
    font-size: 15px;
    line-height: 1.47;
  }

  /* Фокус — графит: зелёный оставляем только для выгоды */
  :focus-visible {
    outline: 2px solid var(--color-ink);
    outline-offset: 2px;
    border-radius: 4px;
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
    }
  }
}
```

- [ ] **Step 2: Добавить типографические утилиты после `@utility tabular`**

```css
/* Шкала шрифтов дизайн-кода. Мобильный → с md (48rem) */
@utility text-caption {
  font-size: 12px;
  line-height: 16px;
}

@utility text-meta {
  font-size: 13px;
  line-height: 18px;
}

@utility text-card-title {
  font-size: 14px;
  line-height: 19px;

  @media (width >= 48rem) {
    font-size: 15px;
    line-height: 20px;
  }
}

@utility text-h3 {
  font-size: 17px;
  line-height: 24px;
  font-weight: 600;
}

@utility text-h2 {
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;

  @media (width >= 48rem) {
    font-size: 22px;
    line-height: 28px;
  }
}

@utility text-h1 {
  font-size: 24px;
  line-height: 30px;
  font-weight: 600;
  letter-spacing: -0.01em;

  @media (width >= 48rem) {
    font-size: 32px;
    line-height: 38px;
  }
}

@utility text-price-card {
  font-family: var(--font-display);
  font-size: 18px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;

  @media (width >= 48rem) {
    font-size: 22px;
  }
}

@utility text-price-page {
  font-family: var(--font-display);
  font-size: 28px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;

  @media (width >= 48rem) {
    font-size: 36px;
  }
}

@utility text-price-row {
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 3: Перевести белые фоны с `page` на `card`**

Сейчас `page` = белый, и все использования `bg-page`/`text-page` означают «белый». Когда `page` станет серым, они должны остаться белыми.

Run (Git Bash, из `frontend-next/`):

```bash
grep -rlE '\b(bg|text)-page\b' src --include=*.tsx | xargs sed -i -E 's/\b(bg|text)-page\b/\1-card/g'
```

Затем вручную в `src/components/layout/SearchBox.tsx:97` заменить `focus:outline-accent` на `focus:outline-ink` (фокус не зелёный).

- [ ] **Step 4: Убедиться, что `page` больше нигде не используется как «белый»**

Run: `grep -rnE '\b(bg|text)-page\b|outline-accent' src --include=*.tsx`
Expected: пустой вывод.

- [ ] **Step 5: Проверить контраст токенов**

Run:

```bash
node -e "
const L=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
const cr=(a,b)=>{const x=L(a),y=L(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
const pairs=[['#697178','#F4F5F6'],['#697178','#FFFFFF'],['#697178','#F3F5F4'],['#17744A','#E5F2EA'],['#17744A','#FFFFFF'],['#FFFFFF','#17744A'],['#FFFFFF','#1A1F24'],['#1A1F24','#F6EEE3'],['#1A1F24','#E6F0F8'],['#1A1F24','#EFEAF7'],['#1A1F24','#FBEAE2'],['#1A1F24','#FBF4D9']];
for(const [a,b] of pairs){const r=cr(a,b);console.log(a,b,r.toFixed(2),r>=4.5?'ok':'FAIL')}"
```

Expected: все строки `ok` (минимум — `muted`/`surface` 4.53).

- [ ] **Step 6: typecheck, lint, тесты, сборка**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: всё зелёное; сборка без ошибок CSS (неизвестная утилита Tailwind 4 роняет сборку — если упало, проверить имена в шагах 1–2).

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css src/components src/views
git commit -m "feat(frontend-next): design tokens — card/page split, type scale, radii, shadows"
```

---

### Task 2: `Button`

**Files:**
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/Button.test.tsx`
- Modify: `src/components/ui/States.tsx` (удалить старый `Button`, `ErrorState` — на новый)
- Modify: `src/views/CategoryPage.tsx:13,123,136-142`, `src/views/SearchPage.tsx:10,74-80` (импорт из `../components/ui/Button`)

**Interfaces:**
- Produces:
  - `type ButtonVariant = 'primary' | 'secondary' | 'ghost'`
  - `buttonClass(variant?: ButtonVariant, className?: string): string` — классы для чужих элементов
  - `Button(props)`: общие `{ variant?: ButtonVariant (по умолчанию 'secondary'); className?: string; testId?: string; children: ReactNode }` + либо атрибуты `<button>` (без `className`), либо `{ href: string; prefetch?: boolean }` → `next/link`.

- [ ] **Step 1: Написать падающий тест**

`src/components/ui/Button.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button, buttonClass } from './Button'

describe('Button', () => {
  it('renders a non-submitting button that calls onClick', () => {
    const onClick = vi.fn()
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <Button onClick={onClick} testId="b">
          Повторить
        </Button>
      </form>,
    )
    const button = screen.getByRole('button', { name: 'Повторить' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveAttribute('data-testid', 'b')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('respects disabled', () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} disabled>
        Ещё
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Ещё' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders a link when href is given', () => {
    render(
      <Button href="/ru/catalog" variant="primary">
        Открыть каталог
      </Button>,
    )
    const link = screen.getByRole('link', { name: 'Открыть каталог' })
    expect(link).toHaveAttribute('href', '/ru/catalog')
    expect(link.className).toContain('bg-ink')
  })

  it('maps variants to classes; secondary is the default', () => {
    expect(buttonClass('primary')).toContain('bg-ink')
    expect(buttonClass('primary')).toContain('text-card')
    expect(buttonClass()).toBe(buttonClass('secondary'))
    expect(buttonClass('secondary')).toContain('bg-card')
    expect(buttonClass('ghost')).not.toContain('bg-card')
    expect(buttonClass('ghost', 'w-full')).toContain('w-full')
  })
})
```

- [ ] **Step 2: Запустить и увидеть падение**

Run: `pnpm vitest run src/components/ui/Button.test.tsx`
Expected: FAIL — `Failed to resolve import "./Button"`.

- [ ] **Step 3: Реализация**

`src/components/ui/Button.tsx`:

```tsx
import Link from 'next/link'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'

const BASE =
  'inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] px-[18px] text-[15px] font-medium transition-colors disabled:cursor-default disabled:opacity-60'

// Основная — графит: зелёный в дизайн-коде только для выгоды
const LOOK: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-card hover:bg-ink/85',
  secondary: 'bg-card text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_1px_var(--color-ink)]',
  ghost: 'text-ink hover:bg-surface',
}

/** Классы кнопки — для элементов, которые рендерит не Button */
export function buttonClass(variant: ButtonVariant = 'secondary', className = '') {
  return `${BASE} ${LOOK[variant]} ${className}`.trim()
}

type Common = {
  variant?: ButtonVariant
  className?: string
  testId?: string
  children: ReactNode
}

type AsButton = Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & { href?: undefined }
type AsLink = Common & { href: string; prefetch?: boolean }

export function Button(props: AsButton | AsLink) {
  if (props.href !== undefined) {
    const { href, prefetch, variant, className, testId, children } = props
    return (
      <Link href={href} prefetch={prefetch} data-testid={testId} className={buttonClass(variant, className)}>
        {children}
      </Link>
    )
  }
  const { variant, className, testId, children, type = 'button', ...rest } = props
  return (
    <button type={type} data-testid={testId} className={buttonClass(variant, className)} {...rest}>
      {children}
    </button>
  )
}
```

- [ ] **Step 4: Запустить тест**

Run: `pnpm vitest run src/components/ui/Button.test.tsx`
Expected: PASS (4 теста).

- [ ] **Step 5: Перевести старых потребителей**

В `src/components/ui/States.tsx`: удалить тип `ButtonProps` и функцию `Button` целиком; добавить `import { Button } from './Button'`; в `ErrorState` заменить `variant="solid"` на `variant="primary"`. Остальное в `ErrorState` не трогать (новый вид состояний — D4).

В `src/views/CategoryPage.tsx` и `src/views/SearchPage.tsx`: убрать `Button` из импорта `../components/ui/States` и добавить `import { Button } from '../components/ui/Button'`. Вызовы `<Button onClick=… disabled=… testId="load-more">` и `<Button onClick={resetFilters}>` остаются как есть (вариант по умолчанию `secondary` = прежний `outline`).

- [ ] **Step 6: Полный прогон**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: всё зелёное (тесты страниц находят `load-more` и «Повторить» как раньше).

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/Button.tsx src/components/ui/Button.test.tsx src/components/ui/States.tsx src/views/CategoryPage.tsx src/views/SearchPage.tsx
git commit -m "feat(frontend-next): Button primitive with primary/secondary/ghost and link mode"
```

---

### Task 3: `Chip` и `Badge`

**Files:**
- Create: `src/components/ui/Chip.tsx`, `src/components/ui/Chip.test.tsx`
- Create: `src/components/ui/Badge.tsx`, `src/components/ui/Badge.test.tsx`

**Interfaces:**
- Produces:
  - `chipClass(pressed?: boolean, className?: string): string`
  - `Chip(props: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & { pressed?: boolean; className?: string; testId?: string })` — `aria-pressed` ставится только если `pressed` передан (переключатель); без него — обычная кнопка-таблетка («Фильтры · 2»).
  - `type BadgeTone = 'discount' | 'best' | 'neutral'`
  - `Badge({ tone: BadgeTone; className?: string; children: ReactNode })`

- [ ] **Step 1: Падающие тесты**

`src/components/ui/Chip.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Chip, chipClass } from './Chip'

describe('Chip', () => {
  it('is a toggle with aria-pressed when pressed is given', () => {
    const onClick = vi.fn()
    const { rerender } = render(
      <Chip pressed={false} onClick={onClick}>
        3,2%
      </Chip>,
    )
    const chip = screen.getByRole('button', { name: '3,2%' })
    expect(chip).toHaveAttribute('type', 'button')
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(chip)
    expect(onClick).toHaveBeenCalledOnce()

    rerender(
      <Chip pressed onClick={onClick}>
        3,2%
      </Chip>,
    )
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(chip.className).toContain('bg-ink')
  })

  it('is a plain pill button without pressed', () => {
    render(<Chip testId="open-filters">Фильтры · 2</Chip>)
    const chip = screen.getByTestId('open-filters')
    expect(chip).not.toHaveAttribute('aria-pressed')
    expect(chip.className).toContain('rounded-full')
  })

  it('pressed and idle looks differ', () => {
    expect(chipClass(true)).toContain('text-card')
    expect(chipClass(false)).toContain('bg-card')
  })
})
```

`src/components/ui/Badge.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge } from './Badge'

describe('Badge', () => {
  it.each([
    ['discount', 'bg-accent'],
    ['best', 'bg-accent-soft'],
    ['neutral', 'bg-surface'],
  ] as const)('%s tone uses %s', (tone, cls) => {
    render(<Badge tone={tone}>−8%</Badge>)
    const badge = screen.getByText('−8%')
    expect(badge.className.split(' ')).toContain(cls)
    expect(badge.className).toContain('rounded-full')
  })
})
```

- [ ] **Step 2: Запустить и увидеть падение**

Run: `pnpm vitest run src/components/ui/Chip.test.tsx src/components/ui/Badge.test.tsx`
Expected: FAIL — не найдены `./Chip`, `./Badge`.

- [ ] **Step 3: Реализация**

`src/components/ui/Chip.tsx`:

```tsx
import type { ButtonHTMLAttributes } from 'react'

/** Таблетка фильтра/сортировки. 40px на мобильном (палец), 36px с md */
export function chipClass(pressed = false, className = '') {
  const look = pressed
    ? 'bg-ink text-card'
    : 'bg-card text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_1px_rgb(26_31_36/0.5)]'
  return `inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors md:h-9 ${look} ${className}`.trim()
}

type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  /** Передан — чип-переключатель с aria-pressed; не передан — просто кнопка-таблетка */
  pressed?: boolean
  className?: string
  testId?: string
}

export function Chip({ pressed, className, testId, type = 'button', children, ...rest }: ChipProps) {
  return (
    <button type={type} aria-pressed={pressed} data-testid={testId} className={chipClass(pressed, className)} {...rest}>
      {children}
    </button>
  )
}
```

`src/components/ui/Badge.tsx`:

```tsx
import type { ReactNode } from 'react'

export type BadgeTone = 'discount' | 'best' | 'neutral'

// discount и best — про выгоду, поэтому зелёные; neutral — справочная пометка
const TONE: Record<BadgeTone, string> = {
  discount: 'bg-accent text-card',
  best: 'bg-accent-soft text-accent',
  neutral: 'bg-surface text-muted',
}

export function Badge({ tone, className = '', children }: { tone: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs leading-none font-semibold ${TONE[tone]} ${className}`.trim()}>
      {children}
    </span>
  )
}
```

- [ ] **Step 4: Запустить тесты**

Run: `pnpm vitest run src/components/ui/Chip.test.tsx src/components/ui/Badge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Chip.tsx src/components/ui/Chip.test.tsx src/components/ui/Badge.tsx src/components/ui/Badge.test.tsx
git commit -m "feat(frontend-next): Chip and Badge primitives"
```

---

### Task 4: `Segmented` и перевод `LanguageSwitch`

**Files:**
- Create: `src/components/ui/Segmented.tsx`, `src/components/ui/Segmented.test.tsx`
- Modify: `src/components/layout/LanguageSwitch.tsx:41-58` (обёртка и классы ссылок)

**Interfaces:**
- Produces:
  - `Segmented({ label: string; className?: string; children: ReactNode })` — `<div role="group" aria-label={label}>` с фоном-таблеткой
  - `segmentClass(active: boolean): string` — классы сегмента (сегменты — любые элементы: в `LanguageSwitch` это `<Link>`)

- [ ] **Step 1: Падающий тест**

`src/components/ui/Segmented.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Segmented, segmentClass } from './Segmented'

describe('Segmented', () => {
  it('is a labelled group', () => {
    render(
      <Segmented label="Язык интерфейса">
        <a href="/ru" className={segmentClass(true)}>
          Рус
        </a>
        <a href="/kk" className={segmentClass(false)}>
          Қаз
        </a>
      </Segmented>,
    )
    const group = screen.getByRole('group', { name: 'Язык интерфейса' })
    expect(group.className).toContain('rounded-full')
    expect(screen.getByRole('link', { name: 'Рус' }).className).toContain('bg-card')
    expect(screen.getByRole('link', { name: 'Қаз' }).className).toContain('text-muted')
  })
})
```

- [ ] **Step 2: Запустить и увидеть падение**

Run: `pnpm vitest run src/components/ui/Segmented.test.tsx`
Expected: FAIL — не найден `./Segmented`.

- [ ] **Step 3: Реализация**

`src/components/ui/Segmented.tsx`:

```tsx
import type { ReactNode } from 'react'

/** Переключатель-таблетка (RU/KZ). Сегменты — любые элементы с segmentClass */
export function Segmented({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={`flex rounded-full bg-surface p-0.5 ${className}`.trim()}>
      {children}
    </div>
  )
}

export function segmentClass(active: boolean) {
  return `flex h-9 items-center rounded-full px-3 text-sm font-medium transition-colors ${
    active ? 'bg-card text-ink shadow-[0_1px_2px_rgb(26_31_36/0.08)]' : 'text-muted hover:text-ink'
  }`
}
```

- [ ] **Step 4: Перевести `LanguageSwitch`**

В `src/components/layout/LanguageSwitch.tsx` добавить `import { Segmented, segmentClass } from '../ui/Segmented'`, заменить внешний `<div role="group" aria-label={t('nav.language')} className="…">…</div>` на `<Segmented label={t('nav.language')}>…</Segmented>`, а `className` у `<Link>` — на `className={segmentClass(active)}`. Логику (`choose`, `prefetch={false}`, `aria-current`, `hrefLang`) не трогать.

- [ ] **Step 5: Тесты**

Run: `pnpm vitest run src/components/ui/Segmented.test.tsx src/components/layout/Header.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS (тесты шапки ищут ссылки языка по роли `link` — не изменилось).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Segmented.tsx src/components/ui/Segmented.test.tsx src/components/layout/LanguageSwitch.tsx
git commit -m "feat(frontend-next): Segmented primitive, pill language switch"
```

---

### Task 5: `Icon`

**Files:**
- Create: `src/components/ui/Icon.tsx`, `src/components/ui/Icon.test.tsx`

**Interfaces:**
- Produces:
  - `type IconName = 'search' | 'grid' | 'chart' | 'close' | 'chevron-left' | 'chevron-right' | 'sliders' | 'basket' | 'alert'`
  - `Icon({ name: IconName; size?: number (24); className?: string; label?: string })` — без `label` декоративная (`aria-hidden`), с `label` — `role="img"` + `aria-label`.
  - Иконки категорий (молоко, хлеб…) добавляются в D4 в этот же словарь.

- [ ] **Step 1: Падающий тест**

`src/components/ui/Icon.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Icon } from './Icon'

describe('Icon', () => {
  it('is decorative by default', () => {
    const { container } = render(<Icon name="search" />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('width', '24')
    expect(svg).toHaveAttribute('stroke', 'currentColor')
    expect(svg.querySelector('path, circle, rect')).not.toBeNull()
  })

  it('is an image with a name when labelled', () => {
    render(<Icon name="close" label="Закрыть" size={20} />)
    const svg = screen.getByRole('img', { name: 'Закрыть' })
    expect(svg).not.toHaveAttribute('aria-hidden')
    expect(svg).toHaveAttribute('width', '20')
  })
})
```

- [ ] **Step 2: Запустить и увидеть падение**

Run: `pnpm vitest run src/components/ui/Icon.test.tsx`
Expected: FAIL — не найден `./Icon`.

- [ ] **Step 3: Реализация**

`src/components/ui/Icon.tsx`:

```tsx
import type { ReactNode } from 'react'

/** Линейные иконки 24×24, stroke 2, цвет — currentColor */
const PATHS = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  'chevron-left': <path d="m15 18-6-6 6-6" />,
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  sliders: (
    <>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  basket: (
    <>
      <path d="M3 9h18l-1.6 9.6a2 2 0 0 1-2 1.4H6.6a2 2 0 0 1-2-1.4L3 9Z" />
      <path d="m8 9 3-5M16 9l-3-5" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof PATHS

type IconProps = {
  name: IconName
  size?: number
  className?: string
  /** Есть подпись — иконка значимая (role="img"); нет — декоративная */
  label?: string
}

export function Icon({ name, size = 24, className, label }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {PATHS[name]}
    </svg>
  )
}
```

- [ ] **Step 4: Запустить тест**

Run: `pnpm vitest run src/components/ui/Icon.test.tsx && pnpm lint`
Expected: PASS, lint без предупреждений (`PATHS` не экспортируется — правило `only-export-components` не срабатывает).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Icon.tsx src/components/ui/Icon.test.tsx
git commit -m "feat(frontend-next): line icon set"
```

---

### Task 6: `Sheet` (нижняя шторка на `<dialog>`)

**Files:**
- Create: `src/components/ui/Sheet.tsx`, `src/components/ui/Sheet.test.tsx`
- Modify: `src/test/setup.ts` (заглушка `showModal`/`close` для jsdom)
- Modify: `src/i18n/ru.json`, `src/i18n/kk.json` (новый раздел `common`)
- Modify: `src/app/globals.css` (блокировка прокрутки под открытой шторкой)

**Interfaces:**
- Consumes: `Icon` (`name="close"`) из Task 5.
- Produces: `Sheet({ open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; testId?: string })`. Родитель хранит `open`; `onClose` вызывается при Esc, клике по затемнению и кнопке закрытия — родитель ставит `open=false`. Используется в D4 (`filters-sheet`, сортировка).

- [ ] **Step 1: i18n и заглушка jsdom**

В `src/i18n/ru.json` добавить верхнеуровневый раздел (после `"brand"`):

```json
"common": {
  "close": "Закрыть"
},
```

В `src/i18n/kk.json` — тот же раздел:

```json
"common": {
  "close": "Жабу"
},
```

В `src/test/setup.ts` после `installHistory()`:

```ts
// jsdom не реализует showModal/close у <dialog> — минимальная замена с событием close, как в браузере
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    if (!this.open) return
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}
```

- [ ] **Step 2: Падающий тест**

`src/components/ui/Sheet.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Sheet } from './Sheet'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Фильтры
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Фильтры" testId="filters-sheet" footer={<button type="button">Показать</button>}>
        <p>Тело шторки</p>
      </Sheet>
    </>
  )
}

const sheet = () => screen.getByTestId('filters-sheet') as HTMLDialogElement

describe('Sheet', () => {
  it('opens as a labelled dialog with body and footer', () => {
    render(<Harness />)
    expect(sheet().open).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
    expect(sheet().open).toBe(true)
    expect(sheet()).toHaveAccessibleName('Фильтры')
    expect(screen.getByText('Тело шторки')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Показать' })).toBeInTheDocument()
  })

  it('closes with the close button', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(sheet().open).toBe(false)
  })

  it('syncs parent state when the browser closes it (Esc) and can reopen', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
    // Esc: браузер сам закрывает dialog и шлёт close
    sheet().close()
    expect(sheet().open).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры', hidden: true }))
    expect(sheet().open).toBe(true)
  })

  it('closes on backdrop click but not on content click', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
    fireEvent.click(screen.getByText('Тело шторки'))
    expect(sheet().open).toBe(true)
    // Клик по затемнению приходит на сам <dialog>
    fireEvent.click(sheet())
    expect(sheet().open).toBe(false)
  })
})
```

- [ ] **Step 3: Запустить и увидеть падение**

Run: `pnpm vitest run src/components/ui/Sheet.test.tsx`
Expected: FAIL — не найден `./Sheet`.

- [ ] **Step 4: Реализация**

`src/components/ui/Sheet.tsx`:

```tsx
'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from './Icon'

type SheetProps = {
  open: boolean
  /** Esc, клик по затемнению, кнопка «Закрыть» — родитель ставит open=false */
  onClose: () => void
  title: string
  children: ReactNode
  /** Липкий низ: «Сбросить» / «Показать» — растягиваются поровну */
  footer?: ReactNode
  testId?: string
}

/** Нижняя шторка на нативном <dialog>: фокус-ловушка, Esc и возврат фокуса — от браузера */
export function Sheet({ open, onClose, title, children, footer, testId }: SheetProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-testid={testId}
      // close приходит и от Esc — так родитель узнаёт, что шторка закрыта
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="mx-0 mt-auto mb-0 max-h-[85dvh] w-full max-w-full flex-col rounded-t-2xl bg-card p-0 text-ink shadow-sheet backdrop:bg-ink/40 open:flex"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line py-1 pr-2 pl-4">
        <h2 id={titleId} className="text-h3">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="flex size-11 items-center justify-center rounded-full text-ink hover:bg-surface"
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
      {footer && (
        <div className="flex gap-2 border-t border-line px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] *:flex-1">{footer}</div>
      )}
    </dialog>
  )
}
```

В `src/app/globals.css` в конец `@layer base` добавить:

```css
  /* Под открытой шторкой страница не прокручивается */
  body:has(dialog[open]) {
    overflow: hidden;
  }
```

- [ ] **Step 5: Запустить тесты**

Run: `pnpm vitest run src/components/ui/Sheet.test.tsx`
Expected: PASS (4 теста). Если в тесте Esc повторное открытие не находит кнопку — проверить, что `onClose` ставит `open=false` (иначе эффект не вызовет `showModal`, т.к. `open` уже `true`).

- [ ] **Step 6: Полный прогон**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: всё зелёное.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/Sheet.tsx src/components/ui/Sheet.test.tsx src/test/setup.ts src/i18n/ru.json src/i18n/kk.json src/app/globals.css
git commit -m "feat(frontend-next): bottom Sheet on native dialog"
```

---

### Task 7: Проверка этапа и журнал

**Files:**
- Modify: `docs/context/06_FRONTEND_WORKLOG.md` (строка «Дизайн» в «Зафиксированных решениях», запись в «Журнал», «Следующий шаг»)

- [ ] **Step 1: Полная проверка**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: всё зелёное.

- [ ] **Step 2: Визуальная проверка**

Run: `pnpm start -p 3100` (в фоне), затем снять скриншоты `/ru`, `/ru/catalog`, `/ru/products/<id из src/mocks/products.json>` на ширине 390 и 1280 (Playwright, `PW_CHANNEL=chrome`, или вручную в браузере).
Expected: фон страниц белый (как до этапа); шапка и карточки белые; текст чуть мельче (15px); фокус по Tab — графитовая рамка; RU/KZ — таблетка; нигде нет серых «дыр» на месте прежде белых блоков. Временно открыть шторку нельзя (потребителей нет) — её поведение покрыто тестами; блокировку прокрутки проверить в D4.

- [ ] **Step 3: Обновить журнал**

В `docs/context/06_FRONTEND_WORKLOG.md`:
- строку «Дизайн» в «Зафиксированных решениях» дополнить: «Дизайн-код — `docs/superpowers/specs/2026-10-02-design-system-design.md` (токены `page`/`card`, шкала `text-*`, примитивы `components/ui/`: Button, Chip, Badge, Segmented, Icon, Sheet). Фокус — графит, не зелёный. Base 15px»;
- в «Журнал» — запись «Сессия 15 — 2026-10-0X (Дизайн D1. Токены и примитивы)»: что сделано, коммиты;
- «Следующий шаг» → «Дизайн D2. Карточка и полка — написать план по спеке §4 и выполнить».

- [ ] **Step 4: Commit**

```bash
git add docs/context/06_FRONTEND_WORKLOG.md
git commit -m "docs(frontend): worklog — design system D1 done"
```
