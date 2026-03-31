import { Page } from 'playwright';
import { createCursor } from 'ghost-cursor-playwright';
import { logger } from '../utils/logger';

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, randomBetween(minMs, maxMs)));
}

function humanTypingDelay(): number {
  const roll = Math.random();
  if (roll < 0.05) return randomBetween(300, 800);
  if (roll < 0.15) return randomBetween(150, 250);
  return randomBetween(50, 130);
}

export class HumanBehavior {
  private page: Page;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _cursor: any = null;

  constructor(page: Page) {
    this.page = page;
  }

  // Lazy cursor creation — avoids page.evaluate() during navigation
  private get cursor() {
    if (!this._cursor) {
      this._cursor = createCursor(this.page);
    }
    return this._cursor;
  }

  async humanClick(selector: string): Promise<void> {
    await randomDelay(300, 800);
    const element = await this.page.waitForSelector(selector, { timeout: 10000 });
    if (!element) throw new Error(`Element not found: ${selector}`);
    // Reset cursor if page navigated (execution context destroyed)
    try {
      await this.cursor.move(selector);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('Execution context was destroyed')) {
        this._cursor = null;
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});
        await randomDelay(500, 1000);
        await this.cursor.move(selector);
      } else throw e;
    }
    await randomDelay(100, 300);
    await this.cursor.click(selector);
    await randomDelay(500, 1500);
    logger.debug(`Human click on: ${selector}`);
  }

  async humanType(selector: string, text: string): Promise<void> {
    await this.humanClick(selector);
    await randomDelay(200, 500);

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (i > 2 && Math.random() < 0.03) {
        const wrongChar = String.fromCharCode(char.charCodeAt(0) + randomBetween(-2, 2));
        await this.page.keyboard.type(wrongChar, { delay: humanTypingDelay() });
        await randomDelay(100, 300);
        await this.page.keyboard.press('Backspace');
        await randomDelay(100, 200);
      }

      await this.page.keyboard.type(char, { delay: humanTypingDelay() });
    }

    logger.debug(`Human typed ${text.length} characters`);
  }

  async humanTypeInFocus(text: string): Promise<void> {
    await randomDelay(200, 500);
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (i > 2 && Math.random() < 0.03) {
        const wrongChar = String.fromCharCode(char.charCodeAt(0) + randomBetween(-2, 2));
        await this.page.keyboard.type(wrongChar, { delay: humanTypingDelay() });
        await randomDelay(100, 300);
        await this.page.keyboard.press('Backspace');
        await randomDelay(100, 200);
      }
      await this.page.keyboard.type(char, { delay: humanTypingDelay() });
    }
  }

  async humanScroll(direction: 'down' | 'up' = 'down', amount: number = 300): Promise<void> {
    const scrollSteps = randomBetween(3, 6);
    const stepAmount = Math.floor(amount / scrollSteps);
    const sign = direction === 'down' ? 1 : -1;

    for (let i = 0; i < scrollSteps; i++) {
      const thisStep = stepAmount + randomBetween(-30, 30);
      await this.page.mouse.wheel(0, thisStep * sign);
      await randomDelay(50, 150);
    }

    await randomDelay(500, 1500);
    logger.debug(`Human scroll ${direction} ~${amount}px`);
  }

  async scrollToBottom(): Promise<void> {
    let previousHeight = 0;
    let currentHeight = await this.page.evaluate(() => document.body.scrollHeight);
    while (previousHeight !== currentHeight) {
      previousHeight = currentHeight;
      await this.humanScroll('down', randomBetween(400, 700));
      await randomDelay(1000, 2000);
      currentHeight = await this.page.evaluate(() => document.body.scrollHeight);
    }
  }

  async scrollToTop(): Promise<void> {
    // גלילה הדרגתית למעלה — לא window.scrollTo ישיר
    let scrolled = await this.page.evaluate(() => window.scrollY);
    while (scrolled > 50) {
      const step = randomBetween(150, 350);
      await this.page.mouse.wheel(0, -step);
      await randomDelay(40, 120);
      scrolled = await this.page.evaluate(() => window.scrollY);
    }
    await randomDelay(400, 900);
  }

  async humanNavigate(url: string): Promise<void> {
    await randomDelay(500, 1500);
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(1500, 3500);
    if (Math.random() < 0.5) {
      await this.humanScroll('down', randomBetween(100, 200));
    }
    logger.debug(`Human navigated to: ${url}`);
  }

  async thinkBeforeSending(): Promise<void> {
    await randomDelay(3000, 8000);
  }

  async readingDelay(textLength: number): Promise<void> {
    const words = textLength / 5;
    const readingTimeMs = (words / 4) * 1000;
    const adjustedTime = Math.min(readingTimeMs, 10000);
    await randomDelay(adjustedTime * 0.7, adjustedTime * 1.3);
  }

  async randomMouseMovement(): Promise<void> {
    if (Math.random() < 0.3) {
      const x = randomBetween(100, 800);
      const y = randomBetween(100, 600);
      await this.page.mouse.move(x, y, { steps: randomBetween(10, 25) });
      await randomDelay(200, 500);
    }
  }

  async enterMessagesPage(url: string): Promise<void> {
    await this.humanNavigate(url);
    await this.randomMouseMovement();
    await randomDelay(1000, 2000);
    logger.info('Entered messages page with human behavior');
  }

  async readAndReplyFlow(messageInputSelector: string, replyText: string): Promise<void> {
    await this.humanScroll('down', randomBetween(200, 400));
    await randomDelay(2000, 4000);
    await this.thinkBeforeSending();
    await this.humanScroll('down', randomBetween(100, 200));
    await this.humanType(messageInputSelector, replyText);
    await randomDelay(1000, 3000);
    logger.info('Completed read and reply flow');
  }
}
