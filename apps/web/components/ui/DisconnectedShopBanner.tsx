'use client';

import { useShop } from '@/lib/shop-context';
import { useLanguage } from '@/lib/language-context';
import { NotificationBanner } from '@/components/ui/NotificationBanner';

export function DisconnectedShopBanner() {
  const { selectedShops } = useShop();
  const { t } = useLanguage();

  const disconnectedShops = selectedShops.filter((s) => s.status === 'revoked' && s.etsy_shop_id);

  if (disconnectedShops.length === 0) return null;

  const names = disconnectedShops.map((s) => s.display_name || `Shop ${s.id}`).join(', ');

  return (
    <NotificationBanner
      variant="warning"
      title="Disconnected"
      message={
        <>
          <span className="font-medium">{names}</span>
          {' '}{disconnectedShops.length === 1 ? t('disconnected.isDisconnected') : t('disconnected.areDisconnected')}
        </>
      }
      action={{ label: t('disconnected.reconnect'), href: '/settings?tab=shops' }}
    />
  );
}
