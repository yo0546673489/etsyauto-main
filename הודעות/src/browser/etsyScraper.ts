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

  async scrapeConversation(conversationUrl: string, knownCustomerName?: string): Promise<ScrapedConversation> {
    await this.human.humanNavigate(conversationUrl);
    await this.page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
    await randomDelay(1500, 3500);
    await this.human.randomMouseMovement();

    const scraped = await this.page.evaluate((storeName: string) => {
      const container = document.querySelector('div.scrolling-message-list');
      if (!container) return { messages: [], customerName: '' };

      // Customer name is in a header element at the top of the message list
      const headerEl = container.querySelector('[class*="conversation"] [class*="name"], h1, h2');
      let customerName = headerEl?.textContent?.trim() || '';

      // Message bubbles: wt-rounded + wt-text-body-01 + wt-p-xs-2
      const bubbles = container.querySelectorAll('div.wt-rounded.wt-text-body-01');
      const messages: { senderType: string; senderName: string; messageText: string; sentAt: string }[] = [];

      bubbles.forEach(el => {
        // Skip tiny elements (timestamps etc)
        const text = el.textContent?.trim() || '';
        if (text.length < 1) return;

        // Strip "Message:" prefix Etsy adds to aria/accessibility labels
        const clean = text.replace(/^Message:\s*/i, '').trim();
        if (!clean) return;

        // Store messages have wt-sem-bg-surface-informational-subtle
        const isStore = el.classList.contains('wt-sem-bg-surface-informational-subtle');

        messages.push({
          senderType: isStore ? 'store' : 'customer',
          senderName: isStore ? storeName : '',
          messageText: clean,
          sentAt: new Date().toISOString(),
        });
      });

      // Deduplicate identical consecutive messages (Etsy sometimes renders duplicates)
      const deduped = messages.filter((m, i) =>
        i === 0 || m.messageText !== messages[i - 1].messageText
      );

      return { messages: deduped, customerName };
    }, this.storeName);

    const customerName = knownCustomerName ||
      scraped.messages.find(m => m.senderType === 'customer')?.senderName ||
      scraped.customerName ||
      'Unknown Customer';

    const totalTextLength = scraped.messages.reduce((acc, m) => acc + m.messageText.length, 0);
    await this.human.readingDelay(Math.min(totalTextLength, 500));

    logger.info(`Scraped ${scraped.messages.length} messages from conversation`);

    return {
      conversationUrl,
      customerName,
      messages: scraped.messages as ScrapedMessage[],
    };
  }
}
