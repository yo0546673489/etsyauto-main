import { useState, useRef, useEffect } from 'react';
import { ReplyStatus } from '../hooks/useSendReply';

interface Props {
  onSend: (text: string) => Promise<void>;
  status: ReplyStatus;
  onRetry?: () => void;
}

export default function ReplyInput({ onSend, status, onRetry }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 96) + 'px';
    }
  }, [text]);

  const handleSend = async () => {
    if (!text.trim() || status === 'sending') return;
    const toSend = text.trim();
    setText('');
    await onSend(toSend);
  };

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      {status === 'failed' && (
        <div className="flex items-center justify-between mb-2 text-xs text-red-500">
          <span>שליחה נכשלה ❌</span>
          {onRetry && <button onClick={onRetry} className="underline">נסה שוב</button>}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="כתוב הודעה..."
          disabled={status === 'sending'}
          rows={1}
          dir="rtl"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 leading-relaxed"
          style={{ minHeight: '40px', maxHeight: '96px' }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || status === 'sending'}
          className="px-5 py-2 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          style={{ backgroundColor: '#2196F3', minHeight: '40px' }}
        >
          {status === 'sending' ? '...' : 'שלח'}
        </button>
      </div>
    </div>
  );
}
