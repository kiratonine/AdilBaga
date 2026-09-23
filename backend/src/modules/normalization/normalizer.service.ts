export interface NormalizedAttributes {
  volumeMl?: number | null;
  weightGrams?: number | null;
  fatPercent?: number | null;
  packageCount?: number | null;
  breadType?: string | null;
  sliced?: boolean | null;
  brand?: string | null;
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
    { canonical: 'Айна', patterns: [/айна/i] },
    { canonical: 'Күнделік', patterns: [/кунделик/i, /күнделік/i] },
    { canonical: 'Promo', patterns: [/promo/i, /промо/i] },
    { canonical: 'Шалун', patterns: [/шалун/i] },
    { canonical: 'Пекарь', patterns: [/пекарь/i] },
    { canonical: 'Русский Продукт', patterns: [/русский\s*продукт/i] }
  ];

  public normalize(rawName: string, knownBrand?: string): NormalizedAttributes {
    if (!rawName) {
      return { cleanedName: '' };
    }

    // 1. Text normalization
    let clean = rawName
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/(\d+),(\d+)/g, '$1.$2') // Comma decimals to dot: 3,2 -> 3.2
      .replace(/\s+/g, ' ')
      .trim();

    // 2. Volume extraction
    let volumeMl: number | null = null;
    const lMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:л|l|литр\w*)/);
    if (lMatch) {
      const val = parseFloat(lMatch[1]);
      if (val > 0 && val < 50) {
        volumeMl = Math.round(val * 1000);
      }
    } else {
      const mlMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:мл|ml)/);
      if (mlMatch) {
        volumeMl = Math.round(parseFloat(mlMatch[1]));
      }
    }

    // 3. Weight extraction
    let weightGrams: number | null = null;
    const kgMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:кг|kg|килограмм\w*)/);
    if (kgMatch) {
      const val = parseFloat(kgMatch[1]);
      if (val > 0 && val < 50) {
        weightGrams = Math.round(val * 1000);
      }
    } else {
      const gMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:г|g|гр|грамм\w*)/);
      if (gMatch) {
        weightGrams = Math.round(parseFloat(gMatch[1]));
      }
    }

    // 4. Fat percentage extraction
    let fatPercent: number | null = null;
    const fatMatch = clean.match(/(\d+(?:\.\d+)?)\s*%/);
    if (fatMatch) {
      const val = parseFloat(fatMatch[1]);
      if (val >= 0.1 && val <= 99.9) {
        fatPercent = val;
      }
    }

    // 5. Package count
    let packageCount: number | null = null;
    const countMatch = clean.match(/(\d+)\s*(?:шт|пак|пакетик\w*)/);
    if (countMatch) {
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

    return {
      volumeMl,
      weightGrams,
      fatPercent,
      packageCount,
      breadType,
      sliced,
      brand: detectedBrand,
      cleanedName: clean
    };
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
