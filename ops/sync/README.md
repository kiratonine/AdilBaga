# Регулярный sync цен (systemd)

Запускает `pipeline/scripts/daily-sync.sh` дважды в день: 06:00 и 18:00 по Актау (`01:00` и `13:00` UTC).
Любая ошибка скрапера или ingest останавливает скрипт (`set -e`), юнит получает статус `failed`, а сайт остаётся на последнем опубликованном snapshot.

Ingestion не входит в API-релиз (`deploy/`) и ставится отдельно.

## Требования на VPS

- checkout репозитория в `/opt/adilbaga`, Node + pnpm (`pnpm install` в `pipeline/`), Go;
- системный пользователь `aktau-sync` с доступом на чтение/запись в `/opt/adilbaga/data`;
- без `GEMINI_API_KEY*` — sync не использует LLM.

## Установка

```bash
sudo cp ops/sync/aktau-sync.service ops/sync/aktau-sync.timer /etc/systemd/system/
sudo install -m 600 -o aktau-sync ops/sync/aktau-sync.env.example /etc/aktau-sync.env
sudoedit /etc/aktau-sync.env     # INGEST_DATABASE_URL, REVALIDATE_HMAC_SECRET
sudo systemctl daemon-reload && sudo systemctl enable --now aktau-sync.timer
```

## Эксплуатация

```bash
systemctl list-timers aktau-sync.timer   # ближайший запуск
sudo systemctl start aktau-sync          # ручной запуск
journalctl -u aktau-sync -n 200          # логи
systemctl status aktau-sync              # status=0/SUCCESS или failed
```

Разбор ошибок — `docs/data/SYNC_RUNBOOK.md §4`.
