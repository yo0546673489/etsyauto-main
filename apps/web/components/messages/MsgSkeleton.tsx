export default function MsgSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-[var(--border-color)] animate-pulse">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />
          <div className="flex-1">
            <div className="flex justify-between mb-2">
              <div className="h-3 w-10 bg-gray-100 rounded" />
              <div className="h-3.5 w-20 bg-gray-200 rounded" />
            </div>
            <div className="h-3 w-14 bg-gray-100 rounded mb-1.5 mr-auto ml-0" />
            <div className="h-3 w-36 bg-gray-100 rounded mr-auto ml-0" />
          </div>
        </div>
      ))}
    </div>
  );
}
