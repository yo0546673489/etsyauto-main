interface Props {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  online?: boolean;
  /** conversation or entity ID — used as color seed so duplicate names still get distinct colors */
  id?: number;
}

const colors = [
  '#1565C0','#2E7D32','#6A1B9A','#D84315','#00695C',
  '#F57F17','#B71C1C','#1B5E20','#880E4F','#006064',
  '#4527A0','#00838F','#558B2F','#E65100','#AD1457',
];

function getColor(name: string, id?: number) {
  const seed = id !== undefined ? `${id}::${name}` : name;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

export default function MsgAvatar({ name, size = 'md', online, id }: Props) {
  const letter = (name || '?').charAt(0).toUpperCase();
  const cls = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-12 h-12 text-base' : 'w-10 h-10 text-sm';
  return (
    <div className="relative flex-shrink-0">
      <div className={`${cls} rounded-full flex items-center justify-center text-white font-bold`}
        style={{ backgroundColor: getColor(name, id) }}>
        {letter}
      </div>
      {online && (
        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full" />
      )}
    </div>
  );
}
