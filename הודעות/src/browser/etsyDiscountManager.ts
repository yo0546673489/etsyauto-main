// Etsy Discount/Sale Manager
// הערה: הסלקטורים הם PLACEHOLDERS — צריך להריץ inspect-selectors.ts לעדכן
// כל האינטראקציות עוברות דרך HumanBehavior

import { Page } from 'playwright';
import { HumanBehavior } from './humanBehavior';
import { logger } from '../utils/logger';

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, randomBetween(minMs, maxMs)));
}

export interface SaleConfig {
  saleName: string;            // אלפאנומרי בלבד, ייחודי
  discountPercent: number;     // 5-75
  startDate: string;           // YYYY-MM-DD
  endDate: string;             // YYYY-MM-DD (מקסימום 30 יום מ-start)
  targetCountry: string;       // 'Everywhere' או שם מדינה
  termsText?: string;          // עד 500 תווים
  targetScope: 'whole_shop' | 'specific_listings';
  listingIds?: string[];       // אם specific_listings
}

export class EtsyDiscountManager {
  private page: Page;
  private human: HumanBehavior;

  constructor(page: Page) {
    this.page = page;
    this.human = new HumanBehavior(page);
  }

  /**
   * יצירת מבצע הנחה חדש
   * URL: https://www.etsy.com/your/shops/me/sales-discounts/step/createSale
   */
  async createSale(config: SaleConfig): Promise<boolean> {
    try {
      logger.info(`Creating sale: ${config.saleName} (${config.discountPercent}%)`);

      // שלב 1: ניווט לדף יצירת מבצע
      await this.human.humanNavigate(
        'https://www.etsy.com/your/shops/me/sales-discounts/step/createSale'
      );
      await this.page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await randomDelay(2000, 4000);
      await this.human.randomMouseMovement();

      // שלב 2: שם המבצע (Sale name)
      // TODO: עדכן סלקטור
      const saleNameInput = 'input[name="sale_name"], input[data-sale-name], #sale-name-input';
      await this.human.humanType(saleNameInput, config.saleName);
      await randomDelay(500, 1000);

      // שלב 3: אחוז הנחה (Discount amount)
      // TODO: עדכן סלקטור
      // בדרך כלל יש radio button ל-"Percentage off" ואז input לאחוז
      const percentRadio = 'input[value="percent"], label:has-text("Percentage"), [data-discount-type="percent"]';
      await this.human.humanClick(percentRadio);
      await randomDelay(500, 1000);

      const percentInput = 'input[name="discount_amount"], input[data-discount-value], #discount-amount';
      // ניקוי שדה קודם
      await this.human.humanClick(percentInput);
      await randomDelay(150, 350);
      await this.page.keyboard.press('Control+a');
      await randomDelay(100, 300);
      await this.human.humanTypeInFocus(config.discountPercent.toString());
      await randomDelay(500, 1000);

      // שלב 4: היקף — כל החנות או מוצרים ספציפיים
      if (config.targetScope === 'whole_shop') {
        // TODO: עדכן סלקטור
        const wholeShopRadio = 'input[value="whole_shop"], label:has-text("entire shop"), [data-scope="all"]';
        await this.human.humanClick(wholeShopRadio);
      } else if (config.listingIds && config.listingIds.length > 0) {
        // TODO: עדכן סלקטור
        const specificRadio = 'input[value="specific"], label:has-text("specific listings"), [data-scope="specific"]';
        await this.human.humanClick(specificRadio);
        await randomDelay(1000, 2000);

        // בחירת מוצרים ספציפיים
        for (const listingId of config.listingIds) {
          // TODO: עדכן סלקטור — בדרך כלל checkbox ליד כל מוצר
          const listingCheckbox = `input[data-listing-id="${listingId}"], [data-listing="${listingId}"] input[type="checkbox"]`;
          try {
            await this.human.humanClick(listingCheckbox);
            await randomDelay(300, 700);
          } catch (e) {
            logger.warn(`Could not select listing ${listingId}`);
          }
        }
      }
      await randomDelay(500, 1500);

      // שלב 5: תאריכי התחלה וסיום (Duration)
      // TODO: עדכן סלקטורים לשדות תאריך
      const startDateInput = 'input[name="start_date"], input[data-start-date], #start-date';
      await this.human.humanClick(startDateInput);
      await randomDelay(120, 280);
      await this.page.keyboard.press('Control+a');
      await randomDelay(100, 200);
      await this.human.humanTypeInFocus(config.startDate);
      await randomDelay(300, 700);

      const endDateInput = 'input[name="end_date"], input[data-end-date], #end-date';
      await this.human.humanClick(endDateInput);
      await randomDelay(120, 280);
      await this.page.keyboard.press('Control+a');
      await randomDelay(100, 200);
      await this.human.humanTypeInFocus(config.endDate);
      await randomDelay(500, 1000);

      // שלב 6: מדינת יעד (Where is this offer valid?)
      if (config.targetCountry !== 'Everywhere') {
        // TODO: עדכן סלקטור — dropdown של מדינות
        const countryDropdown = 'select[name="country"], [data-country-selector]';
        await this.human.humanClick(countryDropdown);
        await randomDelay(400, 900);
        // בחירת מדינה — דרך selectOption (dropdown נייטיב של OS)
        // מוסיפים השהיה לפני ואחרי כאילו מחפשים ברשימה
        await randomDelay(300, 800);
        await this.page.selectOption(countryDropdown, { label: config.targetCountry });
        await randomDelay(500, 1200);
      }

      // שלב 7: תנאים והגבלות (Terms and conditions — אופציונלי)
      if (config.termsText) {
        // TODO: עדכן סלקטור
        const termsInput = 'textarea[name="terms"], textarea[data-terms], #terms-input';
        await this.human.humanType(termsInput, config.termsText);
        await randomDelay(500, 1000);
      }

      // שלב 8: קריאה חוזרת — כמו בן אדם שבודק לפני שליחה
      await this.human.humanScroll('up', randomBetween(200, 400));
      await randomDelay(2000, 4000);
      await this.human.humanScroll('down', randomBetween(300, 500));
      await randomDelay(1000, 2000);

      // שלב 9: לחיצה על Save/Submit
      // TODO: עדכן סלקטור
      const submitButton = 'button[type="submit"]:has-text("Save"), button:has-text("Start sale"), [data-save-sale]';
      await this.human.humanClick(submitButton);

      await randomDelay(3000, 5000);

      // אימות הצלחה
      const success = await this.page.evaluate(() => {
        // בדיקה שאין שגיאות בדף
        const errors = document.querySelectorAll('.error-message, [data-error], .alert-danger');
        if (errors.length > 0) return false;
        // בדיקה שחזרנו לדף הראשי של הנחות או שיש הודעת הצלחה
        const successMsg = document.querySelector('.success-message, [data-success], .alert-success');
        return !!successMsg || window.location.href.includes('sales-discounts');
      });

      if (success) {
        logger.info(`Sale "${config.saleName}" created successfully`);
      } else {
        logger.warn(`Could not verify sale "${config.saleName}" was created`);
      }

      return success;
    } catch (error) {
      logger.error(`Failed to create sale: ${config.saleName}`, error);
      return false;
    }
  }

  /**
   * ביטול/סיום מבצע קיים
   */
  async endSale(saleName: string): Promise<boolean> {
    try {
      logger.info(`Ending sale: ${saleName}`);

      // ניווט לדף המבצעים
      await this.human.humanNavigate(
        'https://www.etsy.com/your/shops/me/sales-discounts'
      );
      await this.page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await randomDelay(2000, 4000);

      // TODO: מצא את המבצע ברשימה ולחץ End/Delete
      const saleCard = await this.page.$(`text="${saleName}"`);
      if (!saleCard) {
        logger.error(`Sale "${saleName}" not found on page`);
        return false;
      }

      // גלילה הדרגתית — אף פעם לא scrollIntoView ישיר
      await this.human.humanScroll('down', randomBetween(300, 600));
      await randomDelay(500, 1000);

      // TODO: עדכן סלקטור לכפתור End Sale
      const endButton = await saleCard.$('xpath=..').then(parent =>
        parent?.$('button:has-text("End"), button:has-text("Delete"), [data-end-sale]')
      );

      if (!endButton) {
        logger.error('End sale button not found');
        return false;
      }

      await this.human.humanClick('button:has-text("End"), button:has-text("Delete")');
      await randomDelay(1000, 2000);

      // אישור (אם יש confirmation dialog)
      try {
        const confirmButton = await this.page.waitForSelector(
          'button:has-text("Confirm"), button:has-text("Yes")',
          { timeout: 3000 }
        );
        if (confirmButton) {
          await this.human.humanClick('button:has-text("Confirm"), button:has-text("Yes")');
          await randomDelay(2000, 4000);
        }
      } catch {
        // אין confirmation — ממשיכים
      }

      logger.info(`Sale "${saleName}" ended`);
      return true;
    } catch (error) {
      logger.error(`Failed to end sale: ${saleName}`, error);
      return false;
    }
  }
}
