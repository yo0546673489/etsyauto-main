'use client';
import { MsgConversation } from '@/lib/messages-api';
import MsgAvatar from './MsgAvatar';

interface Props {
  conv: MsgConversation;
  isSelected: boolean;
  onClick: () => void;
}

function formatTime(ts: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  if (diff < 7 * 86400000) return d.toLocaleDateString('he-IL', { weekday: 'short' });
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
}

function cleanName(name: string): string {
  const fromIdx = name.indexOf(' from ');
  if (fromIdx > 0) return name.substring(0, fromIdx).trim();
  return name;
}

export default function MsgConversationItem({ conv, isSelected, onClick }: Props) {
  const isNew = conv.status === 'new' && !isSelected;
  const displayName = cleanName(conv.customer_name);

  return (
    <div className="px-3 py-1.5">
      <button
        onClick={onClick}
        dir="rtl"
        className={`w-full text-right flex items-center gap-3 px-4 py-3 rounded-2xl transition-all
          ${isSelected
            ? 'bg-[#006d43]/15 shadow-sm ring-1 ring-[#006d43]/20'
            : 'hover:bg-gray-100/80'
          }`}
      >
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <MsgAvatar name={displayName} size="md" id={conv.id} />
          {isNew && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#006d43] border-2 border-white" />
          )}
        </div>

        {/* Name + time + preview */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className={`text-sm truncate ${isNew ? 'font-extrabold text-gray-900' : 'font-medium text-gray-700'}`}>
              {displayName}
            </span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[11px] text-gray-400">{formatTime(conv.last_message_at)}</span>
              {isNew && (
                <span className="w-5 h-5 rounded-full bg-[#006d43] text-white text-[10px] font-bold flex items-center justify-center">
                  1
                </span>
              )}
            </div>
          </div>
          <p className={`text-xs truncate ${isNew ? 'font-semibold text-gray-800' : 'text-gray-400'}`}>
            {conv.last_message_text || '—'}
          </p>
        </div>
      </button>
    </div>
  );
}
