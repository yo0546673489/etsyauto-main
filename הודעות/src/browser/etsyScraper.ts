// Etsy Message Scraper
// הערה: הסלקטורים הם PLACEHOLDERS - צריך להריץ scripts/inspect-selectors.ts לעדכן אותם

import { Page } from 'playwright';
import { HumanBehavior } from './humanBehavior';
import { logger } from '../utils/logger';

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

  async scrapeConversationList(): Promise<{ customerName: string; url: string }[]> {
    await this.human.enterMessagesPage('https://www.etsy.com/your/messages');

    const conversations: { customerName: string; url: string }[] = [];
    let previousCount = 0;
    let loadAttempts = 0;

    while (loadAttempts < 20) {
      // TODO: עדכן סלקטורים אחרי inspect-selectors.ts
      const currentConvos = await this.page.evaluate(() => {
        const items = document.querySelectorAll('[data-conversation-id], .conversation-card, .message-thread-item');
        return Array.from(items).map(item => {
          const link = item.querySelector('a');
          const nameEl = item.querySelector('.sender-name, .conversation-partner, [data-buyer-name]');
          return {
            customerName: nameEl?.textContent?.trim() || 'Unknown',
            url: link?.href || '',
          };
        }).filter(c => c.url);
      });

      if (currentConvos.length === previousCount) {
        loadAttempts++;
        if (loadAttempts >= 3) break;
      } else {
        loadAttempts = 0;
        previousCount = currentConvos.length;
      }

      conversations.length = 0;
      conversations.push(...currentConvos);

      await this.human.humanScroll('down', 500);
      await this.human.randomMouseMovement();
    }

    logger.info(`Found ${conversations.length} conversations`);
    return conversations;
  }

  async scrapeConversation(conversationUrl: string): Promise<ScrapedConversation> {
    await this.human.humanNavigate(conversationUrl);
    await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await this.human.scrollToTop();
    await this.human.randomMouseMovement();

    // TODO: עדכן סלקטורים אחרי inspect-selectors.ts
    const messages = await this.page.evaluate((storeName: string) => {
      const messageElements = document.querySelectorAll(
        '.message-thread-message, .convo-message, [data-message-id]'
      );
      return Array.from(messageElements).map(el => {
        const nameEl = el.querySelector('.message-sender-name, .sender-name, [data-sender]');
        const textEl = el.querySelector('.message-body, .message-text, [data-message-body]');
        const timeEl = el.querySelector('.message-date, .timestamp, time');
        const senderName = nameEl?.textContent?.trim() || 'Unknown';
        const isStore = senderName.toLowerCase() === storeName.toLowerCase();
        return {
          senderName,
          senderType: isStore ? 'store' : 'customer',
          messageText: textEl?.textContent?.trim() || '',
          sentAt: timeEl?.getAttribute('datetime') || timeEl?.textContent?.trim() || new Date().toISOString(),
        };
      }).filter(m => m.messageText);
    }, this.storeName);

    const customerMessage = messages.find(m => m.senderType === 'customer');
    const customerName = customerMessage?.senderName || 'Unknown Customer';

    const totalTextLength = messages.reduce((acc, m) => acc + m.messageText.length, 0);
    await this.human.readingDelay(totalTextLength);

    logger.info(`Scraped ${messages.length} messages from conversation`);

    return {
      conversationUrl,
      customerName,
      messages: messages as ScrapedMessage[],
    };
  }
}
