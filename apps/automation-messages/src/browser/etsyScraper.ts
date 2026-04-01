import { Page } from 'playwright';
import { HumanBehavior } from './humanBehavior';
import { logger } from '../utils/logger';

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, randomBetween(minMs, maxMs)));
}

export interface ScrapedMessage {
  senderName: string;
  senderType: 'customer' | 'store';
  messageText: string;
  sentAt: string;
}

export interface ScrapedConversation {
  conversationUrl: string;
  customerName: string;
  messages: ScrapedMessage[];
}

export class EtsyScraper {
  private page: Page;
  private human: HumanBehavior;
  private storeName: string;

  constructor(page: Page, storeName: string) {
    this.page = page;
    this.human = new HumanBehavior(page);
    this.storeName = storeName;
  }

  /**
   * Check if the profile is currently logged into Etsy.
   * Navigates to etsy.com and checks for user session indicators.
   */
  async checkEtsyLogin(): Promise<boolean> {
    try {
      await this.page.goto('https://www.etsy.com/messages', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await randomDelay(2000, 3000);

      const currentUrl = this.page.url();
      const pageTitle = await this.page.title().catch(() => '');
      const pageContent = await this.page.content();

      // If redirected to signin → definitely not logged in
      if (currentUrl.includes('/signin') || currentUrl.includes('/login') || currentUrl.includes('/join')) {
        logger.warn(`[EtsyScraper] checkEtsyLogin: Redirected to login page: ${currentUrl}`);
        return false;
      }

      // If we land on the Messages page → logged in
      if (currentUrl.includes('/messages') && (pageTitle.includes('Messages') || pageTitle.includes('Etsy'))) {
        // Confirm by checking for page content that only appears when logged in
        const isMessagesPage = pageContent.includes('scrolling-message-list') ||
                               pageContent.includes('inbox') ||
                               pageTitle.toLowerCase().includes('messages') ||
                               currentUrl === 'https://www.etsy.com/messages';
        if (isMessagesPage) {
          logger.info(`[EtsyScraper] checkEtsyLogin: LOGGED IN ✓ (on messages page)`);
          return true;
        }
      }

      // Content-based check (most reliable)
      const isLoggedIn = pageContent.includes('"isLoggedIn":true') ||
                         pageContent.includes('"logged_in":true') ||
                         pageContent.includes('"user_id"') ||
                         pageContent.includes('sign-out');

      logger.info(`[EtsyScraper] checkEtsyLogin: ${isLoggedIn ? 'LOGGED IN ✓' : 'NOT LOGGED IN ✗'} | URL: ${currentUrl}`);
      return isLoggedIn;
    } catch (err: any) {
      logger.error(`[EtsyScraper] checkEtsyLogin error: ${err?.message}`);
      // On error, assume logged in to avoid blocking legit syncs
      return true;
    }
  }

  async scrapeConversation(conversationUrl: string, knownCustomerName?: string): Promise<ScrapedConversation> {
    logger.info(`[EtsyScraper] Navigating to conversation: ${conversationUrl.substring(0, 80)}...`);

    await this.human.humanNavigate(conversationUrl);

    // Wait for full page load
    await this.page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    await randomDelay(2000, 4000);

    const currentUrl = this.page.url();
    const pageTitle = await this.page.title().catch(() => '');

    logger.info(`[EtsyScraper] Page loaded → URL: ${currentUrl.substring(0, 100)} | Title: "${pageTitle.substring(0, 60)}"`);

    // ── 1. Check if redirected to login page ──────────────────────────────────
    const isLoginPage =
      currentUrl.includes('/signin') ||
      currentUrl.includes('/login') ||
      currentUrl.includes('/join') ||
      pageTitle.toLowerCase().includes('sign in') ||
      pageTitle.toLowerCase().includes('log in');

    if (isLoginPage) {
      throw new Error(`ETSY_NOT_LOGGED_IN: Profile is not authenticated on Etsy. Redirected to: ${currentUrl}`);
    }

    // ── 2. Check redirect from ablink worked (must be on etsy.com) ────────────
    const isOnEtsy = currentUrl.includes('etsy.com');
    if (!isOnEtsy) {
      throw new Error(`REDIRECT_FAILED: Navigation did not land on Etsy. Current URL: ${currentUrl}`);
    }

    // ── 3. Must be on messages/conversations page ─────────────────────────────
    const isOnMessages =
      currentUrl.includes('/messages/') ||
      currentUrl.includes('/conversations/') ||
      currentUrl.includes('/your/conversations');

    if (!isOnMessages) {
      // Maybe the ablink went to the Etsy homepage or shop page — not a conversation
      logger.warn(`[EtsyScraper] Not on messages page after navigation. URL: ${currentUrl}`);
      throw new Error(`WRONG_PAGE: Expected messages page but got: ${currentUrl}`);
    }

    // ── 4. Capture clean Etsy URL (strip tracking params) ────────────────────
    const finalUrl = currentUrl.split('?')[0].replace(/#.*$/, '');
    if (finalUrl !== conversationUrl) {
      logger.info(`[EtsyScraper] Resolved redirect → ${finalUrl}`);
    }

    await this.human.randomMouseMovement();

    // ── 5. Wait for messages container (with timeout) ─────────────────────────
    const containerExists = await this.page
      .waitForSelector('div.scrolling-message-list', { timeout: 15000 })
      .then(() => true)
      .catch(() => false);

    if (!containerExists) {
      const pagePreview = await this.page.content()
        .then(html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 400))
        .catch(() => 'could not get page content');
      logger.warn(`[EtsyScraper] Messages container NOT FOUND. URL: ${currentUrl}\nPage text preview: ${pagePreview}`);
      throw new Error(`SCRAPE_FAILED: Could not find messages container on ${currentUrl}`);
    }

    // ── 6. Scrape messages ────────────────────────────────────────────────────
    const scraped = await this.page.evaluate((storeName: string) => {
      const container = document.querySelector('div.scrolling-message-list');
      if (!container) return { messages: [], customerName: '' };

      // Customer name from conversation header
      const headerEl = container.querySelector('[class*="conversation"] [class*="name"], h1, h2');
      let customerName = headerEl?.textContent?.trim() || '';

      // Try broader header search if not found inside container
      if (!customerName) {
        const h1 = document.querySelector('h1');
        if (h1) customerName = h1.textContent?.trim() || '';
      }

      // Message bubbles
      const bubbles = container.querySelectorAll('div.wt-rounded.wt-text-body-01');
      const messages: { senderType: string; senderName: string; messageText: string; sentAt: string }[] = [];

      bubbles.forEach(el => {
        const text = el.textContent?.trim() || '';
        if (text.length < 1) return;

        const clean = text.replace(/^Message:\s*/i, '').trim();
        if (!clean) return;

        // Determine if store or customer message
        const isStore =
          el.classList.contains('wt-sem-bg-surface-informational-subtle') ||
          el.classList.contains('wt-bg-slime-tint') ||
          el.closest('[class*="seller"]') !== null ||
          el.closest('[class*="shop"]') !== null ||
          el.closest('[class*="outgoing"]') !== null ||
          (() => {
            let parent = el.parentElement;
            for (let i = 0; i < 5; i++) {
              if (!parent) break;
              const cls = parent.className || '';
              if (
                cls.includes('wt-justify-content-flex-end') ||
                cls.includes('justify-end') ||
                cls.includes('right')
              )
                return true;
              parent = parent.parentElement;
            }
            return false;
          })();

        messages.push({
          senderType: isStore ? 'store' : 'customer',
          senderName: isStore ? storeName : '',
          messageText: clean,
          sentAt: new Date().toISOString(),
        });
      });

      // Deduplicate identical consecutive messages
      const deduped = messages.filter(
        (m, i) => i === 0 || m.messageText !== messages[i - 1].messageText
      );

      return { messages: deduped, customerName };
    }, this.storeName);

    // ── 7. Validate result ────────────────────────────────────────────────────
    if (scraped.messages.length === 0) {
      logger.warn(
        `[EtsyScraper] ⚠️ Scraped 0 messages from ${finalUrl}. ` +
        `The page structure may have changed or messages are hidden. ` +
        `Profile may need re-authentication.`
      );
    } else {
      logger.info(`[EtsyScraper] ✓ Scraped ${scraped.messages.length} messages`);
    }

    const customerName =
      knownCustomerName ||
      scraped.messages.find(m => m.senderType === 'customer')?.senderName ||
      scraped.customerName ||
      'Unknown Customer';

    const totalTextLength = scraped.messages.reduce((acc, m) => acc + m.messageText.length, 0);
    await this.human.readingDelay(Math.min(totalTextLength, 500));

    return {
      conversationUrl: finalUrl,
      customerName,
      messages: scraped.messages as ScrapedMessage[],
    };
  }
}
