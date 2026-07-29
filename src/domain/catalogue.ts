/**
 * Free Business Registration Ltd service catalogue.
 *
 * Prices transcribed from freebusinessregistration.com/shop (July 2026).
 * Formation itself is £0 — the company covers the Companies House filing fee.
 * Everything here is the post-formation revenue line, which is why the agent's
 * job does not end when the registration details are captured.
 *
 * Keep this file as the single source of pricing truth: the system prompt is
 * generated from it, so the agent cannot quote a price that isn't listed.
 */

export type Billing = 'one-off' | 'monthly' | 'free';

export interface CatalogueItem {
  id: string;
  name: string;
  price: number;
  billing: Billing;
  summary: string;
  /** Words a caller might use that should surface this item. */
  keywords: string[];
}

export const CURRENCY = 'GBP';

export const CATALOGUE: readonly CatalogueItem[] = [
  {
    id: 'formation',
    name: 'Company Formation',
    price: 0,
    billing: 'free',
    summary: 'Limited company registered at Companies House. We cover the filing fee. Digital certificate and company records, typically within three to six hours.',
    keywords: ['formation', 'register', 'registration', 'incorporate', 'set up a company', 'limited company', 'ltd'],
  },
  {
    id: 'bank-account',
    name: 'Business Bank Account',
    price: 0,
    billing: 'free',
    summary: 'Introduction to a regulated banking partner — online banking and a debit card, usually opened the same day.',
    keywords: ['bank', 'bank account', 'banking', 'business account', 'debit card'],
  },
  {
    id: 'phone-number',
    name: 'UK Phone Number',
    price: 0,
    billing: 'free',
    summary: 'A dedicated UK business phone number for the new company.',
    keywords: ['phone number', 'telephone', 'business number', 'landline'],
  },
  {
    id: 'free-website',
    name: 'Free Website / AI Website Builder',
    price: 0,
    billing: 'free',
    summary: 'A starter website built with the AI website builder, included at no cost.',
    keywords: ['free website', 'website builder', 'ai website', 'starter site'],
  },

  {
    id: 'email-domain',
    name: 'Email & Domain Setup',
    price: 50,
    billing: 'one-off',
    summary: 'Domain registration and business email set up and configured.',
    keywords: ['domain', 'email', 'business email', 'email setup', 'mailbox'],
  },
  {
    id: 'promo-video',
    name: 'Promotional Video',
    price: 99,
    billing: 'one-off',
    summary: 'One promotional video for marketing or social use.',
    keywords: ['video', 'promo video', 'promotional video'],
  },
  {
    id: 'graphic-bundle',
    name: 'Graphic Design Bundle',
    price: 199,
    billing: 'one-off',
    summary: 'Ten social media graphics, design only — no posting management.',
    keywords: ['graphics', 'graphic design', 'social graphics', 'design bundle'],
  },
  {
    id: 'branding',
    name: 'Branding Package',
    price: 299,
    billing: 'one-off',
    summary: 'Logo plus a social media template pack.',
    keywords: ['branding', 'brand', 'logo', 'identity', 'brand pack'],
  },
  {
    id: 'promo-video-bundle',
    name: 'Promotional Video Bundle',
    price: 299,
    billing: 'one-off',
    summary: 'Four promotional videos for a campaign.',
    keywords: ['video bundle', 'four videos', 'video campaign'],
  },
  {
    id: 'website-5page',
    name: '5 Page Website',
    price: 399,
    billing: 'one-off',
    summary: 'A five-page non-ecommerce website built to your specification.',
    keywords: ['website', 'web design', 'five page', '5 page', 'brochure site', 'site'],
  },
  {
    id: 'website-ecommerce',
    name: 'E-Commerce Website',
    price: 999,
    billing: 'one-off',
    summary: 'An online shop, built on Shopify or as a custom build.',
    keywords: ['ecommerce', 'e-commerce', 'online shop', 'online store', 'shopify', 'sell online'],
  },

  {
    id: 'seo-bronze',
    name: 'Bronze SEO',
    price: 99,
    billing: 'monthly',
    summary: 'Monthly onsite SEO fundamentals.',
    keywords: ['seo', 'bronze seo', 'search'],
  },
  {
    id: 'seo-silver',
    name: 'Silver SEO',
    price: 199,
    billing: 'monthly',
    summary: 'Monthly onsite SEO plus backlink work.',
    keywords: ['silver seo', 'backlinks'],
  },
  {
    id: 'seo-gold',
    name: 'Gold SEO',
    price: 299,
    billing: 'monthly',
    summary: 'Monthly onsite and offsite SEO.',
    keywords: ['gold seo'],
  },
  {
    id: 'seo-vip',
    name: 'VIP SEO',
    price: 499,
    billing: 'monthly',
    summary: 'Onsite SEO, offsite SEO and blogging every month.',
    keywords: ['vip seo', 'blogging'],
  },
  {
    id: 'social-bronze',
    name: 'Social Media Bronze',
    price: 199,
    billing: 'monthly',
    summary: 'Three posts a week across two platforms, with graphics.',
    keywords: ['social media', 'social', 'posts', 'bronze social'],
  },
  {
    id: 'social-silver',
    name: 'Social Media Silver',
    price: 299,
    billing: 'monthly',
    summary: 'Four posts a week across three platforms.',
    keywords: ['silver social'],
  },
  {
    id: 'social-gold',
    name: 'Social Media Gold',
    price: 399,
    billing: 'monthly',
    summary: 'Five posts a week across four platforms.',
    keywords: ['gold social'],
  },
  {
    id: 'social-vip',
    name: 'Social Media VIP',
    price: 499,
    billing: 'monthly',
    summary: 'Seven posts a week across up to five platforms, including video.',
    keywords: ['vip social'],
  },
  {
    id: 'appointment-setting',
    name: 'Outsourced Appointment Setting',
    price: 3000,
    billing: 'monthly',
    summary: 'A dedicated team promoting the business and booking meetings.',
    keywords: ['appointment setting', 'lead generation', 'sales team', 'cold calling', 'booking meetings'],
  },

  {
    id: 'pack-business',
    name: 'Business Starter Pack',
    price: 799,
    billing: 'one-off',
    summary: 'Website, branding, social graphics, a promo video, and email/domain setup.',
    keywords: ['business starter', 'starter pack', 'bundle', 'package'],
  },
  {
    id: 'pack-premium',
    name: 'Premium Starter Pack',
    price: 1999,
    billing: 'one-off',
    summary: 'Custom website, social content, branding, videos, setup, plus three months of Bronze SEO.',
    keywords: ['premium starter', 'premium pack'],
  },
  {
    id: 'pack-ultimate',
    name: 'Ultimate Starter Pack',
    price: 4999,
    billing: 'one-off',
    summary: 'Website, social, SEO, videos, branding, setup and appointment setting.',
    keywords: ['ultimate starter', 'ultimate pack', 'everything'],
  },
] as const;

export function formatPrice(item: CatalogueItem): string {
  if (item.billing === 'free') return 'free';
  const amount = `£${item.price.toLocaleString('en-GB')}`;
  return item.billing === 'monthly' ? `${amount} a month` : amount;
}

/** Find catalogue items matching a caller's free-text interest. */
export function findServices(query: string, limit = 3): CatalogueItem[] {
  const text = ` ${query.toLowerCase().replace(/[^a-z0-9&\s-]/g, ' ').replace(/\s+/g, ' ')} `;
  const scored: Array<{ item: CatalogueItem; score: number }> = [];

  for (const item of CATALOGUE) {
    let score = 0;
    for (const keyword of item.keywords) {
      if (text.includes(` ${keyword} `) || text.includes(` ${keyword}s `)) {
        score += keyword.split(' ').length * 10 + keyword.length;
      }
    }
    if (text.includes(` ${item.name.toLowerCase()} `)) score += 50;
    if (score > 0) scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score || a.item.price - b.item.price);
  return scored.slice(0, limit).map((s) => s.item);
}

/** Rendered into the system prompt so the agent can never invent a price. */
export function catalogueForPrompt(): string {
  const line = (i: CatalogueItem) => `- ${i.name} — ${formatPrice(i)}. ${i.summary}`;
  const group = (billing: Billing) => CATALOGUE.filter((i) => i.billing === billing).map(line).join('\n');

  return [
    'INCLUDED AT NO COST:',
    group('free'),
    '',
    'ONE-OFF SERVICES:',
    group('one-off'),
    '',
    'MONTHLY SERVICES:',
    group('monthly'),
  ].join('\n');
}
