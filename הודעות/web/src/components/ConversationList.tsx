import { Conversation } from '../api/client';
import ConversationItem from './ConversationItem';
import LoadingSkeletons from './LoadingSkeletons';

interface Props {
  conversations: Conversation[];
  selectedId: number | null;
  loading: boolean;
  onSelect: (id: number) => void;
}

export default function ConversationList({ conversations, selectedId, loading, onSelect }: Props) {
  if (loading) return <LoadingSkeletons count={8} />;
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm">
        אין שיחות
      </div>
    );
  }
  return (
    <div className="overflow-y-auto flex-1">
      {conversations.map(c => (
        <ConversationItem
          key={c.id}
          conversation={c}
          isSelected={selectedId === c.id}
          onClick={() => onSelect(c.id)}
        />
      ))}
    </div>
  );
}
