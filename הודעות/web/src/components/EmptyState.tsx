export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full" style={{ backgroundColor: '#f5f5f5' }}>
      <div className="text-5xl mb-4">📨</div>
      <p className="text-gray-500 font-medium">בחר שיחה מהרשימה</p>
      <p className="text-gray-400 text-sm mt-1">כדי לצפות בהודעות</p>
    </div>
  );
}
