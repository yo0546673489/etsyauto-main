import { createHash } from 'crypto';

export function hashMessage(sender: string, text: string, timestamp: string): string {
  return createHash('sha256')
    .update(`${sender}|${text}|${timestamp}`)
    .digest('hex');
}
