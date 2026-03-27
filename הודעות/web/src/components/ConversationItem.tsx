import { Conversation } from '../api/client';
import Avatar from './Avatar';

interface Props {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}

const statusDot: Record<string, string> = {
  new: 'bg-blue-500',
  open: 'bg-green-500',
  answered: 'bg-gray-400',
  closed: 'bg-red-500',
};

function formatTime(ts: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'אתמול';
  if (diffDays < 7) return d.toLocaleDateString('he-IL', { weekday: 'short' });
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
}

export default function ConversationItem({ conversation: c, isSelected, onClick }: Props) {
  const isNew = c.status === 'new';
  return (
    <div
      onClick={onClick}
      className={`flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-gray-100 transition-colors
        ${isSelected ? 'bg-[#e8f0fe]' : isNew ? 'bg-[#f0f4ff] hover:bg-[#e8f0fe]' : 'bg-white hover:bg-gray-50'}`}
    >
      <Avatar name={c.customer_name} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className={`text-sm ${isNew ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>
            {c.customer_name}
          </span>
          <span className="text-xs text-gray-400 mr-2 flex-shrink-0">{formatTime(c.last_message_at)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 truncate flex-1">
            {c.store_name || `חנות ${c.store_number}`}
          </span>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[c.status] || 'bg-gray-400'}`} />
        </div>
        <p className="text-xs text-gray-400 truncate mt-0.5">{c.last_message_text || '—'}</p>
      </div>
    </div>
  );
}
