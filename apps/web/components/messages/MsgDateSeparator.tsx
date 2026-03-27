function formatDate(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'היום';
  if (diff === 1) return 'אתמול';
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function MsgDateSeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-3 my-3 px-4">
      <div className="flex-1 h-px bg-[var(--border-color)]" />
      <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap px-1">
        {formatDate(date)}
      </span>
      <div className="flex-1 h-px bg-[var(--border-color)]" />
    </div>
  );
}
