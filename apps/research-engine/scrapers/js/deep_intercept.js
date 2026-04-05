const { chromium } = require('playwright');
const fs = require('fs');
const axios = require('axios');

async function deepIntercept() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();
  
  console.log('Pages:', pages.map(p => p.url()));
  
  // === ALURA: Inject fetch interceptor to capture Bearer token ===
  let aluraPage = pages.find(p => p.url().includes('alura.io'));
  if (!aluraPage) {
    aluraPage = await context.newPage();
    await aluraPage.goto('https://app.alura.io/', { waitUntil: 'networkidle', timeout: 20000 });
  }
  
  // Inject interceptor into page
  const aluraToken = await aluraPage.evaluate(() => {
    return new Promise((resolve) => {
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0];
        const options = args[1] || {};
        const auth = (options.headers || {})['Authorization'] || (options.headers || {})['authorization'];
        if (url && url.toString().includes('alura.io/api') && auth) {
          window._capturedToken = auth;
          resolve(auth);
        }
        return originalFetch.apply(this, args);
      };
      
      // Also intercept XHR
      const origOpen = XMLHttpRequest.prototype.open;
      const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
      XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        if (name.toLowerCase() === 'authorization' && value.includes('Bearer')) {
          window._capturedToken = value;
          resolve(value);
        }
        return origSetHeader.apply(this, arguments);
      };
      
      // Check if token already exists
      if (window._capturedToken) resolve(window._capturedToken);
      
      // Timeout after 30s
      setTimeout(() => resolve(null), 30000);
    });
  });
  
  console.log('Alura token from inject:', aluraToken ? aluraToken.substring(0, 100) : 'null');
  
  if (!aluraToken) {
    // Try navigating to keyword research and triggering search
    await aluraPage.goto('https://app.alura.io/research/keyword-finder', { waitUntil: 'networkidle', timeout: 20000 });
    const url = aluraPage.url();
    console.log('Alura URL:', url);
    const title = await aluraPage.title();
    console.log('Title:', title);
    
    // Get page HTML to understand structure
    const html = await aluraPage.evaluate(() => document.body.innerHTML.substring(0, 2000));
    console.log('HTML preview:', html.substring(0, 500));
  }
  
  // === eRank: Get the actual network request from browser ===
  const erankPage = pages.find(p => p.url().includes('erank.com'));
  if (erankPage) {
    // Get ALL cookies from eRank
    const cookies = await context.cookies(['https://app.erank.com', 'https://erank.com', 'https://members.erank.com']);
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    
    // Get XSRF from DOM
    const xsrfMeta = await erankPage.evaluate(() => {
      const meta = document.querySelector('meta[name="csrf-token"]') || 
                   document.querySelector('meta[name="_token"]');
      return meta ? meta.getAttribute('content') : null;
    });
    
    // Get XSRF from cookie  
    const xsrfCookie = cookies.find(c => c.name === 'XSRF-TOKEN')?.value || '';
    const erSess = cookies.find(c => c.name === 'er_sess_x')?.value || '';
    const sidEr = cookies.find(c => c.name === 'sid_er')?.value || '';
    
    console.log('\nErank cookies found:', cookies.map(c=>c.name));
    console.log('er_sess_x:', erSess.substring(0, 50));
    console.log('XSRF-TOKEN:', xsrfCookie.substring(0, 50));
    console.log('XSRF meta tag:', xsrfMeta?.substring(0, 50));
    
    // Save all eRank auth info
    fs.writeFileSync('C:/Windows/Temp/erank_auth.json', JSON.stringify({
      cookies: cookieStr,
      xsrf: decodeURIComponent(xsrfCookie),
      xsrfMeta,
      er_sess_x: erSess,
      sid_er: sidEr
    }, null, 2));
    
    // Navigate eRank to keyword research and perform search
    if (!erankPage.url().includes('keyword-explorer')) {
      await erankPage.goto('https://app.erank.com/keyword-explorer', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await erankPage.waitForTimeout(2000);
    }
    
    // Register response interceptor to see what eRank API returns
    erankPage.on('response', async resp => {
      const url = resp.url();
      if (url.includes('erank.com/api') || url.includes('erank.com/keyword')) {
        const status = resp.status();
        console.log(`📥 eRank Response: ${status} ${url.substring(0, 100)}`);
        if (status === 200) {
          const text = await resp.text().catch(() => '');
          console.log('   Data:', text.substring(0, 300));
          fs.writeFileSync('C:/Windows/Temp/erank_sample.json', text);
        }
      }
    });
    
    // Try performing a search
    await erankPage.waitForTimeout(1000);
    const pageHtml = await erankPage.evaluate(() => document.body.innerHTML.substring(0, 3000));
    
    // Find search input
    const inputInfo = await erankPage.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      return inputs.map(i => ({ type: i.type, placeholder: i.placeholder, id: i.id, name: i.name, class: i.className.substring(0,50) }));
    });
    console.log('eRank inputs:', JSON.stringify(inputInfo));
    
    if (inputInfo.length > 0) {
      // Try to type in the first input
      const selector = inputInfo[0].id ? `#${inputInfo[0].id}` : inputInfo[0].name ? `[name="${inputInfo[0].name}"]` : 'input';
      try {
        await erankPage.fill(selector, 'ceramic bowl');
        await erankPage.keyboard.press('Enter');
        console.log('Typed in eRank search');
        await erankPage.waitForTimeout(5000);
      } catch(e) { console.log('eRank type error:', e.message.split('\n')[0]); }
    }
  }
  
  await browser.close();
  console.log('\nDone!');
}

deepIntercept().catch(e => console.error('Fatal:', e.message.split('\n')[0]));
