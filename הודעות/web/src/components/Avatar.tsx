interface Props {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

const colors = [
  '#1976D2', '#388E3C', '#7B1FA2', '#E64A19', '#0097A7',
  '#F57C00', '#C62828', '#2E7D32', '#AD1457', '#00838F',
];

function getColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

const sizeClasses = { sm: 'w-8 h-8 text-sm', md: 'w-10 h-10 text-base', lg: 'w-12 h-12 text-lg' };

export default function Avatar({ name, size = 'md' }: Props) {
  const letter = name?.charAt(0)?.toUpperCase() || '?';
  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}
      style={{ backgroundColor: getColor(name) }}
    >
      {letter}
    </div>
  );
}
