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

      const subjectLower = subject.toLowerCase();
      const isMessageNotification =
        subjectLower.includes('message') ||
        subjectLower.includes('conversation') ||
        subjectLower.includes('sent you') ||
        subjectLower.includes('replied') ||
        subjectLower.includes('new message');
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
    // Priority: actual To: field (the original store's Gmail)
    // delivered-to is the forwarding destination (central Gmail) — skip it first
    const to = parsed.to;
    if (to) {
      const addresses = Array.isArray(to) ? to : [to];
      for (const addr of addresses) {
        const email = addr.value?.[0]?.address?.toLowerCase() || '';
        if (email && email.includes('@')) return email;
      }
    }
    // x-forwarded-for: "original@store.com central@gmail.com" — take the first
    const xfwdFor = parsed.headers.get('x-forwarded-for');
    if (xfwdFor) {
      const raw = typeof xfwdFor === 'string' ? xfwdFor : String(xfwdFor);
      const first = raw.trim().split(/\s+/)[0];
      if (first && first.includes('@')) return first.toLowerCase();
    }
    // Fallback: delivered-to
    const deliveredTo = parsed.headers.get('delivered-to');
    if (deliveredTo) {
      const addr = typeof deliveredTo === 'string' ? deliveredTo : String(deliveredTo);
      if (addr.includes('@')) return addr.trim().toLowerCase();
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

    // Strategy 1: find <a href="..."> whose visible text is "View message"
    // Etsy wraps all links through ablink.account.etsy.com (SendGrid tracking)
    // The browser will follow the redirect to the actual Etsy conversation URL
    const viewMsgMatch = html.match(
      /href=["'](https?:\/\/[^"']+)["'][^>]*>[\s\S]{0,200}?view\s*message/i
    );
    if (viewMsgMatch) return viewMsgMatch[1];

    // Also try reversed order (text before href in some email clients)
    const viewMsgMatch2 = html.match(
      /view\s*message[\s\S]{0,400}?href=["'](https?:\/\/[^"']+)["']/i
    );
    if (viewMsgMatch2) return viewMsgMatch2[1];

    // Strategy 2: direct Etsy conversation URLs (not through tracker)
    const combined = html + ' ' + text;
    const patterns = [
      /https?:\/\/(?:www\.)?etsy\.com\/your\/conversations\/\d+[^\s"'<>]*/gi,
      /https?:\/\/(?:www\.)?etsy\.com\/conversations\/\d+[^\s"'<>]*/gi,
      /https?:\/\/(?:www\.)?etsy\.com\/messages\/\d+[^\s"'<>]*/gi,
      /https?:\/\/(?:www\.)?etsy\.me\/\w+/gi,
    ];
    for (const pattern of patterns) {
      const match = combined.match(pattern);
      if (match) return match[0].replace(/[<>"'\s].*$/, '');
    }

    // Strategy 3: first ablink that resolves to a conversation (follow redirect client-side)
    const ablinkMatch = html.match(/href=["'](https?:\/\/ablink\.account\.etsy\.com\/[^"']+)["']/i);
    if (ablinkMatch) return ablinkMatch[1];

    return '';
  }
}
