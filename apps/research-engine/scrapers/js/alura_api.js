const { chromium } = require('playwright');
const fs = require('fs');
const https = require('https');

const API_BASE = 'https://alura-api-3yk57ena2a-uc.a.run.app';

async function apiCall(token, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://app.alura.io',
        'Referer': 'https://app.alura.io/'
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, raw: data.substring(0, 500) }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  // Get fresh token from browser
  console.log('🔗 מקבל token מ-Chrome...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  let page = context.pages().find(p => p.url().includes('alura.io')) || await context.newPage();

  let token = null;
  page.on('request', req => {
    if (req.url().includes('alura-api') && req.headers()['authorization']) {
      token = req.headers()['authorization'];
    }
  });

  await page.goto('https://app.alura.io/research/keyword', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);

  if (!token) {
    console.log('⚠️ לא קיבלתי token מrequest, מנסה מIndexedDB...');
    // Get Firebase token from IndexedDB
    const fbData = await page.evaluate(() => new Promise(resolve => {
      const req = indexedDB.open('firebaseLocalStorageDb');
      req.onsuccess = e => {
        const db = e.target.result;
        const tx = db.transaction('firebaseLocalStorage', 'readonly');
        const store = tx.objectStore('firebaseLocalStorage');
        store.getAll().onsuccess = e => resolve(e.target.result);
      };
      req.onerror = () => resolve([]);
      setTimeout(() => resolve([]), 3000);
    }));

    const authUser = fbData.find(item => item.fbase_key && item.fbase_key.includes('authUser'));
    if (authUser) {
      // Get fresh token
      token = await page.evaluate(() =>
        firebase?.auth?.()?.currentUser?.getIdToken(true).catch(() => null)
      ).catch(() => null);
    }
  }

  // If still no token, try to get from next request
  if (!token) {
    console.log('מנסה לקבל token ע"י navigation...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
  }

  await browser.close();

  if (!token) {
    // Use saved token
    try {
      const saved = JSON.parse(fs.readFileSync('C:\\Windows\\Temp\\alura_auth.json', 'utf8'));
      token = saved.token;
      console.log('משתמש ב-token שמור');
    } catch(e) {
      console.log('❌ אין token!');
      process.exit(1);
    }
  }

  console.log('✅ Token:', token.substring(0, 60) + '...');

  // Test different API endpoints
  const endpoints = [
    '/api/keyword-research/v2/search?keyword=personalized+gift&marketplace=etsy&language=english&page=1&limit=20',
    '/api/keyword-research/search?keyword=personalized+gift&marketplace=etsy&language=english',
    '/api/keywords?keyword=personalized+gift&marketplace=etsy',
    '/api/keyword-research?q=personalized+gift',
    '/api/keyword-research/trending?marketplace=etsy&limit=50',
    '/api/keyword-research/v2/trending?marketplace=etsy&limit=50',
  ];

  for (const ep of endpoints) {
    try {
      console.log(`\n🔍 Testing: ${ep.substring(0, 60)}...`);
      const result = await apiCall(token, ep);
      console.log(`Status: ${result.status}`);
      if (result.data) {
        console.log('Data:', JSON.stringify(result.data).substring(0, 300));
      } else {
        console.log('Raw:', result.raw);
      }
    } catch(e) {
      console.log('Error:', e.message);
    }
  }

})().catch(e => console.error('Error:', e.message));
