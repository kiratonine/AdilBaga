import copy
import unittest
from auto_smoke import Smoke
from auto_broker import Blocked


class SmokeTests(unittest.TestCase):
    def setUp(self):
        self.smoke = Smoke('http://127.0.0.1:8080', {})
        self.smoke.lat, self.smoke.lon = 0, 0
        self.products = [dict(name='synthetic', imageUrl=None, minPrice=100,
                              offers=[dict(price=100, storeName='DINA', storeCode='DINA')])]
        self.locations = [dict(storeCode='DINA', address='synthetic_address', latitude=0, longitude=0)]
        self.result = dict(status='result', mode='single', items=[dict(name='synthetic', imageUrl=None,
                           price=100, store='DINA', address='synthetic_address', distanceMeters=0)],
                           speech='Самое выгодное предложение: synthetic за 100 тенге в DINA. Ближайшая точка — synthetic_address, примерно 0 метров.')

    def test_exact_result_against_catalog_truth(self):
        self.smoke.result(self.result, 'single', self.products, self.locations)

    def test_price_store_location_speech_invalid_fails(self):
        for key, value in [('price', 999), ('store', 'UNKNOWN'), ('address', 'wrong'), ('distanceMeters', 100), ('name', 'fabricated')]:
            with self.subTest(key=key):
                response = copy.deepcopy(self.result)
                response['items'][0][key] = value
                with self.assertRaises(Blocked): self.smoke.result(response, 'single', self.products, self.locations)
        response = copy.deepcopy(self.result)
        response['speech'] = 'wrong'
        with self.assertRaises(Blocked): self.smoke.result(response, 'single', self.products, self.locations)

    def test_usable_offer_order_is_not_relaxed(self):
        p = dict(minPrice=100, offers=[dict(price=100), dict(price=200)])
        self.smoke.product(p)
        for prices in [[200, 100], [0, 100], [-100, 100]]:
            with self.assertRaises(Blocked): self.smoke.product(dict(minPrice=prices[0], offers=[dict(price=x) for x in prices]))

    def test_redis_key_privacy_and_ttl_read(self):
        captured = []
        def request(*args, **kw):
            captured.append(kw['body'])
            return {'result':600}, {}
        smoke = Smoke('http://127.0.0.1:8080', {'UPSTASH_REDIS_REST_URL':'https://unit.invalid',
                      'UPSTASH_REDIS_REST_TOKEN':'synthetic'}, request)
        self.assertEqual(smoke.redis('TTL', 'synthetic_session'), 600)
        self.assertNotIn('synthetic_session', captured[0][1])
        self.assertRegex(captured[0][1], r'^voice-session:v1:[a-f0-9]{64}$')

    def test_failure_cleans_only_owned_session(self):
        self.smoke.owned = {'owned_synthetic'}
        self.smoke.get = lambda *_: (_ for _ in ()).throw(Blocked('HTTP500'))
        commands = []
        self.smoke.redis = lambda op, sid: commands.append((op, sid))
        with self.assertRaises(Blocked): self.smoke.run()
        self.assertEqual(commands, [('DEL', 'owned_synthetic')])


if __name__ == '__main__': unittest.main()
