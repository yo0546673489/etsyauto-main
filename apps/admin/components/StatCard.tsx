export default function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: number | string
  highlight?: boolean
}) {
  return (
    <div className={`rounded-xl border p-6 ${
      highlight
        ? 'bg-yellow-950 border-yellow-800'
        : 'bg-gray-900 border-gray-800'
    }`}>
      <p className="text-gray-400 text-sm">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${
        highlight ? 'text-yellow-400' : 'text-white'
      }`}>
        {value}
      </p>
    </div>
  )
}
