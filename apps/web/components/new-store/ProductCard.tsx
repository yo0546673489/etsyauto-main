import { Product } from '@/types/new-store'

interface Props {
  product: Product
  onClick: (product: Product) => void
  index: number
}

export default function ProductCard({ product, onClick, index }: Props) {
  const mainImage = product.images[0]
  return (
    <div onClick={() => onClick(product)}
      className="bg-[#0d1a12] border border-[#1a2e24] rounded-2xl overflow-hidden cursor-pointer hover:border-[#006d43] transition-all duration-200 hover:shadow-[0_0_20px_rgba(0,109,67,0.15)] group"
      style={{ animationDelay: `${index * 50}ms` }}>
      <div className="relative aspect-square bg-[#0a0f0d] overflow-hidden">
        {mainImage ? (
          <img src={mainImage} alt={product.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600 text-4xl">🖼️</div>
        )}
        <div className="absolute bottom-2 right-2 flex gap-1">
          {product.images.slice(1, 5).map((_, i) => (
            <div key={i} className="w-2 h-2 rounded-full bg-white/60" />
          ))}
        </div>
      </div>
      <div className="p-4">
        <h3 className="text-sm font-medium text-white line-clamp-2 leading-snug mb-2">{product.title}</h3>
        <div className="flex items-center justify-between">
          <span className="text-[#006d43] font-bold">₪{product.price}</span>
          <span className="text-xs text-gray-500">{product.tags.length} תגים</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {product.tags.slice(0, 3).map((tag, i) => (
            <span key={i} className="text-xs px-2 py-0.5 bg-[#0a0f0d] border border-[#1a2e24] rounded-full text-gray-400">{tag}</span>
          ))}
          {product.tags.length > 3 && <span className="text-xs text-gray-600">+{product.tags.length - 3}</span>}
        </div>
      </div>
    </div>
  )
}
