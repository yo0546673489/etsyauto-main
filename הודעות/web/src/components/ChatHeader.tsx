import { Conversation } from '../api/client';
import Avatar from './Avatar';

interface Props {
  conversation: Conversation;
  onStatusChange: (status: string) => void;
}

const statusLabels: Record<string, string> = {
  new: 'חדש',
  open: 'פתוח',
  answered: 'נענה',
  closed: 'סגור',
};

export default function ChatHeader({ conversation, onStatusChange }: Props) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
      <Avatar name={conversation.customer_name} size="md" />
      <div className="flex-1">
        <h2 className="font-semibold text-gray-900">{conversation.customer_name}</h2>
        <p className="text-xs text-gray-500">{conversation.store_name || `חנות ${conversation.store_number}`}</p>
      </div>
      <select
        value={conversation.status}
        onChange={e => onStatusChange(e.target.value)}
        className="text-xs px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {Object.entries(statusLabels).map(([val, label]) => (
          <option key={val} value={val}>{label}</option>
        ))}
      </select>
    </div>
  );
}
