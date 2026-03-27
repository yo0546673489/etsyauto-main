import { simpleParser, ParsedMail } from 'mailparser';
import { logger } from '../utils/logger';

export interface ParsedEtsyEmail {
  isEtsyNotification: boolean;
  storeEmail: string;
  buyerName: string;
  conversationLink: string;
  subject: string;
  receivedAt: Date;
}

export class EmailParser {
  async parse(rawEmail: Buffer): Promise<ParsedEtsyEmail | null> {
    try {
      const parsed: ParsedMail = await simpleParser(rawEmail);

      const fromAddress = parsed.from?.value?.[0]?.address || '';
      const isFromEtsy = fromAddress.includes('etsy.com') ||
                         fromAddress.includes('transaction@etsy.com') ||
                         fromAddress.includes('reply@etsy.com');
      if (!isFromEtsy) return null;

      const subject = parsed.subject || '';

      const isMessageNotification =
        subject.toLowerCase().includes('message') ||
        subject.toLowerCase().includes('sent you a message') ||
        subject.toLowerCase().includes('new message') ||
        subject.toLowerCase().includes('replied');
      if (!isMessageNotification) return null;

      const toAddress = this.extractStoreEmail(parsed);
      const buyerName = this.extractBuyerName(parsed);
      const conversationLink = this.extractConversationLink(parsed);

      if (!conversationLink) {
        logger.warn('Could not extract conversation link from Etsy email');
        return null;
      }

      return {
        isEtsyNotification: true,
        storeEmail: toAddress,
        buyerName,
        conversationLink,
        subject,
        receivedAt: parsed.date || new Date(),
      };
    } catch (error) {
      logger.error('Error parsing email', error);
      return null;
    }
  }

  private extractStoreEmail(parsed: ParsedMail): string {
    const deliveredTo = parsed.headers.get('delivered-to');
    if (deliveredTo) {
      const addr = typeof deliveredTo === 'string' ? deliveredTo : String(deliveredTo);
      if (addr.includes('@')) return addr.trim().toLowerCase();
    }
    const forwardedTo = parsed.headers.get('x-forwarded-to');
    if (forwardedTo) {
      const addr = typeof forwardedTo === 'string' ? forwardedTo : String(forwardedTo);
      if (addr.includes('@')) return addr.trim().toLowerCase();
    }
    const to = parsed.to;
    if (to) {
      const addresses = Array.isArray(to) ? to : [to];
      for (const addr of addresses) {
        if (addr.value?.[0]?.address) return addr.value[0].address.toLowerCase();
      }
    }
    return '';
  }

  private extractBuyerName(parsed: ParsedMail): string {
    const subject = parsed.subject || '';
    const fromMatch = subject.match(/message from (.+?)(?:\s*[-–—]|\s*$)/i);
    if (fromMatch) return fromMatch[1].trim();
    const sentMatch = subject.match(/^(.+?) sent you/i);
    if (sentMatch) return sentMatch[1].trim();
    const body = parsed.text || parsed.html || '';
    const bodyMatch = body.match(/from\s+([A-Za-z0-9_\-. ]+?)\s+(?:on|about|regarding)/i);
    if (bodyMatch) return bodyMatch[1].trim();
    return 'Unknown Buyer';
  }

  private extractConversationLink(parsed: ParsedMail): string {
    const html = parsed.html || '';
    const text = parsed.text || '';
    const combined = html + ' ' + text;
    const patterns = [
      /https?:\/\/(?:www\.)?etsy\.com\/your\/conversations\/\d+/gi,
      /https?:\/\/(?:www\.)?etsy\.com\/conversations\/\d+/gi,
      /https?:\/\/(?:www\.)?etsy\.com\/your\/messages\/\d+/gi,
      /https?:\/\/(?:www\.)?etsy\.me\/\w+/gi,
      /https?:\/\/(?:www\.)?etsy\.com\/[^\s"'<>]*(?:message|convo|conversation)[^\s"'<>]*/gi,
    ];
    for (const pattern of patterns) {
      const match = combined.match(pattern);
      if (match) {
        let link = match[0];
        link = link.replace(/[<>"'\s].*$/, '');
        return link;
      }
    }
    return '';
  }
}
