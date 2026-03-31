'use client';

import { MsgCardData } from '@/lib/messages-api';

interface Props {
  senderType: 'customer' | 'store';
  senderName: string;
  text: string;
  sentAt: string;
  pending?: boolean;
  failed?: boolean;
  imageUrls?: string[];
  cardUrls?: string[];
  cardData?: MsgCardData;
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

// Extract clean numeric price from any string like "NowPrice:$80.25" → "$80.25"
function cleanPrice(raw?: string): string {
  if (!raw) return '';
  const match = raw.match(/(\d[\d,]*\.?\d*)/);
  if (!match) return '';
  const num = parseFloat(match[1].replace(/,/g, ''));
  return isNaN(num) ? '' : `$${num.toFixed(2)}`;
}

function ProductCard({ card }: { card: MsgCardData }) {
  const href = card.url || '#';
  const salePrice = cleanPrice(card.salePrice);
  const origPrice = cleanPrice(card.origPrice);
  const title = (card.title || '').replace(/ [-–|] Etsy$/, '').replace(/ on Etsy$/, '').trim();

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex rounded-xl border border-gray-200 bg-white overflow-hidden hover:bg-gray-50 transition-colors cursor-pointer"
      style={{ textDecoration: 'none', maxWidth: '300px' }}
    >
      {card.image && (
        <img
          src={card.image}
          alt={title || 'מוצר'}
          className="w-24 h-24 object-cover flex-shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      <div className="flex flex-col justify-center py-2 px-3 min-w-0 flex-1">
        {title && (
          <p className="text-xs font-medium text-gray-800 leading-tight line-clamp-2 mb-1">
            {title}
          </p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {salePrice && (
            <span className="text-sm font-bold" style={{ color: '#e84343' }}>
              {salePrice}
            </span>
          )}
          {origPrice && origPrice !== salePrice && (
            <span className="text-xs text-gray-400 line-through">
              {origPrice}
            </span>
          )}
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5">etsy.com</p>
      </div>
    </a>
  );
}

export default function MsgBubble({ senderType, senderName, text, sentAt, pending, failed, imageUrls, cardUrls, cardData }: Props) {
  const isStore = senderType === 'store';

  // Show product card if we have scraped card data
  const hasCard = cardData && (cardData.image || cardData.title);
  // Plain images (not Etsy listing links)
  const plainImages = (imageUrls || []).filter(u => !u.includes('etsy.com/listing/') && u.startsWith('http'));
  // Etsy listing URLs from text (only show as fallback link if no card data)
  const etsyLinks = (cardUrls || []);

  return (
    <div className={`flex ${isStore ? 'justify-start' : 'justify-end'} mb-2 px-4`}>
      <div className={`max-w-[72%] rounded-2xl px-4 py-2.5 shadow-sm
        ${isStore
          ? 'bg-[#e8f5ee] text-gray-900 rounded-tl-sm border border-[#c8e6c9]'
          : 'bg-white text-gray-900 rounded-tr-sm border border-[var(--border-color)]'}
        ${pending || failed ? 'opacity-70' : ''}`}
      >
        <p className="text-xs font-semibold mb-1" style={{ color: isStore ? '#006d43' : '#757575' }}>
          {senderName}
        </p>
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{text}</p>

        {/* Product card from scraped data */}
        {hasCard && <ProductCard card={cardData!} />}

        {/* Plain inline images */}
        {plainImages.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {plainImages.map((url, idx) => (
              <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
                <img
                  src={url}
                  alt={`תמונה ${idx + 1}`}
                  className="rounded-lg max-h-48 max-w-full object-cover border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </a>
            ))}
          </div>
        )}

        {/* Etsy listing links (shown only if no card data available) */}
        {!hasCard && etsyLinks.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {etsyLinks.map((url, idx) => (
              <a key={idx} href={url} target="_blank" rel="noopener noreferrer"
                className="text-xs underline break-all"
                style={{ color: isStore ? '#006d43' : '#1976d2' }}>
                {url.length > 60 ? url.substring(0, 57) + '...' : url}
              </a>
            ))}
          </div>
        )}

        <div className={`flex items-center gap-1 mt-1 ${isStore ? 'justify-start' : 'justify-end'}`}>
          <span className="text-[10px] text-gray-400">{formatTime(sentAt)}</span>
          {pending && <span className="text-[10px] text-gray-400">שולח...</span>}
          {failed && <span className="text-[10px] text-red-400">נכשל ❌</span>}
        </div>
      </div>
    </div>
  );
}
