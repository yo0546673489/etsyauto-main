import { useEffect, useRef, useState } from 'react';
import { Message, replyApi } from '../api/client';
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
  conversationId?: number;
}

function isSameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export default function ChatWindow({ messages, loading, replyStatus, onSend, onRetry, conversationId }: Props) {
  const [aiGenerating, setAiGenerating] = useState(false);
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
      {conversationId && (
        <div className="flex justify-end px-3 pt-2">
          <button
            onClick={async () => {
              if (!conversationId) return;
              setAiGenerating(true);
              try {
                const res = await replyApi.aiGenerate(conversationId);
                if (res.success) await onSend(res.generatedReply);
              } catch (e) { console.error("AI generate failed", e); }
              finally { setAiGenerating(false); }
            }}
            disabled={aiGenerating}
            className="text-xs bg-purple-50 text-purple-600 px-3 py-1 rounded hover:bg-purple-100 disabled:opacity-50"
          >
            {aiGenerating ? "Generating..." : "✨ AI Reply"}
          </button>
        </div>
      )}
      <ReplyInput onSend={onSend} status={replyStatus} onRetry={onRetry} />
    </div>
  );
}
