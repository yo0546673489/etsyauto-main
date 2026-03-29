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
      await this.page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
      await this.page.waitForTimeout(2000);

      await this.human.humanScroll('down', randomBetween(200, 400));
      await this.human.readingDelay(200);
      await this.human.randomMouseMovement();
      await this.human.thinkBeforeSending();

      // Find the reply textarea (Etsy uses placeholder "Type your reply")
      const textareaSelector = 'textarea[placeholder="Type your reply"]';
      await this.page.waitForSelector(textareaSelector, { timeout: 10000 });

      // Click and type with human behavior
      await this.human.humanClick(textareaSelector);
      await this.human.humanTypeInFocus(messageText);
      await this.human.readingDelay(messageText.length);

      // Find send button: it's positioned inside the textarea container (right padding area)
      const sent = await this.page.evaluate(() => {
        const ta = document.querySelector('textarea[placeholder="Type your reply"]');
        if (!ta) return false;

        // Walk up to find the container, then find a button inside it
        let container: Element | null = ta.parentElement;
        for (let i = 0; i < 5; i++) {
          if (!container) break;
          const btn = container.querySelector(
            'button[type="button"]:not([disabled]), button[type="submit"]:not([disabled])'
          );
          if (btn && btn !== container.querySelector('.wt-input-btn-group__btn')) {
            (btn as HTMLElement).click();
            return true;
          }
          container = container.parentElement;
        }
        return false;
      });

      if (!sent) {
        // Fallback: Ctrl+Enter (works in many Etsy versions)
        logger.warn('Send button not found, trying Ctrl+Enter');
        await this.page.keyboard.press('Control+Return');
      }

      await this.page.waitForTimeout(2500);

      // Verify the message appeared
      const verified = await this.page.evaluate((text: string) => {
        const bubbles = document.querySelectorAll(
          'div.scrolling-message-list div.wt-rounded.wt-text-body-01.wt-sem-bg-surface-informational-subtle'
        );
        const preview = text.substring(0, 30);
        return Array.from(bubbles).some(b => b.textContent?.includes(preview));
      }, messageText);

      if (verified) {
        logger.info('Reply sent and verified');
        return true;
      }

      logger.warn('Reply sent but could not verify appearance');
      return true; // Assume sent if no error
    } catch (error) {
      logger.error('Failed to send reply', error);
      return false;
    }
  }
}
