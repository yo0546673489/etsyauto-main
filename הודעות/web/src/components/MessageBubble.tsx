import { Message } from '../api/client';

interface Props {
  message: Message & { _status?: 'sending' | 'sent' | 'failed' };
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

export default function MessageBubble({ message }: Props) {
  const isStore = message.sender_type === 'store';
  const isSending = message._status === 'sending';
  const isFailed = message._status === 'failed';

  return (
    <div className={`flex ${isStore ? 'justify-start' : 'justify-end'} mb-2 px-4`}>
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm
          ${isStore
            ? 'bg-[#e3f2fd] text-gray-900 rounded-tr-sm'
            : 'bg-white border border-gray-200 text-gray-900 rounded-tl-sm'}
          ${isFailed ? 'opacity-60' : ''}
          ${isSending ? 'opacity-70' : ''}`}
      >
        <p className="text-xs font-semibold mb-1" style={{ color: isStore ? '#1565C0' : '#616161' }}>
          {message.sender_name}
        </p>
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.message_text}</p>
        <div className={`flex items-center gap-1 mt-1 ${isStore ? 'justify-start' : 'justify-end'}`}>
          <span className="text-xs text-gray-400">{formatTime(message.sent_at)}</span>
          {isSending && <span className="text-xs text-gray-400">שולח...</span>}
          {message._status === 'sent' && <span className="text-xs text-green-500">✓</span>}
          {isFailed && <span className="text-xs text-red-500">שליחה נכשלה</span>}
        </div>
      </div>
    </div>
  );
}
