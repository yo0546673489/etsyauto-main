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
    // "Re: Etsy Conversation with Flore Collas"
    const convoMatch = subject.match(/conversation with (.+?)(?:\s*$)/i);
    if (convoMatch) return convoMatch[1].trim();
    // "Message from Flore Collas"
    const fromMatch = subject.match(/message from (.+?)(?:\s*[-–—]|\s*$)/i);
    if (fromMatch) return fromMatch[1].trim();
    // "Flore sent you a message"
    const sentSubjectMatch = subject.match(/^(.+?) sent you/i);
    if (sentSubjectMatch) return sentSubjectMatch[1].trim();
    // Body: "Flore sent you a message"
    const body = parsed.text || '';
    const sentBodyMatch = body.match(/^([A-Za-z][A-Za-z0-9 _\-.]+?)\s+sent you a message/im);
    if (sentBodyMatch) return sentBodyMatch[1].trim();
    return 'Unknown Buyer';
  }

  private extractConversationLink(parsed: ParsedMail): string {
    const html = parsed.html || '';
    const text = parsed.text || '';

    // Extract all hrefs from HTML <a> tags first, look for Etsy conversation links
    const hrefMatches = html.matchAll(/href=["']([^"']+)["']/gi);
    for (const m of hrefMatches) {
      const url = m[1];
      if (/etsy\.com\/[^\s"'<>]*(message|convo|conversation)/i.test(url)) {
        return url.split(/[<>"'\s]/)[0];
      }
    }

    const combined = html + ' ' + text;
    const patterns = [
      /https?:\/\/(?:www\.)?etsy\.com\/your\/conversations\/\d+[^\s"'<>]*/gi,
      /https?:\/\/(?:www\.)?etsy\.com\/conversations\/\d+[^\s"'<>]*/gi,
      /https?:\/\/(?:www\.)?etsy\.com\/messages[^\s"'<>]*/gi,
      /https?:\/\/(?:www\.)?etsy\.com\/your\/messages\/\d+[^\s"'<>]*/gi,
      /https?:\/\/(?:www\.)?etsy\.me\/\w+/gi,
      /https?:\/\/(?:www\.)?etsy\.com\/[^\s"'<>]*(?:message|convo|conversation)[^\s"'<>]*/gi,
    ];
    for (const pattern of patterns) {
      const match = combined.match(pattern);
      if (match) {
        return match[0].replace(/[<>"'\s].*$/, '');
      }
    }
    return '';
  }
}
