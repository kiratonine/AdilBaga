export interface NormalizedAttributes {
  volumeMl?: number | null;
  weightGrams?: number | null;
  fatPercent?: number | null;
  packageCount?: number | null;
  breadType?: string | null;
  sliced?: boolean | null;
  brand?: string | null;
  productType?: string | null;
  teaType?: 'green' | 'black' | null;
  flavorVariant?: string | null;
  oilVariant?: string | null;
  cleanedName: string;
}

export class NormalizerService {
  private readonly brandAliases: { canonical: string; patterns: RegExp[] }[] = [
    { canonical: 'Nemoloko', patterns: [/nemoloko/i, /немолоко/i] },
    { canonical: 'FoodMaster', patterns: [/food\s*master/i, /фуд\s*мастер/i, /фудмастер/i] },
    { canonical: 'Рогачевъ', patterns: [/рогачев/i, /рогачевъ/i] },
    { canonical: 'Слобода', patterns: [/слобода/i] },
    { canonical: 'Золотая Семечка', patterns: [/золотая\s*семечка/i] },
    { canonical: 'Затея', patterns: [/затея/i] },
    { canonical: 'Шедевр', patterns: [/шедевр/i] },
    { canonical: 'Русский Сахар', patterns: [/русский\s*сахар/i] },
    { canonical: 'Цесна', patterns: [/цесна/i, /tsesna/i] },
    { canonical: 'Dr.Korner', patterns: [/dr\.?\s*korner/i, /доктор\s*кернер/i, /корнер/i] },
    { canonical: 'Greenfield', patterns: [/greenfield/i, /гринфилд/i] },
    { canonical: 'Tess', patterns: [/tess/i, /тесс/i] },
    { canonical: 'Пиала', patterns: [/пиала\s*gold/i, /пиала/i] },
    { canonical: 'Петропавловское', patterns: [/петропавловск\w*/i] },
    { canonical: 'Айна', patterns: [/айна/i, /айналайын/i] },
    { canonical: 'Күнделік', patterns: [/кунделик/i, /күнделік/i] },
    { canonical: 'Promo', patterns: [/promo/i, /промо/i] },
    { canonical: 'Шалун', patterns: [/шалун/i] },
    { canonical: 'Пекарь', patterns: [/пекарь/i] },
    { canonical: 'Русский Продукт', patterns: [/русский\s*продукт/i] },
    { canonical: 'Маслозавод №1', patterns: [/маслозавод\s*(?:№|no)?\s*1/i] },
    { canonical: 'Oleina', patterns: [/oleina/i, /олейна/i] },
    { canonical: 'Магаш', patterns: [/магаш/i, /magash/i] },
    { canonical: 'Алтын Дан', patterns: [/алтын\s*дан/i] },
    { canonical: 'Нур', patterns: [/хлеб.*нур/i, /"нур"/i] },
    { canonical: 'Bionan', patterns: [/bionan/i, /бионан/i] },
    { canonical: 'АкМаржан', patterns: [/акмаржан/i, /ак-маржан/i] },
    { canonical: 'Баракат', patterns: [/баракат/i] },
    { canonical: 'Янтарь', patterns: [/янтарь/i] },
    { canonical: 'Домик в деревне', patterns: [/домик\s*в\s*деревне/i] },
    { canonical: 'Простоквашино', patterns: [/простоквашино/i] },
    { canonical: 'Деревенское', patterns: [/деревенск\w*/i] },
    { canonical: 'Одари', patterns: [/одари/i] },
    { canonical: 'Околица', patterns: [/околица/i] },
    { canonical: 'Милоко', patterns: [/милоко/i] },
    { canonical: 'Милково', patterns: [/милково/i] },
    { canonical: 'Моё', patterns: [/моё/i, /мое/i] },
    { canonical: 'Кубанский Маслодел', patterns: [/кубанский\s*маслодел/i] },
    { canonical: 'Достык', patterns: [/достык/i, /dostyk/i] },
    { canonical: 'Савушкин', patterns: [/савушкин/i, /савушкин\s*продукт/i] },
    { canonical: 'ЭкоНива', patterns: [/эконива/i, /эко\s*нива/i, /ekoniva/i] },
    { canonical: 'Царь', patterns: [/царь/i, /цар/i] },
    { canonical: 'Barilla', patterns: [/barilla/i, /барилла/i] },
    { canonical: 'Макфа', patterns: [/макфа/i, /makfa/i] },
    { canonical: 'DEP', patterns: [/\bdep\b/i, /\bдеп\b/i] },
    { canonical: 'Новый День', patterns: [/новый\s*день/i] },
    { canonical: '3 Желания', patterns: [/3\s*желания/i, /три\s*желания/i] },
    { canonical: 'Акнек', patterns: [/акнек/i, /aknek/i] },
    { canonical: 'Тахир', patterns: [/тахир/i, /tahir/i] },
    { canonical: 'Чудо', patterns: [/\bчудо\b/i] },
    { canonical: 'Ehrmann', patterns: [/ehrmann/i, /эрманн/i, /эрман/i] },
    { canonical: 'Даниссимо', patterns: [/даниссимо/i, /danissimo/i] },
    { canonical: 'Жасмин', patterns: [/жасмин/i, /jasmin/i] },
    { canonical: 'Анвар', patterns: [/анвар/i, /anvar/i] },
    { canonical: 'Baraka', patterns: [/baraka/i, /барака/i] },
    { canonical: 'Alpro', patterns: [/alpro/i, /альпро/i] },
    { canonical: 'Масленково', patterns: [/масленково/i] }
  ];

  public normalize(rawName: string, knownBrand?: string): NormalizedAttributes {
    if (!rawName) {
      return { cleanedName: '' };
    }

    // 1. Text normalization
    let clean = rawName
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/["'«»„“]/g, ' ')
      .replace(/(\d+),(\d+)/g, '$1.$2') // Comma decimals to dot: 3,2 -> 3.2
      .replace(/\s+/g, ' ')
      .trim();

    // 2. Volume extraction
    let volumeMl: number | null = null;
    const lMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:л|l|литр\w*)/);
    if (lMatch?.[1]) {
      const val = parseFloat(lMatch[1]);
      if (val > 0 && val < 50) {
        volumeMl = Math.round(val * 1000);
      }
    } else {
      const mlMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:мл|ml)/);
      if (mlMatch?.[1]) {
        volumeMl = Math.round(parseFloat(mlMatch[1]));
      }
    }

    // 3. Weight extraction
    let weightGrams: number | null = null;
    const kgMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:кг|kg|килограмм\w*)/);
    if (kgMatch?.[1]) {
      const val = parseFloat(kgMatch[1]);
      if (val > 0 && val < 50) {
        weightGrams = Math.round(val * 1000);
      }
    } else {
      const gMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:г|g|гр|грамм\w*)/);
      if (gMatch?.[1]) {
        weightGrams = Math.round(parseFloat(gMatch[1]));
      }
    }

    // 4. Fat percentage extraction
    let fatPercent: number | null = null;
    const fatMatch = clean.match(/(\d+(?:\.\d+)?)\s*%/);
    if (fatMatch?.[1]) {
      const val = parseFloat(fatMatch[1]);
      if (val >= 0.1 && val <= 99.9) {
        fatPercent = val;
      }
    }

    // 5. Package count
    let packageCount: number | null = null;
    const countMatch = clean.match(/(\d+)\s*(?:шт|пак|пакетик\w*)/);
    if (countMatch?.[1]) {
      packageCount = parseInt(countMatch[1], 10);
    }

    // 6. Bread attributes
    let breadType: string | null = null;
    if (clean.includes('ржан') || clean.includes('бородинск')) {
      breadType = 'rye';
    } else if (clean.includes('пшеничн') || clean.includes('белый') || clean.includes('формов')) {
      breadType = 'white';
    } else if (clean.includes('лепешк')) {
      breadType = 'flatbread';
    } else if (clean.includes('батон')) {
      breadType = 'baton';
    } else if (clean.includes('хлебц')) {
      breadType = 'crispbread';
    }

    const sliced = clean.includes('нарез') ? true : null;

    // 7. Brand canonicalization
    let detectedBrand: string | null = null;
    if (knownBrand) {
      detectedBrand = this.canonicalizeBrand(knownBrand);
    }
    if (!detectedBrand) {
      for (const entry of this.brandAliases) {
        if (entry.patterns.some(p => p.test(clean))) {
          detectedBrand = entry.canonical;
          break;
        }
      }
    }

    // 8. Product type detection
    const productType = this.detectProductType(clean);

    // 9. Tea type detection
    let teaType: 'green' | 'black' | null = null;
    if (productType === 'tea' || clean.includes('чай')) {
      if (clean.includes('зелен') || clean.includes('green')) {
        teaType = 'green';
      } else if (clean.includes('черн') || clean.includes('black')) {
        teaType = 'black';
      }
    }

    // 10. Flavor variant & Oil variant detection
    const flavorVariant = this.detectFlavorVariant(clean);
    const oilVariant = this.detectOilVariant(clean);

    return {
      volumeMl,
      weightGrams,
      fatPercent,
      packageCount,
      breadType,
      sliced,
      brand: detectedBrand,
      productType,
      teaType,
      flavorVariant,
      oilVariant,
      cleanedName: clean
    };
  }

  public detectFlavorVariant(clean: string): string | null {
    if (clean.includes('ваниль') || clean.includes('vanilla')) return 'vanilla';
    if (clean.includes('шоколад') || clean.includes('chocolate')) return 'chocolate';
    if (clean.includes('клубник') || clean.includes('strawberry')) return 'strawberry';
    if ((clean.includes('банан') || clean.includes('banana')) && !clean.startsWith('банан')) return 'banana';
    if (clean.includes('вишн') || clean.includes('cherry')) return 'cherry';
    if (clean.includes('малин') || clean.includes('raspberry')) return 'raspberry';
    if (clean.includes('персик') || clean.includes('peach')) return 'peach';
    if (clean.includes('кокос') || clean.includes('coconut')) return 'coconut';
    if (clean.includes('ягод') || clean.includes('лесн') || clean.includes('berry')) return 'berries';
    if (clean.includes('карамел') || clean.includes('caramel')) return 'caramel';
    if (clean.includes('классическ') || clean.includes('classic')) return 'classic';
    return null;
  }

  public detectOilVariant(clean: string): string | null {
    if (!clean.includes('масло') && !clean.includes('масла') && !clean.includes('oleina') && !clean.includes('слобода')) {
      return null;
    }

    const hasOlive = clean.includes('оливков') || clean.includes('olive');
    const hasMix = clean.includes('микс') || clean.includes('mix') || clean.includes('купаж') || clean.includes('с добавлением');
    const hasSunflower = clean.includes('подсолнеч') || clean.includes('күнбағыс');
    const hasCorn = clean.includes('кукуруз');

    if (hasOlive && (hasSunflower || hasMix)) return 'sunflower_olive_mix';
    if (hasOlive) return 'olive';
    if (hasCorn) return 'corn';
    if (hasSunflower) return 'sunflower';
    if (hasMix) return 'mix';
    return null;
  }

  public detectProductType(clean: string): string | null {
    // 0. Condiments, Sauces & Confectionery
    if (clean.includes('майонез')) return 'mayonnaise';
    if (clean.includes('сушк') || clean.includes('печень') || clean.includes('пряник') || clean.includes('вафл') || clean.includes('торт') || clean.includes('пирог') || clean.includes('кекс')) return 'bakery_sweet';

    // 1. Bread & Bakery (checked before dairy so "хлеб на кефире" is bread)
    if (clean.includes('хлеб') || clean.includes(' батон') || clean.includes('багет') || clean.includes('чиабатта') || clean.includes('булочк') || clean.includes('лепешк')) return 'bread';
    if (clean.includes('хлебц')) return 'crispbread';

    // 2. Groats & Pasta (Nemoloko is explicitly excluded from oats and rice!)
    if (clean.includes('гречк') || clean.includes('гречнев')) return 'buckwheat';
    if ((clean.includes('рис ') || clean.includes('рис,') || clean.includes(' рис') || clean.includes('күріш')) && !clean.includes('хлебцы') && !clean.includes('немолоко') && !clean.includes('nemoloko')) return 'rice';
    if (clean.includes('мука') || clean.includes(' ұн') || clean.startsWith('ұн')) return 'flour';
    if (clean.includes('рожк') || clean.includes('макарон') || clean.includes('вермишел') || clean.includes('спагетти') || clean.includes('ракушк') || clean.includes('перья')) return 'pasta';
    if (clean.includes('манка') || clean.includes('манн')) return 'semolina';
    if ((clean.includes('овсян') || clean.includes('геркулес')) && !clean.includes('nemoloko') && !clean.includes('немолоко')) return 'oats';
    if (clean.includes('пшено') || clean.includes('пшенн')) return 'millet';
    if (clean.includes('перлов') || clean.includes('ячнев') || clean.includes('ячмен')) return 'barley';
    if (clean.includes('фасол') || clean.includes('горох') || clean.includes('нут ') || clean.includes('чечевиц')) return 'legumes';

    // 3. Dairy & Plant Milk (distinct subtypes)
    if (clean.includes('сырок')) return 'cottage_cheese';
    if (clean.includes('кефир')) return 'kefir';
    if (clean.includes('тан ') || clean.includes('тан,') || clean.includes(' тан') || clean.includes('айран') || clean.startsWith('тан')) return 'tan_ayran';
    if (clean.includes('сметан') || clean.includes('қаймақ')) return 'sour_cream';
    if (clean.includes('творог') || clean.includes('творож') || clean.includes('сүзбе')) return 'cottage_cheese';
    if (clean.includes('сыр ') || clean.includes('сыр,') || clean.includes('сыры') || clean.includes('ірімшік')) return 'cheese';
    if ((clean.includes('масло') || clean.includes('спред')) && (clean.includes('сливочн') || clean.includes('сары май') || clean.includes('крестьянск') || clean.includes('коровье') || clean.includes('деревенское') || clean.includes('жайлау') || clean.includes('особое') || clean.includes('облегченное') || clean.includes('традиционное'))) return 'butter';
    if (clean.includes('сливочн') || clean.includes('сары май') || clean.includes('крестьянск')) return 'butter';
    if (clean.includes('сливк')) return 'cream';
    if ((clean.includes('молок') || clean.includes('сүт') || clean.includes('nemoloko') || clean.includes('немолоко') || clean.includes('сгущен')) && !clean.includes('сушк') && !clean.includes('сырок')) return 'milk';

    // 4. Sugar & Salt
    if (clean.includes('сахар') || clean.includes('қант') || clean.includes('рафинад')) return 'sugar';
    if ((clean.includes('соль') || clean.includes('тұз')) && !clean.includes('фасол') && !clean.includes('хлебцы')) return 'salt';

    // 5. Oils
    if (clean.includes('подсолнечн') || clean.includes('растительн') || clean.includes('күнбағыс') || clean.includes('оливков')) return 'vegetable_oil';

    // 6. Eggs
    if (clean.includes('яйц') || clean.includes('жұмыртқ')) return 'eggs';

    // 7. Vegetables & Fruits
    if (clean.includes('картоф') || clean.includes('картоп')) return 'potato';
    if (clean.includes('морков') || clean.includes('сәбіз')) return 'carrot';
    if ((clean.includes('лук ') || clean.includes('лук,') || clean.includes('пияз')) && !clean.includes('яблок') && !clean.includes('кукуруз')) return 'onion';
    if (clean.includes('капуст') || clean.includes('қырыққабат')) return 'cabbage';
    if (clean.includes('томат') || clean.includes('помидор') || clean.includes('қызанақ')) return 'tomato';
    if (clean.includes('огурц') || clean.includes('қияр')) return 'cucumber';
    if (clean.includes('яблок') || clean.includes('алма')) return 'apple';
    if (clean.includes('банан')) return 'banana';

    // 8. Meat & Fish
    if (clean.includes('фарш')) return 'minced_meat';
    if (clean.includes('краб палочки') || clean.includes('крабовые палочки')) return 'crab_sticks';
    if (clean.includes('ноги ') || clean.includes('ноги говяжь')) return 'meat_legs';
    if (clean.includes('говядин') || clean.includes('сиыр')) return 'beef';
    if (clean.includes('куриц') || clean.includes('куры') || clean.includes('окороч') || clean.includes('цыпленок') || clean.includes('тауық') || clean.includes('бройлер')) return 'chicken';
    if (clean.includes('рыб') || clean.includes('сельдь') || clean.includes('судак') || clean.includes('сазан') || clean.includes('карась') || clean.includes('балық') || clean.includes('кальмар') || clean.includes('мидии')) return 'fish';

    // 9. Tea
    if (clean.includes('чай ') || clean.includes('чай,') || clean.includes(' чай') || clean.includes('шайы')) return 'tea';

    return null;
  }

  public canonicalizeBrand(rawBrand: string): string {
    const trimmed = rawBrand.trim();
    for (const entry of this.brandAliases) {
      if (entry.patterns.some(p => p.test(trimmed))) {
        return entry.canonical;
      }
    }
    return trimmed;
  }

  public buildCanonicalTitle(name: string, brand?: string | null, attrs?: NormalizedAttributes): string {
    const parts: string[] = [];

    // Title capitalizes nicely
    let base = name
      .replace(/1л|1000мл|500мл|0\.5л|3\.2%|2\.5%|1\.5%|100г|300г|1кг|450г/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Standardize title casing
    base = base.charAt(0).toUpperCase() + base.slice(1);
    parts.push(base);

    if (attrs?.fatPercent) {
      parts.push(`${attrs.fatPercent}%`);
    }
    if (attrs?.volumeMl) {
      parts.push(attrs.volumeMl >= 1000 ? `${attrs.volumeMl / 1000} л` : `${attrs.volumeMl} мл`);
    } else if (attrs?.weightGrams) {
      parts.push(attrs.weightGrams >= 1000 ? `${attrs.weightGrams / 1000} кг` : `${attrs.weightGrams} г`);
    }

    return parts.join(' ');
  }
}

// Allow direct execution test
if (require.main === module) {
  const norm = new NormalizerService();
  const testCases = [
    'NEMOLOKO РИСОВЫЙ КЛАССИЧЕСКИЙ ЛАЙТ 1Л',
    'Напиток рисовый Nemoloko классический лайт 1.5% 1 л',
    'Молоко FoodMaster ультрапастеризованное 3,2% 1000 мл',
    'Хлеб бородинский нарезной 450 г',
    'Масло подсолнечное Золотая Семечка 1 л',
    'Сахар-песок Promo 700 г',
    'Чай черный Greenfield Golden Ceylon 25 пак'
  ];

  console.log('=== NORMALIZATION TEST CASES ===');
  for (const tc of testCases) {
    console.log(`Input: "${tc}"`);
    console.log('Extracted:', norm.normalize(tc));
    console.log('-'.repeat(40));
  }
}
