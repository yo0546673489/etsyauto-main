'use client';
import { MsgConversation } from '@/lib/messages-api';
import MsgAvatar from './MsgAvatar';

interface Props {
  conv: MsgConversation;
  isSelected: boolean;
  onClick: () => void;
}

const statusDot: Record<string, string> = {
  new: 'bg-blue-500',
  open: 'bg-green-500',
  answered: 'bg-gray-400',
  closed: 'bg-red-400',
};

function formatTime(ts: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  if (diff < 7 * 86400000) return d.toLocaleDateString('he-IL', { weekday: 'short' });
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
}

export default function MsgConversationItem({ conv, isSelected, onClick }: Props) {
  const isNew = conv.status === 'new';
  return (
    <button
      onClick={onClick}
      className={`w-full text-right flex items-start gap-3 px-4 py-3 border-b border-[var(--border-color)] transition-colors
        ${isSelected ? 'bg-[var(--primary-bg,#e8f5ee)]' : isNew ? 'bg-blue-50/50 hover:bg-[var(--card-hover)]' : 'hover:bg-[var(--card-hover)]'}`}
    >
      <MsgAvatar name={conv.customer_name} />
      <div className="flex-1 min-w-0 text-right">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-[var(--text-muted)] mr-auto">{formatTime(conv.last_message_at)}</span>
          <span className={`font-semibold text-sm text-[var(--text-primary)] ${isNew ? 'font-bold' : ''} truncate mr-1`}>
            {conv.customer_name}
          </span>
        </div>
        <div className="flex items-center justify-end gap-1.5">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[conv.status] || 'bg-gray-400'}`} />
          <span className="text-xs text-[var(--text-muted)] truncate">
            {conv.store_name || `חנות ${conv.store_number}`}
          </span>
        </div>
        <p className="text-xs text-[var(--text-muted)] truncate text-right mt-0.5">
          {conv.last_message_text || '—'}
        </p>
      </div>
    </button>
  );
}
