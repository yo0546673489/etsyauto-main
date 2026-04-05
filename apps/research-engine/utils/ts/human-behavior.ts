import { Page } from 'playwright';

const toolsConfig = require('../../config/tools.json');
const { anti_detection } = toolsConfig;

export async function randomDelay(min?: number, max?: number): Promise<void> {
  const minMs = min ?? anti_detection.random_delay_between_actions.min_ms;
  const maxMs = max ?? anti_detection.random_delay_between_actions.max_ms;
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await new Promise(resolve => setTimeout(resolve, delay));
}

export async function randomSearchDelay(): Promise<void> {
  const { min_ms, max_ms } = anti_detection.random_delay_between_searches;
  await randomDelay(min_ms, max_ms);
}

export async function maybeRandomBreak(): Promise<void> {
  if (Math.random() < anti_detection.random_break_chance) {
    const { min_ms, max_ms } = anti_detection.random_break_duration;
    const breakDuration = Math.floor(Math.random() * (max_ms - min_ms + 1)) + min_ms;
    await new Promise(resolve => setTimeout(resolve, breakDuration));
  }
}

// Type text with human-like typos and speed variation
export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await page.click(selector);
  await randomDelay(300, 800);

  for (const char of text) {
    // Occasional typo
    if (Math.random() < anti_detection.typo_rate) {
      const wrongChar = String.fromCharCode(char.charCodeAt(0) + (Math.random() > 0.5 ? 1 : -1));
      await page.keyboard.type(wrongChar, { delay: Math.random() * 150 + 50 });
      await randomDelay(200, 600);
      await page.keyboard.press('Backspace');
      await randomDelay(100, 300);
    }
    await page.keyboard.type(char, { delay: Math.random() * 120 + 40 });
  }
}

// Gradual scroll down
export async function gradualScroll(page: Page, totalDistance = 800): Promise<void> {
  const steps = Math.floor(Math.random() * 5) + 5;
  const stepSize = totalDistance / steps;

  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, stepSize + (Math.random() * 30 - 15));
    await randomDelay(100, 400);
  }
}

// Move mouse in a natural curve to an element and click
export async function naturalClick(page: Page, selector: string): Promise<void> {
  const element = await page.$(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);

  const box = await element.boundingBox();
  if (!box) throw new Error(`Could not get bounding box for: ${selector}`);

  // Move to a random point within the element
  const targetX = box.x + box.width * (0.3 + Math.random() * 0.4);
  const targetY = box.y + box.height * (0.3 + Math.random() * 0.4);

  await page.mouse.move(targetX, targetY, { steps: Math.floor(Math.random() * 10) + 5 });
  await randomDelay(50, 200);
  await page.mouse.click(targetX, targetY);
}

// Wait for navigation with a human-like pause after
export async function waitAndPause(page: Page, ms = 1500): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await randomDelay(ms, ms * 2);
}
