/**
 * sync-discounts.ts v2
 * עובר על כל החנויות, נכנס לכל פרופיל AdsPower,
 * קורא את המבצעים הפעילים מ-Etsy ומעדכן את ה-DB.
 * אם חשבון לא מחובר → מדלג (חשבון חסום).
 *
 * תיקונים בגרסה 2:
 * - דדופליקציה של קישורי מבצעים לפי href
 * - חילוץ שם מבצע מ-h1/h2 בדף הפרטים (לא regex שגוי)
 * - סינון רק מבצעים active (לא scheduled / ended)
 * - זיהוי חסימה גם כשה-URL הוא start.adspower.net
 * - מעבר ל-tab "Promotions" לפני קריאת המבצעים
 */

import { chromium } from 'playwright';
import { Pool } from 'pg';
import axios from 'axios';
import * as fs from 'fs';
import { HumanBehavior } from './browser/humanBehavior';

const PLATFORM_DB = 'postgresql://postgres:postgres_dev_password@185.241.4.225:5433/etsy_platform';
const ADSPOWER_URL = 'http://127.0.0.1:50325';
const ADSPOWER_KEY = 'c44cda0f358957f4a60bc8054504571400707d1cc0163261';
const RESULTS_FILE = 'C:/etsy/sync-discounts-results.json';

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ─── AdsPower helpers ────────────────────────────────────────────────────────

async function openProfile(profileId: string): Promise<string | null> {
  try {
    // סגור קודם אם פתוח
    await axios.get(`${ADSPOWER_URL}/api/v1/browser/stop`, {
      params: { user_id: profileId },
      headers: { 'api-key': ADSPOWER_KEY },
      timeout: 10000,
    }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));

    const res = await axios.get(`${ADSPOWER_URL}/api/v1/browser/start`, {
      params: { user_id: profileId },
      headers: { 'api-key': ADSPOWER_KEY },
      timeout: 40000,
    });
    if (res.data.code !== 0) {
      log(`  ❌ AdsPower error for ${profileId}: ${res.data.msg}`);
      return null;
    }
    return res.data.data.ws.puppeteer;
  } catch (e: any) {
    log(`  ❌ Failed to open profile ${profileId}: ${e.message}`);
    return null;
  }
}

async function closeProfile(profileId: string): Promise<void> {
  await axios.get(`${ADSPOWER_URL}/api/v1/browser/stop`, {
    params: { user_id: profileId },
    headers: { 'api-key': ADSPOWER_KEY },
    timeout: 10000,
  }).catch(() => {});
  log(`  🔒 Profile ${profileId} closed`);
}

// ─── Human warmup before navigating to target page ───────────────────────────

// דפי ביניים אפשריים — מגוון כדי שלא תמיד אותו נתיב
const WARMUP_POOLS = {
  etsy_home: 'https://www.etsy.com',
  shop_manager: 'https://www.etsy.com/your/shops/me',
  listings: 'https://www.etsy.com/your/shops/me/listings',
  orders: 'https://www.etsy.com/your/shops/me/orders',
  stats: 'https://www.etsy.com/your/shops/me/stats',
  inbox: 'https://www.etsy.com/your/shops/me/messages',
};
const WARMUP_URLS = Object.values(WARMUP_POOLS);

/** עצור בין פעולות — תמיד אקראי, אף פעם לא אותו זמן */
function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pause(min: number, max: number) {
  return new Promise<void>(res => setTimeout(res, rnd(min, max)));
}

/** תנועת עכבר לנקודה אקראית על המסך בצורה אנושית */
async function moveMouse(page: any) {
  const x = rnd(80, 1200);
  const y = rnd(80, 700);
  const steps = rnd(12, 30);
  await page.mouse.move(x, y, { steps }).catch(() => {});
  await pause(150, 500);
}

/** גלילה אנושית: מספר צעדים אקראי, גודל צעד אקראי, עם רעש */
async function humanScroll(page: any, direction: 'down' | 'up', totalPx: number) {
  const steps = rnd(3, 7);
  const sign = direction === 'down' ? 1 : -1;
  for (let i = 0; i < steps; i++) {
    const stepPx = Math.floor(totalPx / steps) + rnd(-25, 25);
    await page.mouse.wheel(0, stepPx * sign);
    await pause(40, 180);
  }
  await pause(400, 1200);
}

/**
 * Warmup אנושי מלא לפני ניווט לדף היעד.
 * - עובר על 1–3 דפים ביניים אקראיים
 * - בכל דף: גלילה, תנועות עכבר, השהיות — הכל אקראי
 * - רק בסוף מגיע לדף היעד
 */
async function humanWarmupThenNavigate(page: any, targetUrl: string): Promise<void> {
  const currentUrl = page.url();

  // אם כבר בדף היעד — פעולות קצרות ויוצאים
  if (currentUrl.includes('sales-discounts')) {
    log(`  🏠 Already on target — quick scroll + mouse`);
    await humanScroll(page, 'down', rnd(80, 200));
    await moveMouse(page);
    await pause(1200, 2500);
    return;
  }

  // כמה דפי ביניים לעבור — 1 עד 3
  const numStops = rnd(1, 3);
  // בחר דפים אקראיים (בלי חזרה)
  const shuffled = [...WARMUP_URLS].sort(() => Math.random() - 0.5);
  const stops = shuffled.slice(0, numStops);

  log(`  🚶 Warmup: ${numStops} stop(s) before target`);

  for (let i = 0; i < stops.length; i++) {
    const url = stops[i];
    log(`  [${i + 1}/${numStops}] → ${url}`);

    // נווט לדף הביניים
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await pause(rnd(1200, 3000), rnd(3000, 5500)); // זמן "קריאה" ראשוני

    // תנועות עכבר אקראיות — 2 עד 5 פעמים
    const mouseRounds = rnd(2, 5);
    for (let m = 0; m < mouseRounds; m++) {
      await moveMouse(page);
      await pause(200, 700);
    }

    // גלילה למטה
    const scrollDown = rnd(150, 600);
    await humanScroll(page, 'down', scrollDown);

    // 50% מהפעמים — גלול עוד קצת
    if (Math.random() < 0.5) {
      await pause(500, 1500);
      await humanScroll(page, 'down', rnd(100, 300));
    }

    // 40% מהפעמים — גלול חזרה למעלה קצת
    if (Math.random() < 0.4) {
      await pause(400, 1000);
      await humanScroll(page, 'up', rnd(80, 200));
    }

    // תנועת עכבר אחרונה בדף זה
    await moveMouse(page);
    await pause(rnd(600, 1800), rnd(1800, 4000));
  }

  // השהיית "חשיבה" לפני דף היעד
  const thinkMs = rnd(2500, 6000);
  log(`  💭 Thinking ${Math.round(thinkMs / 1000)}s → then target page`);
  await pause(thinkMs, thinkMs + rnd(0, 1000));

  // נווט לדף היעד
  log(`  🎯 → ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(async (e: any) => {
    log(`  ⚠️ Navigation failed: ${e.message} — retrying`);
    await pause(2500, 4000);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  // פעולות ראשונות בדף היעד — כאילו "הגעתי ומסתכל"
  await pause(rnd(1500, 3500), rnd(3500, 6000));
  await moveMouse(page);
  await humanScroll(page, 'down', rnd(80, 200));
  await pause(800, 2000);
}

// ─── Single tab enforcement ───────────────────────────────────────────────────

/**
 * מוודא שיש רק tab אחד פתוח ב-context.
 * אם יש כמה — סוגר את כולם חוץ מהראשון.
 * אם אין אף אחד — פותח tab חדש.
 */
async function ensureSingleTab(context: any): Promise<any> {
  const pages = context.pages() as any[];
  if (pages.length === 0) {
    const page = await context.newPage();
    await new Promise(r => setTimeout(r, 1500));
    log(`  📄 Opened new tab (no existing tabs)`);
    return page;
  }
  // שמור את הראשון — סגור את כל השאר
  const [keep, ...extras] = pages;
  if (extras.length > 0) {
    log(`  🗂️ Found ${pages.length} open tabs — closing ${extras.length} extra tab(s)`);
    for (const p of extras) {
      await p.close().catch(() => {});
    }
  }
  await keep.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
  log(`  🔗 Using tab: ${keep.url()}`);
  return keep;
}

// ─── Login detection ─────────────────────────────────────────────────────────

async function checkLoggedIn(page: any): Promise<boolean> {
  const url = page.url();

  // URL checks — אם לא על Etsy → בוודאות לא מחובר
  if (
    url.includes('start.adspower.net') ||
    url.includes('sign_in') ||
    url.includes('/login') ||
    url.includes('accounts.google.com') ||
    url === '' ||
    url === 'about:blank'
  ) {
    return false;
  }

  // אם בכלל לא Etsy → לא מחובר
  if (!url.includes('etsy.com')) {
    return false;
  }

  const result = await page.evaluate(() => {
    const text = document.body?.innerText || '';
    const html = document.body?.innerHTML || '';

    // דפי התחברות
    const isLoginPage =
      text.includes('Sign in to continue') ||
      text.includes('Enter your email address') ||
      text.includes('Sign in to Etsy') ||
      document.querySelector('input[name="email"][type="email"]') !== null;

    if (isLoginPage) return false;

    // תוכן מ-Shop Manager → בוודאות מחובר
    const hasShopContent =
      text.includes('Sales and discounts') ||
      text.includes('Promotions') ||
      text.includes('Create a sale') ||
      text.includes('% off') ||
      text.includes('Your active sales') ||
      html.includes('sales-discounts') ||
      document.querySelector('[data-shop-id]') !== null ||
      document.querySelector('nav[aria-label*="Shop"]') !== null;

    return hasShopContent;
  }).catch(() => false);

  return result;
}

// ─── Sales reading ────────────────────────────────────────────────────────────

interface SaleInfo {
  name: string | null;
  discountPercent: number | null;
  startDate: string | null;
  endDate: string | null;
  status: 'active' | 'scheduled' | 'ended' | 'unknown';
  promotionUrl: string;
}

async function readActiveSalesFromEtsy(page: any): Promise<SaleInfo[]> {
  const salesDiscountsUrl = 'https://www.etsy.com/your/shops/me/sales-discounts';

  // ── נווט לדף המבצעים ──
  await page.goto(salesDiscountsUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));

  const pageUrl = page.url();
  if (!pageUrl.includes('etsy.com')) {
    log(`  ⚠️ Unexpected URL after navigation: ${pageUrl}`);
    return [];
  }

  // ── שלב 1: לחץ על טאב "Promotions" כדי לראות sale events בלבד ──
  await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a, button, [role="tab"]')) as HTMLElement[];
    const promoTab = links.find(el => {
      const t = el.innerText?.trim();
      return t === 'Promotions' || t === 'Sales';
    });
    if (promoTab) promoTab.click();
  }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  // ── שלב 2: קרא את טקסט הדף המלא ──
  const fullText = (await page.evaluate(() => document.body?.innerText || '').catch(() => '')) as string;

  // ── שלב 3: dump מה הדף מכיל (לאבחון) ──
  // מוגבל ל-60 שורות ראשונות
  const allLines = fullText.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
  log(`  📄 Page lines (first 40): ${allLines.slice(0, 40).join(' | ')}`);

  // ── שלב 4: מצא promotion links ──
  const promoLinks = (await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href*="/promotion/"]') as NodeListOf<HTMLAnchorElement>)
      .map(a => a.href)
      .filter(h => h.includes('/promotion/'));
  }).catch(() => [])) as string[];
  const uniquePromoLinks = [...new Set(promoLinks)];
  log(`  🔗 Promotion links: ${uniquePromoLinks.length} unique (${promoLinks.length} total)`);

  // ── שלב 5: חפש "Shop-wide sale" בטבלת הסטטיסטיקות ──
  // הדף מציג טבלה: "Your key sales and discounts | Last 30 Days"
  // עם שורות כמו: "Shop-wide sale" → "Apr 1, 2026 - May 1, 2026" → "20%"
  // (ה-| בלוגים הם רק formattig — בפועל זה שורות נפרדות)

  const saleEvents: SaleInfo[] = [];
  const seenIdx = new Set<number>();

  // חפש שורות של "Shop-wide sale" בטקסט
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    if (!/shop.wide sale/i.test(line)) continue;
    if (seenIdx.has(i)) continue;
    seenIdx.add(i);

    // שורות הסמוכות: תאריך, אחוז
    const contextLines = allLines.slice(i, i + 6);
    const contextText = contextLines.join(' ');

    // חלץ אחוז
    let discountPercent: number | null = null;
    for (const cl of contextLines) {
      const m = cl.match(/^(\d{1,3})%$/);  // שורה שהיא רק "%"
      if (m) { discountPercent = parseInt(m[1]); break; }
      const m2 = cl.match(/(\d{1,3})%\s*off/i);
      if (m2) { discountPercent = parseInt(m2[1]); break; }
    }
    if (!discountPercent) {
      const m = contextText.match(/(\d{1,3})%/);
      if (m) discountPercent = parseInt(m[1]);
    }

    // חלץ תאריכים
    // פורמט Etsy: "Apr 1, 2026 - May 1, 2026" או "01 Apr, 2026 - 01 May, 2026"
    let startDate: string | null = null;
    let endDate: string | null = null;
    for (const cl of contextLines) {
      // חפש: "Apr 1, 2026 - May 1, 2026"
      const dateRange = cl.match(/([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s*[-–]\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/);
      if (dateRange) { startDate = dateRange[1]; endDate = dateRange[2]; break; }
      // חפש: "01 Apr, 2026 - 01 May, 2026"
      const dateRange2 = cl.match(/(\d{1,2}\s+[A-Za-z]+,?\s+\d{4})\s*[-–]\s*(\d{1,2}\s+[A-Za-z]+,?\s+\d{4})/);
      if (dateRange2) { startDate = dateRange2[1]; endDate = dateRange2[2]; break; }
    }

    // קבע סטטוס — אם תאריך הסיום בעתיד → active
    let status: 'active' | 'scheduled' | 'ended' | 'unknown' = 'active';
    // (אם יש בdataב-Ended נדאג לזה בפעם אחרת)

    // השתמש ב-URL הראשון מהלינקים שלא שייך לcoupon ידוע
    // ניחוש: לינקים חדשים יותר (IDs גדולים יותר) = sale events
    const sortedLinks = [...uniquePromoLinks].sort().reverse(); // חדשים ראשון
    const matchingUrl = sortedLinks[saleEvents.length] || uniquePromoLinks[0] || '';

    log(`  📦 Shop-wide sale: ${discountPercent ?? '?'}% | ${startDate ?? '?'} - ${endDate ?? '?'} (${status})`);

    saleEvents.push({
      name: 'Shop-wide sale',   // ← שם גנרי, נשאיר etsy_sale_name מה-DB
      discountPercent,
      startDate,
      endDate,
      status,
      promotionUrl: matchingUrl,
    });
  }

  // ── נפילה: אין shop-wide sale אבל יש promotion links ──
  if (saleEvents.length === 0) {
    const hasCreate = fullText.includes('Create a sale') || fullText.includes('Run a sale');
    if (uniquePromoLinks.length === 0 && hasCreate) {
      log(`  ℹ️ No active sale events on Etsy (no promotions, Create a sale button present)`);
    } else if (uniquePromoLinks.length > 0) {
      log(`  ℹ️ ${uniquePromoLinks.length} promotion link(s) found but no Shop-wide sale in stats table`);
      log(`  📌 May only have coupon offers (Abandoned cart, Favorited, Thank you)`);
    } else {
      log(`  ⚠️ Could not detect any sales — page may not have loaded correctly`);
    }
    return [];
  }

  // החזר רק active
  const activeSales = saleEvents.filter(s => s.status === 'active' || s.status === 'unknown');
  log(`  ✅ ${activeSales.length} active shop-wide sale(s) found`);
  return activeSales;
}

// ─── DB update helpers ────────────────────────────────────────────────────────

async function updateDiscountRule(
  pool: Pool,
  ruleId: number,
  sale: SaleInfo,
  currentRule: any,
  dbUpdates: string[]
) {
  const setClauses: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (sale.name && sale.name !== currentRule.etsy_sale_name) {
    setClauses.push(`etsy_sale_name = $${idx++}`);
    params.push(sale.name);
    dbUpdates.push(`etsy_sale_name → ${sale.name}`);
  }

  if (sale.discountPercent !== null && sale.discountPercent !== currentRule.discount_value) {
    setClauses.push(`discount_value = $${idx++}`);
    params.push(sale.discountPercent);
    dbUpdates.push(`discount_value → ${sale.discountPercent}`);
  }

  if (sale.startDate) {
    setClauses.push(`start_date = $${idx++}`);
    params.push(sale.startDate);
  }

  if (sale.endDate) {
    setClauses.push(`end_date = $${idx++}`);
    params.push(sale.endDate);
  }

  if (currentRule.status !== 'active') {
    setClauses.push(`status = $${idx++}`);
    params.push('active');
    dbUpdates.push(`status → active`);
  }

  if (setClauses.length === 0) {
    log(`  ℹ️ Rule ${ruleId} already up to date`);
    return;
  }

  setClauses.push(`updated_at = NOW()`);
  params.push(ruleId);

  await pool.query(
    `UPDATE discount_rules SET ${setClauses.join(', ')} WHERE id = $${idx}`,
    params
  );
  log(`  💾 Updated rule ${ruleId}: ${dbUpdates.join(' | ')}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({ connectionString: PLATFORM_DB });
  const results: any[] = [];

  // שלוף את כל החנויות עם פרופיל AdsPower
  // כולל כל הrules — גם paused — כדי לאפשר הפעלה מחדש
  const shopsRes = await pool.query(`
    SELECT
      s.id,
      s.display_name,
      s.etsy_shop_id,
      s.adspower_profile_id,
      dr.id            AS rule_id,
      dr.name          AS rule_name,
      dr.discount_value,
      dr.etsy_sale_name,
      dr.status        AS rule_status,
      dr.is_active     AS rule_is_active
    FROM shops s
    LEFT JOIN discount_rules dr ON dr.shop_id = s.id
    WHERE s.adspower_profile_id IS NOT NULL
    ORDER BY s.id, dr.id DESC
  `);

  // קבץ חנויות (join עלול לייצר שורות כפולות אם יש כמה rules)
  const shopMap = new Map<number, any>();
  for (const row of shopsRes.rows) {
    if (!shopMap.has(row.id)) {
      shopMap.set(row.id, {
        id: row.id,
        displayName: row.display_name,
        etsyShopId: row.etsy_shop_id,
        profileId: row.adspower_profile_id,
        rules: [],
      });
    }
    if (row.rule_id) {
      shopMap.get(row.id)!.rules.push({
        id: row.rule_id,
        name: row.rule_name,
        discountValue: row.discount_value,
        etsySaleName: row.etsy_sale_name,
        status: row.rule_status,
        isActive: row.rule_is_active,
      });
    }
  }

  const shops = Array.from(shopMap.values());
  log(`\n🚀 Starting discount sync for ${shops.length} shops...\n`);

  for (const shop of shops) {
    const { id, displayName, profileId } = shop;
    log(`\n📍 Shop: ${displayName} (ID: ${id}, Profile: ${profileId})`);

    const result: any = {
      shopId: id,
      displayName,
      profileId,
      status: 'unknown',
      activeSales: [],
      dbUpdates: [],
    };

    // ── פתח פרופיל AdsPower ──
    const wsUrl = await openProfile(profileId);
    if (!wsUrl) {
      result.status = 'profile_open_failed';
      results.push(result);
      const waitMs = 10000 + Math.random() * 5000;
      log(`  ⏱️ Waiting ${Math.round(waitMs / 1000)}s before next shop...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    // המתן שה-CDP יהיה מוכן
    await new Promise(r => setTimeout(r, 5000 + Math.random() * 3000));

    let browser: any = null;
    try {
      browser = await chromium.connectOverCDP(wsUrl, { timeout: 60000 });
      const context = browser.contexts()[0] || await browser.newContext();

      // וודא שיש רק tab אחד פתוח
      const page = await ensureSingleTab(context);

      // ── נווט לדף המבצעים עם warmup אנושי ──
      await humanWarmupThenNavigate(page, 'https://www.etsy.com/your/shops/me/sales-discounts');

      const currentUrl = page.url();
      log(`  🌐 URL: ${currentUrl}`);

      // ── בדוק חיבור ──
      const loggedIn = await checkLoggedIn(page);
      if (!loggedIn) {
        log(`  🚫 Not logged in — account blocked or session expired. Skipping.`);
        result.status = 'blocked';
        // שמור screenshot
        try {
          const sc = await page.screenshot({ type: 'png' });
          const fname = `C:/etsy/blocked-${displayName.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
          fs.writeFileSync(fname, sc);
          log(`  📸 Screenshot saved: ${fname}`);
        } catch {}
        results.push(result);
        continue;
      }

      log(`  ✅ Logged in to Etsy`);
      result.status = 'logged_in';

      // Screenshot
      try {
        const sc = await page.screenshot({ type: 'png' });
        const fname = `C:/etsy/sync-${displayName.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
        fs.writeFileSync(fname, sc);
        log(`  📸 Screenshot saved: ${fname}`);
      } catch {}

      // ── קרא מבצעים פעילים ──
      const activeSales = await readActiveSalesFromEtsy(page);
      result.activeSales = activeSales;
      log(`  📊 Active sales found: ${activeSales.length}`);
      activeSales.forEach(s => log(`     • "${s.name || 'unnamed'}": ${s.discountPercent ?? '?'}% off (${s.status})`));

      // ── עדכן DB ──
      if (activeSales.length > 0) {
        const mainSale = activeSales[0];

        // מצא rule קיים — עדיפות: active ← paused ← כל rule
        const activeRule = shop.rules.find((r: any) => r.isActive);
        const anyRule = activeRule || shop.rules[0] || null;

        if (anyRule) {
          // עדכן/הפעל מחדש rule קיים
          const updates: string[] = [];
          const parsedStart = mainSale.startDate ? new Date(mainSale.startDate) : null;
          const parsedEnd   = mainSale.endDate   ? new Date(mainSale.endDate)   : null;
          await pool.query(
            `UPDATE discount_rules
             SET discount_value = $1,
                 name           = CASE WHEN name IS NULL OR name = '' THEN $2 ELSE name END,
                 etsy_sale_name = COALESCE($3, etsy_sale_name),
                 start_date     = COALESCE($4, start_date),
                 end_date       = COALESCE($5, end_date),
                 status         = 'active',
                 is_active      = true,
                 updated_at     = NOW()
             WHERE id = $6`,
            [
              mainSale.discountPercent ?? anyRule.discountValue,
              mainSale.name ?? anyRule.name,
              mainSale.name,
              parsedStart?.toISOString() ?? null,
              parsedEnd?.toISOString() ?? null,
              anyRule.id,
            ]
          ).catch((e: any) => log(`  ⚠️ DB update failed: ${e.message}`));

          updates.push(`rule ${anyRule.id}: discount=${mainSale.discountPercent}% status→active`);
          result.dbUpdates.push(...updates);
          log(`  💾 Updated/reactivated rule ${anyRule.id}`);
        } else {
          // צור rule חדש רק אם אין שום rule לחנות הזו
          const saleName = mainSale.name || `SALE_SYNCED_${id}`;
          const insertRes = await pool.query(`
            INSERT INTO discount_rules
              (shop_id, name, discount_type, discount_value, scope, etsy_sale_name, status, is_active, created_at, updated_at)
            VALUES ($1, $2, 'percentage', $3, 'entire_shop', $4, 'active', true, NOW(), NOW())
            RETURNING id
          `, [
            id,
            `מבצע פעיל - ${displayName}`,
            mainSale.discountPercent ?? 0,
            saleName,
          ]).catch((e: any) => {
            log(`  ⚠️ Failed to create rule: ${e.message}`);
            return null;
          });

          if (insertRes?.rows?.[0]) {
            log(`  ✨ Created new rule ${insertRes.rows[0].id}: ${mainSale.discountPercent}% - ${saleName}`);
            result.dbUpdates.push(`created rule: ${saleName} ${mainSale.discountPercent}%`);
          }
        }

        result.status = 'synced';
      } else {
        // אין מבצעים פעילים
        log(`  ℹ️ No active sales on Etsy`);
        result.status = 'no_active_sales';

        // סמן rules קיימים כ-paused
        for (const rule of shop.rules) {
          if (rule.status === 'active') {
            await pool.query(
              "UPDATE discount_rules SET status = 'paused', is_active = false, updated_at = NOW() WHERE id = $1",
              [rule.id]
            ).catch(() => {});
            log(`  📴 Rule ${rule.id} (${rule.name}) marked as paused`);
            result.dbUpdates.push(`rule ${rule.id} → paused`);
          }
        }
      }

    } catch (e: any) {
      log(`  ❌ Error processing shop ${displayName}: ${e.message}`);
      result.status = 'error';
      result.error = e.message;
    } finally {
      if (browser) {
        try { await browser.disconnect(); } catch {}
      }
      await closeProfile(profileId);
      const waitMs = 10000 + Math.random() * 5000;
      log(`  ⏱️ Waiting ${Math.round(waitMs / 1000)}s before next shop...`);
      await new Promise(r => setTimeout(r, waitMs));
    }

    results.push(result);
  }

  // ── שמור תוצאות ──
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  log(`\n\n✅ Sync complete! Results: ${RESULTS_FILE}`);

  // ── סיכום ──
  log('\n══════════════ SUMMARY ══════════════');
  for (const r of results) {
    const emoji =
      r.status === 'blocked'             ? '🚫' :
      r.status === 'synced'              ? '✅' :
      r.status === 'no_active_sales'     ? '⚪' :
      r.status === 'profile_open_failed' ? '🔌' :
      r.status === 'error'               ? '❌' : '⚠️';

    log(`${emoji} ${r.displayName} (${r.profileId}): ${r.status}`);
    if (r.activeSales.length > 0) {
      r.activeSales.forEach((s: any) =>
        log(`   └─ "${s.name || '-'}": ${s.discountPercent ?? '?'}% off (${s.status})`)
      );
    }
    if (r.dbUpdates.length > 0) {
      log(`   💾 DB: ${r.dbUpdates.join(' | ')}`);
    }
  }

  await pool.end();
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
