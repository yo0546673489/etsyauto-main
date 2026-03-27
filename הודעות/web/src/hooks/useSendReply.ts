import { useState } from 'react';
import { replyApi } from '../api/client';

export type ReplyStatus = 'idle' | 'sending' | 'sent' | 'failed';

export function useSendReply() {
  const [status, setStatus] = useState<ReplyStatus>('idle');

  const sendReply = async (conversationId: number, text: string): Promise<{ replyQueueId: number } | null> => {
    setStatus('sending');
    try {
      const result = await replyApi.send(conversationId, text);
      setStatus('sent');
      setTimeout(() => setStatus('idle'), 2000);
      return { replyQueueId: result.replyQueueId };
    } catch {
      setStatus('failed');
      return null;
    }
  };

  const reset = () => setStatus('idle');

  return { status, sendReply, reset };
}
