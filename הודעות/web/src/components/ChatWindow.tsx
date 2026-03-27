import { useEffect, useRef } from 'react';
import { Message } from '../api/client';
import MessageBubble from './MessageBubble';
import DateSeparator from './DateSeparator';
import ReplyInput from './ReplyInput';
import { ReplyStatus } from '../hooks/useSendReply';

interface Props {
  messages: (Message & { _status?: 'sending' | 'sent' | 'failed' })[];
  loading: boolean;
  replyStatus: ReplyStatus;
  onSend: (text: string) => Promise<void>;
  onRetry?: () => void;
}

function isSameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export default function ChatWindow({ messages, loading, replyStatus, onSend, onRetry }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto py-3" style={{ backgroundColor: '#f5f5f5' }}>
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={msg.id}>
                {(i === 0 || !isSameDay(messages[i - 1].sent_at, msg.sent_at)) && (
                  <DateSeparator date={msg.sent_at} />
                )}
                <MessageBubble message={msg} />
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>
      <ReplyInput onSend={onSend} status={replyStatus} onRetry={onRetry} />
    </div>
  );
}
