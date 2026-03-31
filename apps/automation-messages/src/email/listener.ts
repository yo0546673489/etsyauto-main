import { ImapFlow } from 'imapflow';
import { config } from '../config';
import { EmailParser } from './parser';
import { StoreResolver } from '../stores/resolver';
import { JobQueue } from '../queue/setup';
import { logger } from '../utils/logger';

export class EmailListener {
  private client: ImapFlow;
  private parser: EmailParser;
  private resolver: StoreResolver;
  private jobQueue: JobQueue;
  private running: boolean = false;

  constructor(resolver: StoreResolver, jobQueue: JobQueue) {
    this.client = this.createClient();
    this.parser = new EmailParser();
    this.resolver = resolver;
    this.jobQueue = jobQueue;
  }

  private createClient(): ImapFlow {
    return new ImapFlow({
      host: config.imap.host,
      port: config.imap.port,
      secure: true,
      auth: {
        user: config.imap.user,
        pass: config.imap.password,
      },
      logger: false,
    });
  }

  async start(): Promise<void> {
    try {
      await this.client.connect();
      logger.info('Connected to IMAP server');
      this.running = true;
      await this.listen();
    } catch (error) {
      logger.error('Failed to connect to IMAP', error);
      throw error;
    }
  }

  private async listen(): Promise<void> {
    while (this.running) {
      try {
        const lock = await this.client.getMailboxLock('INBOX');
        try {
          await this.client.idle();
          await this.processNewEmails();
        } finally {
          lock.release();
        }
      } catch (error) {
        logger.error('IMAP listener error, reconnecting in 10s...', error);
        await new Promise(r => setTimeout(r, 10000));
        try {
          this.client = this.createClient();
          await this.client.connect();
          logger.info('IMAP reconnected successfully');
        } catch (e) {
          logger.error('Reconnect failed', e);
        }
      }
    }
  }

  private async processNewEmails(): Promise<void> {
    const unseenMessages = await this.client.search({ seen: false }) as number[];
    if (!Array.isArray(unseenMessages) || unseenMessages.length === 0) return;

    logger.info(`Found ${unseenMessages.length} new emails`);

    for (const uid of unseenMessages) {
      try {
        const message = await this.client.fetchOne(uid, { source: true, envelope: true });
        if (!message) continue;

        const parsed = await this.parser.parse(message.source as Buffer);
        if (!parsed || !parsed.isEtsyNotification) continue;

        logger.info(`Etsy notification for store: ${parsed.storeEmail}, buyer: ${parsed.buyerName}`);

        const store = await this.resolver.resolveByEmail(parsed.storeEmail);
        if (!store) {
          logger.warn(`No store found for email: ${parsed.storeEmail}`);
          continue;
        }

        await this.jobQueue.addSyncConversationJob({
          storeId: store.id,
          profileId: store.adspower_profile_id,
          conversationUrl: parsed.conversationLink,
          buyerName: parsed.buyerName,
          storeEmail: parsed.storeEmail,
        });

        await this.client.messageFlagsAdd(uid, ['\\Seen']);
      } catch (error) {
        logger.error(`Error processing email UID ${uid}`, error);
      }
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.client.logout();
    logger.info('IMAP listener stopped');
  }
}
