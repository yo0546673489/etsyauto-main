interface Props {
  senderType: 'customer' | 'store';
  senderName: string;
  text: string;
  sentAt: string;
  pending?: boolean;
  failed?: boolean;
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

export default function MsgBubble({ senderType, senderName, text, sentAt, pending, failed }: Props) {
  const isStore = senderType === 'store';
  return (
    <div className={`flex ${isStore ? 'justify-start' : 'justify-end'} mb-2 px-4`}>
      <div className={`max-w-[72%] rounded-2xl px-4 py-2.5 shadow-sm
        ${isStore
          ? 'bg-[#e8f5ee] text-gray-900 rounded-tl-sm border border-[#c8e6c9]'
          : 'bg-white text-gray-900 rounded-tr-sm border border-[var(--border-color)]'}
        ${pending || failed ? 'opacity-70' : ''}`}
      >
        <p className="text-xs font-semibold mb-1" style={{ color: isStore ? '#006d43' : '#757575' }}>
          {senderName}
        </p>
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{text}</p>
        <div className={`flex items-center gap-1 mt-1 ${isStore ? 'justify-start' : 'justify-end'}`}>
          <span className="text-[10px] text-gray-400">{formatTime(sentAt)}</span>
          {pending && <span className="text-[10px] text-gray-400">שולח...</span>}
          {failed && <span className="text-[10px] text-red-400">נכשל ❌</span>}
        </div>
      </div>
    </div>
  );
}
