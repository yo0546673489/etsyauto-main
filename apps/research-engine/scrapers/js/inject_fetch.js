const { chromium } = require('playwright');
const fs = require('fs');

async function injectFetch() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  
  // Get fresh page list
  const pages = context.pages();
  console.log('All pages:', pages.map(p => p.url()));
  
  // Find pages by URL
  let aluraPage = pages.find(p => p.url().includes('alura.io'));
  let erankPage = pages.find(p => p.url().includes('erank.com'));
  
  // === ALURA: Inject fetch interceptor and trigger keyword search ===
  if (aluraPage) {
    console.log('\n--- ALURA ---');
    console.log('URL:', aluraPage.url());
    
    // Inject token capture into the page
    await aluraPage.evaluate(() => {
      if (!window._aluraCapturing) {
        window._aluraCapturing = true;
        const origFetch = window.fetch;
        window.fetch = async (...args) => {
          const result = await origFetch(...args);
          return result;
        };
        
        // Override XHR
        const XHR = XMLHttpRequest.prototype;
        const origSend = XHR.send;
        const origSetHeader = XHR.setRequestHeader;
        XHR._headers = {};
        XHR.setRequestHeader = function(k, v) {
          this._headers = this._headers || {};
          this._headers[k] = v;
          if (k.toLowerCase() === 'authorization') window._aluraToken = v;
          return origSetHeader.apply(this, arguments);
        };
      }
    });
    
    // Try to navigate to keyword research within the SPA
    const currentUrl = aluraPage.url();
    if (!currentUrl.includes('/research') && !currentUrl.includes('/keyword')) {
      // Find and click keyword research from within the app
      const clicked = await aluraPage.evaluate(() => {
        const els = Array.from(document.querySelectorAll('*'));
        for (const el of els) {
          const text = el.textContent?.trim().toLowerCase();
          if ((text === 'keyword research' || text === 'keyword finder') && el.tagName !== 'BODY') {
            el.click();
            return el.outerHTML.substring(0, 200);
          }
        }
        return null;
      });
      console.log('Clicked:', clicked);
      await aluraPage.waitForTimeout(2000);
    }
    
    // Get the page's window object for auth info
    const authInfo = await aluraPage.evaluate(() => {
      return {
        token: window._aluraToken,
        // Check Firebase/Auth0/Supabase common patterns
        firebaseUser: window.__firebase_app ? 'firebase detected' : null,
        auth0: window.__auth0Client ? 'auth0 detected' : null,
        // Check React internals for auth state
        reactRoot: document.getElementById('root') ? 'has root' : 'no root'
      };
    });
    console.log('Auth info:', JSON.stringify(authInfo));
    
    // Wait and check for network requests
    await aluraPage.waitForTimeout(3000);
    const token = await aluraPage.evaluate(() => window._aluraToken);
    if (token) {
      console.log('✅ Got token from XHR:', token.substring(0, 100));
      fs.writeFileSync('C:/Windows/Temp/alura_token.txt', token);
    }
  }
  
  // === ERANK: Use page's own fetch context ===
  if (erankPage) {
    console.log('\n--- eRank ---');
    console.log('URL:', erankPage.url());
    
    // Make API call from within eRank page (uses browser's cookies automatically)
    const result = await erankPage.evaluate(async () => {
      try {
        // Get XSRF token from cookie
        const xsrf = document.cookie.split(';')
          .find(c => c.trim().startsWith('XSRF-TOKEN='))
          ?.split('=')[1]?.trim() || '';
        
        const decodedXsrf = decodeURIComponent(xsrf);
        console.log('XSRF:', decodedXsrf.substring(0, 50));
        
        // Make API call using page's session
        const resp = await fetch('/api/v2/tool/keyword-explorer?keywords=ceramic+bowl&marketplace=etsy', {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'X-XSRF-TOKEN': decodedXsrf,
            'X-Requested-With': 'XMLHttpRequest'
          }
        });
        
        const text = await resp.text();
        return { status: resp.status, body: text.substring(0, 500), xsrf: decodedXsrf.substring(0, 50) };
      } catch(e) {
        return { error: e.message };
      }
    });
    
    console.log('eRank API result:', JSON.stringify(result));
    
    if (result.status === 200) {
      fs.writeFileSync('C:/Windows/Temp/erank_sample.json', result.body);
      console.log('✅ eRank API works!');
    }
  }
  
  await browser.close();
}

injectFetch().catch(e => console.error('Fatal:', e.message.split('\n')[0]));
