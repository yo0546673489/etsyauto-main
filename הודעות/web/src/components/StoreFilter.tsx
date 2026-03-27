import { Store } from '../api/client';

interface Props {
  stores: Store[];
  selected: number | null;
  onSelect: (id: number | null) => void;
}

export default function StoreFilter({ stores, selected, onSelect }: Props) {
  return (
    <select
      value={selected ?? ''}
      onChange={e => onSelect(e.target.value ? parseInt(e.target.value) : null)}
      className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"
    >
      <option value="">כל החנויות</option>
      {stores.map(s => (
        <option key={s.id} value={s.id}>{s.store_name || `חנות ${s.store_number}`}</option>
      ))}
    </select>
  );
}
