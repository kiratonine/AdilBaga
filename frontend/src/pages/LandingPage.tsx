import type { ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { LanguageSwitch } from '../components/layout/LanguageSwitch'
import { formatPrice } from '../lib/format'
import { storeColor } from '../lib/stores'
import { useDocumentTitle } from '../lib/useDocumentTitle'

type Item = { title: string; text: string }
type Line = { from: 'user' | 'siri'; text: string }

/** Иллюстрация для hero — цены из примера ТЗ, а не из снимка */
const EXAMPLE_OFFERS = [
  { store: 'Dina', code: 'DINA', price: 570 },
  { store: 'Dana', code: 'DANA', price: 620 },
  { store: 'Fix Price', code: 'FIX_PRICE', price: 650 },
]

const primaryLink =
  'inline-flex h-12 items-center rounded-[var(--radius-control)] bg-ink px-5 font-medium text-page transition-colors hover:bg-ink/85'
const secondaryLink =
  'inline-flex h-12 items-center rounded-[var(--radius-control)] border border-line px-5 font-medium transition-colors hover:border-ink'

export function LandingPage() {
  const { t } = useTranslation()
  useDocumentTitle()

  const problems = t('landing.problems', { returnObjects: true }) as Item[]
  const steps = t('landing.steps', { returnObjects: true }) as Item[]

  return (
    <>
      {/* Шапки на лендинге нет — остаётся только выбор языка */}
      <div className="flex justify-end">
        <LanguageSwitch />
      </div>
      <section aria-labelledby="landing-title" className="grid items-center gap-10 pt-4 md:grid-cols-[1.15fr_1fr] md:gap-14 md:pt-10">
        <div>
          <p className="text-sm font-medium text-muted">
            {t('landing.eyebrow')} · {t('landing.meaning')}
          </p>
          <h1
            id="landing-title"
            className="mt-4 font-display text-[34px] leading-[1.08] font-extrabold tracking-[-0.03em] text-balance md:text-[52px]"
          >
            {t('landing.title')}
          </h1>
          <p className="mt-5 max-w-[46ch] text-lg text-muted">{t('landing.lead')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/catalog" className={primaryLink}>
              {t('landing.toCatalog')}
            </Link>
            <Link to="/dashboard" className={secondaryLink}>
              {t('landing.toDashboard')}
            </Link>
          </div>
        </div>
        <ExampleCard />
      </section>

      <Section id="problem" label={t('landing.problemLabel')} title={t('landing.problemTitle')}>
        <ul className="grid gap-4 md:grid-cols-3">
          {problems.map((p) => (
            <li key={p.title} className="rounded-[var(--radius-card)] bg-surface p-6">
              <h3 className="font-semibold">{p.title}</h3>
              <p className="mt-2 text-muted">{p.text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="how" label={t('landing.howLabel')} title={t('landing.howTitle')}>
        <ol className="grid gap-8 md:grid-cols-3 md:gap-6">
          {steps.map((s, i) => (
            <li key={s.title} className="border-t border-ink pt-5">
              <span className="font-display text-sm font-bold text-muted tabular">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <SiriSection />

      <Section id="audience" label={t('landing.audienceLabel')} title={t('landing.audienceTitle')}>
        <div className="grid gap-4 md:grid-cols-2">
          <AudienceCard title={t('landing.residentsTitle')} text={t('landing.residentsText')} to="/catalog" cta={t('landing.toCatalog')} />
          <AudienceCard title={t('landing.cityTitle')} text={t('landing.cityText')} to="/dashboard" cta={t('landing.toDashboard')} />
        </div>
      </Section>
    </>
  )
}

function Section({ id, label, title, children }: { id: string; label: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="mt-20 md:mt-28">
      <p className="text-sm font-medium text-muted">{label}</p>
      <h2 id={`${id}-title`} className="mt-2 max-w-[24ch] text-[26px] leading-tight font-semibold tracking-[-0.01em] md:text-[32px]">
        {title}
      </h2>
      <div className="mt-8">{children}</div>
    </section>
  )
}

/** Одна позиция — три сети: проблема на одном примере, минимальная цена — акцентом */
function ExampleCard() {
  const { t } = useTranslation()

  return (
    <figure data-testid="landing-example" className="rounded-[var(--radius-card)] border border-line p-5 shadow-[0_12px_40px_-24px_rgb(26_31_36/0.35)] sm:p-6">
      <figcaption className="text-lg font-semibold">{t('landing.exampleProduct')}</figcaption>
      <ul className="mt-5 flex flex-col gap-2">
        {EXAMPLE_OFFERS.map((o, i) => (
          <li
            key={o.code}
            className={`flex items-center justify-between rounded-[var(--radius-control)] px-3 py-3 ${i === 0 ? 'bg-accent-soft' : ''}`}
          >
            <span className="flex items-center gap-2.5">
              <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: storeColor(o.code) }} />
              <span className="font-medium">{o.store}</span>
              {i === 0 && <span className="text-sm font-medium text-accent">{t('landing.exampleCheapest')}</span>}
            </span>
            <span className={`font-display font-bold tabular ${i === 0 ? 'text-xl text-accent' : 'text-ink'}`}>
              {formatPrice(o.price)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-line pt-4 text-ink">
        <Trans i18nKey="landing.exampleSaving" components={{ price: <span className="font-semibold whitespace-nowrap text-accent tabular" /> }} />
      </p>
    </figure>
  )
}

function SiriSection() {
  const { t } = useTranslation()
  const points = t('landing.siriPoints', { returnObjects: true }) as string[]
  const dialog = t('landing.siriDialog', { returnObjects: true }) as Line[]

  return (
    <Section id="siri" label={t('landing.siriLabel')} title={t('landing.siriTitle')}>
      <div className="grid gap-10 md:grid-cols-2 md:gap-14">
        <div>
          <p className="max-w-[46ch] text-lg">{t('landing.siriText')}</p>
          <ul className="mt-6 flex flex-col gap-3">
            {points.map((p) => (
              <li key={p} className="flex gap-3">
                <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-ink" />
                <span className="text-muted">{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <figure data-testid="siri-dialog" className="rounded-[var(--radius-card)] bg-surface p-5 sm:p-6">
          <figcaption className="text-xs font-medium text-muted">{t('landing.siriExample')}</figcaption>
          <ol className="mt-4 flex flex-col gap-2.5">
            {dialog.map((line, i) => (
              <li key={i} className={`flex ${line.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <p
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                    line.from === 'user' ? 'rounded-br-md bg-ink text-page' : 'rounded-bl-md bg-page text-ink'
                  }`}
                >
                  <span className="sr-only">{line.from === 'user' ? t('landing.you') : t('landing.siri')}: </span>
                  {line.text}
                </p>
              </li>
            ))}
          </ol>
        </figure>
      </div>
    </Section>
  )
}

function AudienceCard({ title, text, to, cta }: { title: string; text: string; to: string; cta: string }) {
  return (
    <div className="flex flex-col items-start rounded-[var(--radius-card)] border border-line p-6 sm:p-8">
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="mt-2 max-w-[44ch] flex-1 text-muted">{text}</p>
      <Link to={to} className="mt-6 font-medium text-accent underline underline-offset-4">
        {cta} →
      </Link>
    </div>
  )
}
