import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

interface AdsPowerBrowserInfo {
  ws: { puppeteer: string };
  webdriver: string;
}

interface AdsPowerResponse {
  code: number;
  msg: string;
  data: AdsPowerBrowserInfo;
}

export class AdsPowerController {
  private apiUrl: string;
  private apiKey: string;

  constructor() {
    this.apiUrl = config.adspower.apiUrl;
    this.apiKey = config.adspower.apiKey;
  }

  async checkStatus(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.apiUrl}/status`, {
        params: this.apiKey ? { api_key: this.apiKey } : {},
      });
      return response.data.code === 0;
    } catch (error) {
      logger.error('AdsPower API not available', error);
      return false;
    }
  }

  async openProfile(serialNumber: string): Promise<AdsPowerBrowserInfo | null> {
    try {
      const response = await axios.get<AdsPowerResponse>(
        `${this.apiUrl}/api/v1/browser/start`,
        { params: { serial_number: serialNumber, ...(this.apiKey ? { api_key: this.apiKey } : {}) } }
      );

      if (response.data.code === 0) {
        logger.info(`Profile ${serialNumber} opened successfully`);
        return response.data.data;
      }

      if (response.data.msg && response.data.msg.includes('already')) {
        return await this.getActiveProfile(serialNumber);
      }

      logger.error(`Failed to open profile ${serialNumber}: ${response.data.msg}`);
      return null;
    } catch (error) {
      logger.error(`Error opening profile ${serialNumber}`, error);
      return null;
    }
  }

  async getActiveProfile(serialNumber: string): Promise<AdsPowerBrowserInfo | null> {
    try {
      const response = await axios.get<AdsPowerResponse>(
        `${this.apiUrl}/api/v1/browser/active`,
        { params: { serial_number: serialNumber, ...(this.apiKey ? { api_key: this.apiKey } : {}) } }
      );
      if (response.data.code === 0) return response.data.data;
      return null;
    } catch (error) {
      return null;
    }
  }

  async isProfileOpen(serialNumber: string): Promise<boolean> {
    const active = await this.getActiveProfile(serialNumber);
    return active !== null;
  }

  async closeProfile(serialNumber: string): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.apiUrl}/api/v1/browser/stop`,
        { params: { serial_number: serialNumber, ...(this.apiKey ? { api_key: this.apiKey } : {}) } }
      );
      if (response.data.code === 0) {
        logger.info(`Profile ${serialNumber} closed`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`Error closing profile ${serialNumber}`, error);
      return false;
    }
  }
}
