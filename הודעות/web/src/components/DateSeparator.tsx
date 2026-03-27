interface Props {
  date: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'היום';
  if (diffDays === 1) return 'אתמול';
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function DateSeparator({ date }: Props) {
  return (
    <div className="flex items-center gap-3 my-4 px-4">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs text-gray-400 whitespace-nowrap">{formatDate(date)}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}
