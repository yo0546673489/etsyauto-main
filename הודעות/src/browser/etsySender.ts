import { Page } from 'playwright';
import { HumanBehavior } from './humanBehavior';
import { logger } from '../utils/logger';

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, randomBetween(minMs, maxMs)));
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
      await randomDelay(1500, 3500);

      // Scroll down and simulate reading the conversation
      await this.human.humanScroll('down', randomBetween(200, 400));
      await this.human.readingDelay(200);
      await this.human.randomMouseMovement();

      // Think before composing the reply (3-8 seconds)
      await this.human.thinkBeforeSending();

      // Find the reply textarea
      const textareaSelector = 'textarea[placeholder="Type your reply"]';
      await this.page.waitForSelector(textareaSelector, { timeout: 10000 });
      await randomDelay(300, 800);

      // Human click into textarea, then type
      await this.human.humanClick(textareaSelector);
      await randomDelay(400, 900);
      await this.human.humanTypeInFocus(messageText);

      // Simulate re-reading what was typed
      await this.human.readingDelay(messageText.length);
      await randomDelay(500, 1500);

      // Find the send button: mark it with a temp attribute so humanClick can target it
      const btnFound = await this.page.evaluate(() => {
        const ta = document.querySelector('textarea[placeholder="Type your reply"]');
        let el: Element | null = ta?.parentElement ?? null;
        for (let i = 0; i < 6 && el; i++) {
          // Avoid the search bar button; look for a button not in a input-btn-group
          const btn = el.querySelector(
            'button[type="button"]:not(.wt-input-btn-group__btn):not([disabled]),' +
            'button[type="submit"]:not(.wt-input-btn-group__btn):not([disabled])'
          ) as HTMLElement | null;
          if (btn) {
            btn.setAttribute('data-etsy-reply-send', 'true');
            return true;
          }
          el = el.parentElement;
        }
        return false;
      });

      if (btnFound) {
        // Human click through ghost cursor — Bézier curve mouse movement
        await this.human.humanClick('[data-etsy-reply-send="true"]');
        // Clean up the temporary attribute
        await this.page.evaluate(() => {
          document.querySelector('[data-etsy-reply-send="true"]')
            ?.removeAttribute('data-etsy-reply-send');
        });
      } else {
        // Fallback: Ctrl+Enter — add realistic delays around it
        logger.warn('Send button not found via DOM walk, using keyboard shortcut');
        await randomDelay(300, 700);
        await this.page.keyboard.down('Control');
        await randomDelay(50, 120);
        await this.page.keyboard.press('Return');
        await randomDelay(50, 100);
        await this.page.keyboard.up('Control');
      }

      // Wait for the page to process the send (random, not fixed)
      await randomDelay(2000, 4000);

      // Verify the message appeared as a store bubble
      const verified = await this.page.evaluate((text: string) => {
        const bubbles = document.querySelectorAll(
          'div.scrolling-message-list div.wt-rounded.wt-text-body-01.wt-sem-bg-surface-informational-subtle'
        );
        const preview = text.substring(0, 30);
        return Array.from(bubbles).some(b =>
          (b.textContent || '').replace(/^Message:\s*/i, '').includes(preview)
        );
      }, messageText);

      if (verified) {
        logger.info('Reply sent and verified in conversation');
        return true;
      }

      logger.warn('Reply sent — could not confirm appearance yet (may still be loading)');
      return true;
    } catch (error) {
      logger.error('Failed to send reply', error);
      return false;
    }
  }
}
