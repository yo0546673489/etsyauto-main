interface Props {
  count?: number;
}

function SkeletonItem() {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-100 animate-pulse">
      <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />
      <div className="flex-1">
        <div className="flex justify-between mb-2">
          <div className="h-3.5 w-24 bg-gray-200 rounded" />
          <div className="h-3 w-10 bg-gray-100 rounded" />
        </div>
        <div className="h-3 w-16 bg-gray-100 rounded mb-1.5" />
        <div className="h-3 w-40 bg-gray-100 rounded" />
      </div>
    </div>
  );
}

export default function LoadingSkeletons({ count = 5 }: Props) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => <SkeletonItem key={i} />)}
    </div>
  );
}
