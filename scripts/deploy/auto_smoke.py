"""Bounded application smoke. Never prints bodies, voice, location or sessions."""
import hashlib
import json
import math
import urllib.parse
from auto_broker import http, require


class Smoke:
    def __init__(self, base, env, request=http):
        require(base in ['http://127.0.0.1:8080', 'https://api.aktau.market'], 'smoke_origin')
        self.base, self.env, self.request = base, env, request
        self.owned = set()

    def get(self, path, **kw):
        data, h = self.request(self.base + path, **kw)
        if self.base.startswith('https:'):
            require(h.get('cf-ray'), 'edge_evidence')
        return data

    def post(self, path, body):
        return self.get(path, method='POST', body=body, expected=201)

    def redis(self, operation, session):
        url = self.env.get('UPSTASH_REDIS_REST_URL', '')
        p = urllib.parse.urlparse(url)
        require(p.scheme == 'https' and p.netloc and not p.username and not p.password
                and not p.query and not p.fragment and p.path in ['', '/'], 'redis_url')
        key = 'voice-session:v1:' + hashlib.sha256(session.encode()).hexdigest()
        result, _ = self.request(url, method='POST', body=[operation, key],
                                headers={'Authorization': 'Bearer ' + self.env['UPSTASH_REDIS_REST_TOKEN']})
        require('error' not in result and 'result' in result, 'redis_command')
        return result['result']

    @staticmethod
    def product(p):
        offers = p['offers']
        require(offers and all(type(o['price']) is int and o['price'] > 0 for o in offers), 'usable_offers')
        prices = [o['price'] for o in offers]
        require(prices == sorted(prices) and p['minPrice'] == prices[0], 'offer_order_price')

    def result(self, response, mode, products, locations):
        require(response['status'] == 'result' and response['mode'] == mode, 'voice_mode')
        expected = products[:1 if mode == 'single' else 3]
        require(len(response['items']) == len(expected) and expected, 'voice_cardinality')
        for item, product in zip(response['items'], expected):
            require(item['name'] == product['name'] and item['imageUrl'] == product['imageUrl']
                    and item['price'] == product['minPrice'], 'voice_product_price')
            tied = [o for o in product['offers'] if o['price'] == product['minPrice']
                    and o['storeName'] == item['store']]
            require(tied, 'voice_store')
            nearest = []
            for o in tied:
                for location in locations:
                    if location['storeCode'] != o['storeCode']:
                        continue
                    lat1, lat2 = math.radians(self.lat), math.radians(float(location['latitude']))
                    dl = math.radians(float(location['latitude'])-self.lat)
                    dn = math.radians(float(location['longitude'])-self.lon)
                    a = math.sin(dl/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dn/2)**2
                    distance = math.floor(6371000 * 2 * math.asin(min(1, math.sqrt(a))) + .5)
                    nearest.append((distance, location['address']))
            require(nearest, 'voice_location')
            distance, address = min(nearest)
            require(item['address'] == address and item['distanceMeters'] == distance, 'voice_nearest')
        items = response['items']
        if mode == 'single':
            i = items[0]
            d = i['distanceMeters']
            word = 'метров' if 11 <= d % 100 <= 14 else 'метр' if d % 10 == 1 else 'метра' if d % 10 in [2, 3, 4] else 'метров'
            speech = f"Самое выгодное предложение: {i['name']} за {i['price']} тенге в {i['store']}. Ближайшая точка — {i['address']}, примерно {d} {word}."
        else:
            speech = 'Нашёл один вариант.' if len(items) == 1 else f'Нашёл {len(items)} варианта.'
            for word, i in zip(['Первый', 'Второй', 'Третий'], items):
                speech += f" {word} — {i['name']} за {i['price']} тенге в {i['store']}."
        require(response['speech'] == speech, 'voice_speech')

    def run(self):
        try:
            require(self.get('/health/live') == {'status': 'ok'}, 'live')
            require(self.get('/health/ready') == {'status': 'ready'}, 'ready')
            categories = self.get('/api/categories')
            slugs = [c['slug'] for c in categories]
            require(slugs == sorted(slugs) and 'milk' in slugs and 'other' not in slugs, 'category_visibility')
            filters = self.get('/api/categories/milk/filters')['filters']
            options = {f['key']: f.get('options', []) for f in filters}
            require(1000 in options.get('volumeMl', []) and 3.2 in options.get('fatPercent', []), 'milk_current_options')
            products = self.get('/api/products?category=milk&volumeMl=1000&fatPercent=3.2&sort=price_asc&limit=3')
            require(products, 'milk_test_set')
            for p in products:
                self.product(p)
            for sort in ['price_asc', 'price_desc', 'name_asc']:
                page = self.get('/api/products?category=milk&sort=' + sort + '&limit=24&offset=0')
                require(page, 'catalog_page')
                for p in page:
                    self.product(p)
            self.get('/api/products?category=milk&search=' + urllib.parse.quote(products[0]['name']) + '&limit=3')
            self.get('/api/products?category=milk&limit=24&offset=24')
            detail = self.get('/api/products/' + urllib.parse.quote(products[0]['id'], safe=''))
            self.product(detail)
            require(detail == products[0], 'detail_parity')
            self.get('/api/products?limit=101', expected=400)
            self.get('/api/products?category=milk&unknownFilter=1', expected=400)
            self.get('/api/products?category=milk&volumeMl=invalid', expected=400)
            dashboard = self.get('/api/dashboard')
            require(dashboard['locations'] and dashboard['baskets'], 'dashboard')
            require(all(i['categoryName'] == 'Сахар' for b in dashboard['baskets'] for i in b['items']
                        if i['categorySlug'] == 'sugar'), 'sugar_label')
            self.lat, self.lon = float(dashboard['locations'][0]['latitude']), float(dashboard['locations'][0]['longitude'])
            origin = 'https://aktau.market'
            _, h = self.request(self.base + '/api/categories', headers={'Origin': origin})
            require(h.get('Access-Control-Allow-Origin') == origin, 'cors_allowed')
            self.get('/api/categories', headers={'Origin': 'https://denied.invalid'}, expected=403)
            _, h = self.request(self.base + '/api/voice/start', method='OPTIONS', expected=204,
                                headers={'Origin': origin, 'Access-Control-Request-Method': 'POST',
                                         'Access-Control-Request-Headers': 'content-type'})
            require(h.get('Access-Control-Allow-Origin') == origin and 'POST' in h.get('Access-Control-Allow-Methods', ''), 'cors_preflight')
            for text, mode in [('Самое дешёвое молоко 1 литр 3.2 процента', 'single'),
                               ('Найди молоко 1 литр 3.2 процента', 'list')]:
                r = self.post('/api/voice/start', {'text': text, 'latitude': self.lat, 'longitude': self.lon})
                self.result(r, mode, products, dashboard['locations'])
            r = self.post('/api/voice/start', {'text': 'Самое дешёвое молоко', 'latitude': self.lat, 'longitude': self.lon})
            require(r['status'] == 'needs_clarification', 'clarification')
            sid = r['sessionId']
            require(isinstance(sid, str) and 0 < len(sid) < 1024, 'session_shape')
            self.owned.add(sid)
            require(self.redis('GET', sid) is not None and 0 < self.redis('TTL', sid) <= 600, 'session_ttl')
            r = self.post('/api/voice/continue', {'sessionId': sid, 'text': '1 литр 3.2 процента'})
            self.result(r, 'single', products, dashboard['locations'])
            require(self.redis('GET', sid) is None, 'session_deleted')
            self.owned.remove(sid)
        finally:
            for sid in self.owned:
                self.redis('DEL', sid)
