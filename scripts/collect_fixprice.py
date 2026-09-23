import os
import sys
import time
import json
import re
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

SNAPSHOT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "snapshots")
os.makedirs(SNAPSHOT_DIR, exist_ok=True)
SNAPSHOT_FILE = os.path.join(SNAPSHOT_DIR, "fixprice_aktau.json")

captured_api_products = []

def handle_response(response):
    try:
        url = response.url
        content_type = response.headers.get("content-type", "")
        if "json" in content_type and any(k in url for k in ["product", "catalog", "buyer", "goods"]):
            data = response.json()
            if isinstance(data, dict):
                # Check for products list
                items = data.get("products") or data.get("items") or data.get("data")
                if isinstance(items, list) and len(items) > 0:
                    print(f"Captured {len(items)} products from API: {url[:80]}")
                    for item in items:
                        if isinstance(item, dict):
                            captured_api_products.append(item)
    except Exception:
        pass

def main():
    print("=" * 60)
    print("FIX PRICE AKTAU DATA COLLECTOR")
    print("=" * 60)
    print("Запускаю Google Chrome...")
    print("Пожалуйста, если появится капча Cloudflare, кликните галочку.")
    print("Если сайт предложит выбрать город — выберите 'Актау'.")
    print("-" * 60)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--start-maximized"
            ]
        )
        context = browser.new_context(
            no_viewport=True,
            locale="ru-RU",
            timezone_id="Asia/Aqtau"
        )
        page = context.new_page()
        page.on("response", handle_response)

        # 1. Open Fix Price catalog
        target_url = "https://fix-price.kz/ru/catalog/produkty-i-napitki"
        print(f"Открываю страницу: {target_url}")
        page.goto(target_url, wait_until="domcontentloaded")

        # 2. Wait until Cloudflare is passed (up to 120 seconds)
        print("Ожидание прохождения проверки безопасности (кликните галочку на экране, если нужно)...")
        passed = False
        for sec in range(120):
            time.sleep(1)
            title = page.title()
            if sec % 5 == 0:
                print(f"[{sec}s] Текущий заголовок: '{title}'")
            if any(term in title.lower() for term in ["fix price", "продукты", "каталог", "товары"]):
                print(f"УСПЕХ! Проверка безопасности пройдена! Заголовок: {title}")
                passed = True
                break

        if not passed:
            print("Таймаут ожидания прохождения проверки. Сохраняю скриншот...")
            page.screenshot(path="fp_timeout.png")
            browser.close()
            return

        # 3. Give 5 seconds for user to confirm city Aktau if modal appears
        print("Проверяю выбор города...")
        time.sleep(3)
        try:
            # Check for city selector button or modal
            city_btn = page.locator("button:has-text('Актау'), a:has-text('Актау'), [data-city*='Актау']")
            if city_btn.count() > 0:
                print("Город Актау уже активен!")
            else:
                # Look for city change button
                print("Если на экране открыто окно выбора города — выберите Актау.")
        except Exception as e:
            print("City check note:", e)

        # 4. Scroll down to trigger lazy loading of products
        print("Прокручиваю каталог 'Продукты и напитки' для подгрузки всех товаров...")
        for scroll_idx in range(6):
            page.evaluate("window.scrollBy(0, 1000)")
            time.sleep(1.5)

        # Also navigate to key food subcategories if needed
        subcategories = [
            "https://fix-price.kz/ru/catalog/produkty-i-napitki/bakaleya",
            "https://fix-price.kz/ru/catalog/produkty-i-napitki/chay-kofe-kakao",
            "https://fix-price.kz/ru/catalog/produkty-i-napitki/konditerskie-izdeliya"
        ]

        for sub_url in subcategories:
            try:
                print(f"Перехожу в подкатегорию: {sub_url}...")
                page.goto(sub_url, wait_until="domcontentloaded")
                time.sleep(3)
                for _ in range(4):
                    page.evaluate("window.scrollBy(0, 1000)")
                    time.sleep(1.2)
            except Exception as e:
                print(f"Error loading {sub_url}: {e}")

        # 5. Extract products from DOM
        print("Извлекаю товары со страницы...")
        dom_products = page.evaluate("""() => {
            const results = [];
            // Common selectors for Fix Price product cards
            const cards = document.querySelectorAll('[data-product-id], .product__wrapper, .product-card, .card, [class*="ProductCard"]');
            cards.forEach(card => {
                try {
                    const titleEl = card.querySelector('.title, .product__title, [class*="title"], h3, a[title]');
                    const priceEl = card.querySelector('.price, .product__price, [class*="price"], .cost');
                    const imgEl = card.querySelector('img');
                    const linkEl = card.querySelector('a[href*="/catalog/"]') || card.querySelector('a');
                    
                    const name = titleEl ? titleEl.innerText.trim() : (imgEl ? imgEl.alt : '');
                    const priceText = priceEl ? priceEl.innerText.replace(/[^0-9]/g, '') : '';
                    const price = priceText ? parseInt(priceText, 10) : 0;
                    const imageUrl = imgEl ? (imgEl.src || imgEl.getAttribute('data-src') || '') : '';
                    const url = linkEl ? linkEl.href : '';
                    const id = card.getAttribute('data-product-id') || (url ? url.split('/').filter(Boolean).pop() : String(Math.random()));

                    if (name && price > 0) {
                        results.push({
                            id: String(id),
                            name: name,
                            price: price,
                            imageUrl: imageUrl,
                            url: url
                        });
                    }
                } catch(e) {}
            });
            return results;
        }""")
        print(f"Найдено товаров через DOM: {len(dom_products)}")

        # 6. Unify captured data
        all_unified = []
        seen_ids = set()

        # From API responses
        for p in captured_api_products:
            pid = str(p.get("id") or p.get("sku") or p.get("productId") or "")
            if not pid or pid in seen_ids:
                continue
            seen_ids.add(pid)
            title = p.get("title") or p.get("name") or ""
            price = p.get("price") or 0
            if isinstance(price, str):
                price = int(re.sub(r'[^0-9]', '', price) or 0)
            elif isinstance(price, float):
                price = int(price)
            
            image = p.get("image") or p.get("imageUrl") or ""
            if isinstance(image, dict):
                image = image.get("src") or image.get("url") or ""
            elif isinstance(image, list) and len(image) > 0:
                first = image[0]
                image = first.get("src") or first.get("url") if isinstance(first, dict) else str(first)

            all_unified.append({
                "storeCode": "FIX_PRICE",
                "sourceProductId": pid,
                "sourceUrl": f"https://fix-price.kz/ru/catalog/{p.get('url', '')}" if p.get('url') else "https://fix-price.kz/ru/catalog",
                "name": title,
                "brand": p.get("brand", {}).get("name") if isinstance(p.get("brand"), dict) else p.get("brand"),
                "category": p.get("category", {}).get("name") if isinstance(p.get("category"), dict) else "Продукты и напитки",
                "price": price,
                "oldPrice": p.get("oldPrice"),
                "imageUrl": image,
                "rawPayload": p
            })

        # From DOM extraction
        for dp in dom_products:
            pid = str(dp["id"])
            if pid in seen_ids:
                continue
            seen_ids.add(pid)
            all_unified.append({
                "storeCode": "FIX_PRICE",
                "sourceProductId": pid,
                "sourceUrl": dp.get("url") or "https://fix-price.kz/ru/catalog",
                "name": dp["name"],
                "category": "Продукты и напитки",
                "price": dp["price"],
                "imageUrl": dp.get("imageUrl"),
                "rawPayload": dp
            })

        print(f"\nВсего собрано уникальных товаров Fix Price: {len(all_unified)}")
        
        # Save snapshot
        with open(SNAPSHOT_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "store": "FIX_PRICE",
                "city": "Aktau",
                "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "totalCount": len(all_unified),
                "products": all_unified
            }, f, ensure_ascii=False, indent=2)

        print(f"Снапшот успешно сохранён в: {SNAPSHOT_FILE}")
        print("Готово! Закрываю браузер.")
        time.sleep(2)
        browser.close()

if __name__ == "__main__":
    main()
