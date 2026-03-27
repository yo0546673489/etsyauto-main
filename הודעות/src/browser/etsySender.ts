// Etsy Message Sender
// הערה: הסלקטורים הם PLACEHOLDERS - צריך להריץ scripts/inspect-selectors.ts לעדכן אותם

import { Page } from 'playwright';
import { HumanBehavior } from './humanBehavior';
import { logger } from '../utils/logger';

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export class EtsySender {
  private page: Page;
  private human: HumanBehavior;

  constructor(page: Page) {
    this.page = page;
    this.human = new HumanBehavior(page);
  }

  async sendReply(conversationUrl: string, messageText: string): Promise<boolean> {
    try {
      await this.human.humanNavigate(conversationUrl);
      await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

      await this.human.humanScroll('down', randomBetween(200, 400));
      await this.human.readingDelay(200);
      await this.human.randomMouseMovement();
      await this.human.thinkBeforeSending();

      // TODO: עדכן סלקטורים אחרי inspect-selectors.ts
      const inputSelector = 'textarea[name="message"], .reply-textarea, [data-message-input]';
      await this.human.humanType(inputSelector, messageText);
      await this.human.readingDelay(messageText.length);

      // TODO: עדכן סלקטור כפתור שליחה
      const sendButtonSelector = 'button[type="submit"], .send-message-btn, [data-send-button]';
      await this.human.humanClick(sendButtonSelector);

      await this.page.waitForTimeout(2000);

      const sent = await this.page.evaluate((text: string) => {
        const messages = document.querySelectorAll('.message-body, .message-text');
        const lastMessage = messages[messages.length - 1];
        return lastMessage?.textContent?.includes(text.substring(0, 20)) || false;
      }, messageText);

      if (sent) {
        logger.info('Message sent successfully');
        return true;
      }

      logger.warn('Message may not have been sent - could not verify');
      return false;
    } catch (error) {
      logger.error('Failed to send message', error);
      return false;
    }
  }
}
