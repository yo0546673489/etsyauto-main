interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function StatusFilter({ value, onChange }: Props) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"
    >
      <option value="">הכל</option>
      <option value="new">חדש</option>
      <option value="open">פתוח</option>
      <option value="answered">נענה</option>
      <option value="closed">סגור</option>
    </select>
  );
}
