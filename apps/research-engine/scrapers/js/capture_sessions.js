/**
 * capture_sessions.js
 * פותח Playwright browser עם Google Chrome הקיים,
 * ניווט לאתרים, ושמירת storage_state לקבצי session.
 */

const PROJ = 'C:\\Users\\Administrator\\Desktop\\קלוד\\מחקר';
process.chdir(PROJ);

const { chromium } = require(PROJ + '\\node_modules\\playwright');
const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(PROJ, 'apps', 'new-store', 'sessions');

const delay = ms => new Promise(r => setTimeout(r, ms));

async function captureSession(name, url, checkFn, outputFile) {
  console.log(`\n[${name}] Launching browser...`);

  // שימוש ב-Chrome הקיים (channel)
  const browser = await chromium.launch({
    headless: false,  // פתוח - כדי שהמשתמש יוכל לראות
    channel: 'chrome',
    args: ['--no-sandbox', '--start-maximized']
  });

  const context = await browser.newContext({
    viewport: null,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();
  console.log(`[${name}] Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(3000);

  const loggedIn = await checkFn(page);

  if (loggedIn) {
    console.log(`[${name}] LOGGED IN - saving session...`);
    await context.storageState({ path: outputFile });
    console.log(`[${name}] Session saved to ${outputFile}`);
  } else {
    console.log(`[${name}] NOT logged in! Current URL: ${page.url()}`);
    console.log(`[${name}] Please login manually in the browser window and press Enter here...`);
    process.stdin.once('data', async () => {});
    await delay(30000);  // 30 שניות לlogin ידני
    await context.storageState({ path: outputFile });
    console.log(`[${name}] Session saved (after manual login)`);
  }

  await browser.close();
}

async function main() {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });

  // === ALURA ===
  try {
    await captureSession(
      'Alura',
      'https://app.alura.io/dashboard',
      async (page) => {
        const url = page.url();
        return !url.includes('login') && !url.includes('signin');
      },
      path.join(SESSIONS_DIR, 'alura_session.json')
    );
  } catch (e) {
    console.error('[Alura] Error:', e.message);
  }

  // === eRank ===
  try {
    await captureSession(
      'eRank',
      'https://members.erank.com/dashboard',
      async (page) => {
        const url = page.url();
        return !url.includes('login') && !url.includes('plans');
      },
      path.join(SESSIONS_DIR, 'erank_session.json')
    );
  } catch (e) {
    console.error('[eRank] Error:', e.message);
  }

  // === ETSY ===
  try {
    await captureSession(
      'Etsy',
      'https://www.etsy.com',
      async (page) => {
        // Etsy לא חייב login לסריקה
        return true;
      },
      path.join(SESSIONS_DIR, 'etsy_session.json')
    );
  } catch (e) {
    console.error('[Etsy] Error:', e.message);
  }

  console.log('\n=== DONE ===');
  console.log('Sessions saved:');
  for (const f of fs.readdirSync(SESSIONS_DIR)) {
    const p = path.join(SESSIONS_DIR, f);
    console.log(`  ${p} (${fs.statSync(p).size.toLocaleString()} bytes)`);
  }
}

main().catch(console.error);
