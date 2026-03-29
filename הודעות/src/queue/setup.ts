import { Queue } from 'bullmq';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface SyncConversationJobData {
  storeId: number;
  profileId: string;
  conversationUrl: string;
  buyerName: string;
  storeEmail: string;
}

export interface InitialSyncJobData {
  storeId: number;
  profileId: string;
  storeName: string;
}

export interface SendReplyJobData {
  replyQueueId: number;
  conversationId: number;
  storeId: number;
  profileId: string;
  conversationUrl: string;
  messageText: string;
}

function getRedisConnection() {
  try {
    const url = new URL(config.redis.url);
    return { host: url.hostname || 'localhost', port: parseInt(url.port || '6379') };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

export class JobQueue {
  public syncQueue: Queue;
  public initialSyncQueue: Queue;
  public replyQueue: Queue;
  public reviewReplyQueue: Queue;
  public discountQueue: Queue;
  private activeProfiles: Set<string> = new Set();

  constructor() {
    const connection = getRedisConnection();
    this.syncQueue = new Queue('sync-conversation', { connection });
    this.initialSyncQueue = new Queue('initial-sync', { connection });
    this.replyQueue = new Queue('send-reply', { connection });
    this.reviewReplyQueue = new Queue('review-reply', { connection });
    this.discountQueue = new Queue('discount-execute', { connection });
  }

  async addSyncConversationJob(data: SyncConversationJobData): Promise<void> {
    await this.syncQueue.add('sync', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      jobId: `sync-${data.storeId}-${encodeURIComponent(data.conversationUrl)}`,
      removeOnComplete: 100,
      removeOnFail: 50,
    });
    logger.info(`Added sync job for store ${data.storeId}`);
  }

  async addInitialSyncJob(data: InitialSyncJobData): Promise<void> {
    await this.initialSyncQueue.add('initial', data, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 10000 },
      jobId: `initial-${data.storeId}`,
    });
    logger.info(`Added initial sync job for store ${data.storeId}`);
  }

  async addSendReplyJob(data: SendReplyJobData): Promise<void> {
    await this.replyQueue.add('reply', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      jobId: `reply-${data.replyQueueId}`,
    });
    logger.info(`Added reply job for conversation ${data.conversationId}`);
  }

  isProfileLocked(profileId: string): boolean { return this.activeProfiles.has(profileId); }
  lockProfile(profileId: string): void { this.activeProfiles.add(profileId); }
  unlockProfile(profileId: string): void { this.activeProfiles.delete(profileId); }
}
