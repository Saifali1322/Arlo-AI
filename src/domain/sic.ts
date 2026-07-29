/**
 * SIC (Standard Industrial Classification) lookup.
 *
 * Companies House requires at least one SIC code at incorporation. Callers
 * never know their code — they describe what they do. This maps a spoken
 * description onto the codes new UK companies actually use.
 *
 * The list is the common subset (2007 SIC), not the full ~730 codes. It covers
 * the overwhelming majority of small-company incorporations; anything it can't
 * place falls through to 82990 and a human confirms later.
 */

export interface SicCode {
  code: string;
  description: string;
  keywords: string[];
}

export const SIC_CODES: readonly SicCode[] = [
  { code: '62020', description: 'Information technology consultancy activities', keywords: ['it consultant', 'it consultancy', 'tech consultant', 'software consultant', 'devops', 'cloud', 'cyber', 'it support', 'sysadmin', 'technology'] },
  { code: '62012', description: 'Business and domestic software development', keywords: ['software', 'app', 'application', 'developer', 'programming', 'coding', 'saas', 'web app', 'mobile app', 'engineer'] },
  { code: '62090', description: 'Other information technology service activities', keywords: ['it services', 'computer services', 'hosting support', 'data services'] },
  { code: '63110', description: 'Data processing, hosting and related activities', keywords: ['hosting', 'data processing', 'server', 'data centre', 'cloud hosting'] },
  { code: '70229', description: 'Management consultancy activities (other than financial management)', keywords: ['consultant', 'consultancy', 'management consultant', 'business advice', 'strategy', 'coaching', 'business coach'] },
  { code: '70210', description: 'Public relations and communications activities', keywords: ['pr', 'public relations', 'communications', 'press'] },
  { code: '73110', description: 'Advertising agencies', keywords: ['advertising', 'marketing', 'ad agency', 'digital marketing', 'seo', 'social media', 'ppc', 'branding agency', 'media buying'] },
  { code: '73200', description: 'Market research and public opinion polling', keywords: ['market research', 'polling', 'surveys', 'insight'] },
  { code: '74100', description: 'Specialised design activities', keywords: ['design', 'graphic design', 'designer', 'branding', 'interior design', 'ux', 'ui', 'product design'] },
  { code: '74201', description: 'Portrait photographic activities', keywords: ['portrait photography', 'headshots', 'wedding photography', 'photographer'] },
  { code: '74202', description: 'Other specialist photography', keywords: ['photography', 'commercial photography', 'product photography'] },
  { code: '59111', description: 'Motion picture production activities', keywords: ['film', 'video production', 'videography', 'filmmaker', 'video', 'content production'] },
  { code: '90030', description: 'Artistic creation', keywords: ['artist', 'illustrator', 'writer', 'author', 'musician', 'creative', 'painter'] },
  { code: '58190', description: 'Other publishing activities', keywords: ['publishing', 'publisher', 'magazine', 'newsletter'] },

  { code: '47910', description: 'Retail sale via mail order houses or via Internet', keywords: ['ecommerce', 'e-commerce', 'online shop', 'online store', 'dropshipping', 'shopify', 'selling online', 'etsy', 'amazon seller', 'online retail'] },
  { code: '47990', description: 'Other retail sale not in stores, stalls or markets', keywords: ['market stall', 'door to door', 'direct sales'] },
  { code: '47190', description: 'Other retail sale in non-specialised stores', keywords: ['shop', 'store', 'retail', 'convenience store', 'newsagent'] },
  { code: '46900', description: 'Non-specialised wholesale trade', keywords: ['wholesale', 'wholesaler', 'distribution', 'import', 'export', 'trading', 'supplier'] },

  { code: '56101', description: 'Licensed restaurants', keywords: ['restaurant', 'dining', 'bistro', 'licensed restaurant'] },
  { code: '56103', description: 'Take-away food shops and mobile food stands', keywords: ['takeaway', 'take away', 'food truck', 'street food', 'fast food', 'takeout'] },
  { code: '56102', description: 'Unlicensed restaurants and cafes', keywords: ['cafe', 'coffee shop', 'coffee', 'tearoom', 'bakery cafe'] },
  { code: '56210', description: 'Event catering activities', keywords: ['catering', 'caterer', 'event catering', 'private chef'] },
  { code: '10712', description: 'Manufacture of fresh pastry goods and cakes', keywords: ['bakery', 'baker', 'cakes', 'patisserie', 'baking'] },

  { code: '43210', description: 'Electrical installation', keywords: ['electrician', 'electrical', 'rewiring', 'ev charger'] },
  { code: '43220', description: 'Plumbing, heat and air-conditioning installation', keywords: ['plumber', 'plumbing', 'heating', 'boiler', 'gas engineer', 'hvac', 'air conditioning'] },
  { code: '43390', description: 'Other building completion and finishing', keywords: ['decorator', 'painting and decorating', 'plastering', 'tiling', 'flooring'] },
  { code: '41202', description: 'Construction of domestic buildings', keywords: ['builder', 'construction', 'building', 'extension', 'renovation', 'contractor', 'refurbishment'] },
  { code: '43999', description: 'Other specialised construction activities', keywords: ['scaffolding', 'roofing', 'groundwork', 'specialist construction'] },
  { code: '81300', description: 'Landscape service activities', keywords: ['gardener', 'gardening', 'landscaping', 'grounds maintenance', 'tree surgeon'] },
  { code: '81210', description: 'General cleaning of buildings', keywords: ['cleaning', 'cleaner', 'domestic cleaning', 'office cleaning', 'housekeeping'] },

  { code: '96020', description: 'Hairdressing and other beauty treatment', keywords: ['hairdresser', 'barber', 'salon', 'beauty', 'beautician', 'nails', 'lashes', 'aesthetics', 'spa'] },
  { code: '96040', description: 'Physical well-being activities', keywords: ['massage', 'wellbeing', 'wellness', 'sauna'] },
  { code: '93130', description: 'Fitness facilities', keywords: ['gym', 'fitness', 'personal trainer', 'pt', 'crossfit', 'yoga', 'pilates'] },
  { code: '86900', description: 'Other human health activities', keywords: ['therapist', 'physiotherapy', 'osteopath', 'chiropractor', 'counselling', 'nutritionist', 'health'] },

  { code: '49320', description: 'Taxi operation', keywords: ['taxi', 'private hire', 'uber', 'minicab', 'chauffeur'] },
  { code: '49410', description: 'Freight transport by road', keywords: ['haulage', 'lorry', 'freight', 'trucking', 'transport'] },
  { code: '53202', description: 'Unlicensed carrier', keywords: ['courier', 'delivery', 'parcel', 'same day delivery'] },
  { code: '52290', description: 'Other transportation support activities', keywords: ['logistics', 'shipping agent', 'freight forwarding'] },

  { code: '68209', description: 'Other letting and operating of own or leased real estate', keywords: ['property rental', 'landlord', 'buy to let', 'lettings', 'property investment', 'serviced accommodation', 'airbnb'] },
  { code: '68310', description: 'Real estate agencies', keywords: ['estate agent', 'letting agent', 'property agent'] },
  { code: '68320', description: 'Management of real estate on a fee or contract basis', keywords: ['property management', 'block management'] },

  { code: '69201', description: 'Accounting and auditing activities', keywords: ['accountant', 'accounting', 'bookkeeping', 'bookkeeper', 'payroll', 'tax'] },
  { code: '69102', description: 'Solicitors', keywords: ['solicitor', 'law firm', 'legal', 'lawyer'] },
  { code: '66220', description: 'Activities of insurance agents and brokers', keywords: ['insurance broker', 'insurance agent'] },
  { code: '66190', description: 'Activities auxiliary to financial intermediation', keywords: ['mortgage broker', 'financial services', 'finance broker', 'ifa'] },
  { code: '64209', description: 'Activities of other holding companies', keywords: ['holding company', 'holdings', 'group holding', 'spv', 'investment holding'] },

  { code: '85590', description: 'Other education', keywords: ['tutor', 'tutoring', 'training', 'courses', 'teaching', 'driving instructor', 'education', 'workshops'] },
  { code: '85600', description: 'Educational support services', keywords: ['education support', 'careers advice', 'exam support'] },

  { code: '78109', description: 'Other activities of employment placement agencies', keywords: ['recruitment', 'recruiter', 'staffing', 'headhunting', 'employment agency', 'talent'] },
  { code: '82110', description: 'Combined office administrative service activities', keywords: ['virtual assistant', 'va', 'admin', 'office support', 'secretarial'] },
  { code: '82990', description: 'Other business support service activities not elsewhere classified', keywords: ['business services', 'general services', 'support services', 'other'] },

  { code: '95110', description: 'Repair of computers and peripheral equipment', keywords: ['computer repair', 'laptop repair', 'phone repair', 'device repair'] },
  { code: '45200', description: 'Maintenance and repair of motor vehicles', keywords: ['garage', 'mechanic', 'car repair', 'mot', 'vehicle servicing', 'bodyshop', 'valeting'] },
  { code: '45111', description: 'Sale of new cars and light motor vehicles', keywords: ['car dealership', 'car sales', 'vehicle sales'] },

  { code: '14190', description: 'Manufacture of other wearing apparel and accessories', keywords: ['clothing', 'fashion', 'apparel', 'clothing brand', 'streetwear', 'garments'] },
  { code: '32120', description: 'Manufacture of jewellery and related articles', keywords: ['jewellery', 'jewelry', 'jeweller'] },
  { code: '11050', description: 'Manufacture of beer', keywords: ['brewery', 'brewing', 'beer', 'craft beer'] },
  { code: '32990', description: 'Other manufacturing not elsewhere classified', keywords: ['manufacturing', 'manufacturer', 'production', 'making', 'handmade'] },

  { code: '96090', description: 'Other service activities not elsewhere classified', keywords: ['pet services', 'dog walking', 'dog grooming', 'pet sitting', 'events', 'wedding planning', 'other services'] },
  { code: '55201', description: 'Holiday centres and villages', keywords: ['holiday let', 'glamping', 'holiday accommodation'] },
  { code: '55100', description: 'Hotels and similar accommodation', keywords: ['hotel', 'guest house', 'bed and breakfast', 'b&b'] },
] as const;

/** SIC code used when nothing else matches; a human confirms before filing. */
export const FALLBACK_SIC = SIC_CODES.find((c) => c.code === '82990')!;

export interface SicMatch extends SicCode {
  /** Higher is better. Relative, not a probability. */
  score: number;
}

/**
 * Crude suffix stemmer. Enough to make "selling" match "sell" and "candles"
 * match "candle"; deliberately not a real stemmer, because over-stemming
 * creates false matches that are worse than misses here.
 */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/**
 * Rank SIC codes against a free-text business description.
 *
 * Two levels of matching, because people do not speak in keyword phrases:
 *
 *   contiguous  "online shop" appears verbatim — strongest signal
 *   scattered   every word of the keyword appears somewhere, stemmed. Catches
 *               "we sell handmade candles online" against "selling online",
 *               which a phrase-only matcher misses entirely and then
 *               misclassifies as manufacturing.
 *
 * Each keyword contributes at most once, at its best matching level.
 */
export function suggestSicCodes(description: string, limit = 3): SicMatch[] {
  const normalised = description.toLowerCase().replace(/[^a-z0-9&\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (normalised.length === 0) return [{ ...FALLBACK_SIC, score: 0 }];

  const text = ` ${normalised} `;
  const stems = new Set(normalised.split(' ').filter(Boolean).map(stem));

  const scored: SicMatch[] = [];

  for (const entry of SIC_CODES) {
    let score = 0;

    for (const keyword of entry.keywords) {
      const words = keyword.split(' ');
      const specificity = words.length * 10 + keyword.length;

      if (text.includes(` ${keyword} `) || text.includes(` ${keyword}s `)) {
        score += specificity;
        continue;
      }

      // Scattered match, weighted below a contiguous one.
      if (words.length > 1 && words.every((word) => stems.has(stem(word)))) {
        score += words.length * 6 + keyword.length;
      }
    }

    // A hit on the official description itself is a weak corroborating signal.
    for (const word of entry.description.toLowerCase().split(/[^a-z]+/)) {
      if (word.length > 5 && text.includes(` ${word} `)) score += 3;
    }

    if (score > 0) scored.push({ ...entry, score });
  }

  scored.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));

  if (scored.length === 0) return [{ ...FALLBACK_SIC, score: 0 }];
  return scored.slice(0, limit);
}

/** Look up a single code by its 5-digit number. */
export function getSicByCode(code: string): SicCode | undefined {
  return SIC_CODES.find((c) => c.code === code.trim());
}
