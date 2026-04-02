import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { shopsApi, Shop } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const STORAGE_KEY = 'selectedShopId';
const MULTI_STORAGE_KEY = 'selectedShopIds';

interface ShopContextValue {
  shops: Shop[];
  /** @deprecated Use selectedShopIds for multi-store. Kept for backward compatibility. */
  selectedShopId: number | null;
  selectedShop: Shop | null;
  /** Multi-store selection — preferred over selectedShopId. */
  selectedShopIds: number[];
  selectedShops: Shop[];
  isLoading: boolean;
  /** @deprecated Use setSelectedShopIds. */
  setSelectedShopId: (shopId: number | null) => void;
  setSelectedShopIds: (ids: number[]) => void;
  toggleShopId: (id: number) => void;
  selectAllShops: () => void;
  clearAllShops: () => void;
  refreshShops: () => Promise<void>;
}

const ShopContext = createContext<ShopContextValue | undefined>(undefined);

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopIds, setSelectedShopIdsState] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshShops = async () => {
    try {
      setIsLoading(true);
      const data = await shopsApi.getAll();
      const connectedOnly = (data ?? []).filter(s => s.status === 'connected');
      setShops(connectedOnly);

      // Restore from localStorage (multi-store takes priority)
      const storedMulti = window.localStorage.getItem(MULTI_STORAGE_KEY);
      const storedSingle = window.localStorage.getItem(STORAGE_KEY);

      if (storedMulti) {
        try {
          const ids = JSON.parse(storedMulti) as number[];
          const valid = ids.filter((id) => data.some((s) => s.id === id));
          if (valid.length > 0) {
            setSelectedShopIdsState(valid);
            return;
          }
        } catch { /* fall through */ }
      }

      if (storedSingle) {
        const id = Number(storedSingle);
        if (data.some((s) => s.id === id)) {
          setSelectedShopIdsState([id]);
          return;
        }
      }

      // Default: select all
      if (data.length > 0) {
        const allIds = data.map((s) => s.id);
        setSelectedShopIdsState(allIds);
        window.localStorage.setItem(MULTI_STORAGE_KEY, JSON.stringify(allIds));
      } else {
        setSelectedShopIdsState([]);
        window.localStorage.removeItem(MULTI_STORAGE_KEY);
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      console.error('Failed to load shops:', err);
      setShops([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setShops([]);
      setSelectedShopIdsState([]);
      setIsLoading(false);
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(MULTI_STORAGE_KEY);
      return;
    }
    refreshShops();
  }, [authLoading, isAuthenticated]);

  // Persist
  useEffect(() => {
    if (selectedShopIds.length > 0) {
      window.localStorage.setItem(MULTI_STORAGE_KEY, JSON.stringify(selectedShopIds));
      // Keep single-store key in sync for backward compat
      window.localStorage.setItem(STORAGE_KEY, String(selectedShopIds[0]));
    }
  }, [selectedShopIds]);

  const setSelectedShopIds = useCallback((ids: number[]) => {
    setSelectedShopIdsState(ids);
  }, []);

  const toggleShopId = useCallback((id: number) => {
    setSelectedShopIdsState((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        return next.length > 0 ? next : prev; // Prevent deselecting all
      }
      return [...prev, id];
    });
  }, []);

  const selectAllShops = useCallback(() => {
    setSelectedShopIdsState(shops.map((s) => s.id));
  }, [shops]);

  const clearAllShops = useCallback(() => {
    // Keep at least one selected
    if (shops.length > 0) {
      setSelectedShopIdsState([shops[0].id]);
    }
  }, [shops]);

  // Legacy single-store compat
  const setSelectedShopId = useCallback((shopId: number | null) => {
    if (shopId) {
      setSelectedShopIdsState([shopId]);
    }
  }, []);

  const selectedShopId = selectedShopIds.length === 1 ? selectedShopIds[0] : (selectedShopIds[0] ?? null);
  const selectedShop = useMemo(() => {
    if (!selectedShopId) return null;
    return shops.find((s) => s.id === selectedShopId) || null;
  }, [shops, selectedShopId]);

  const selectedShops = useMemo(() => {
    return shops.filter((s) => selectedShopIds.includes(s.id));
  }, [shops, selectedShopIds]);

  const value = useMemo(
    () => ({
      shops,
      selectedShopId,
      selectedShop,
      selectedShopIds,
      selectedShops,
      isLoading,
      setSelectedShopId,
      setSelectedShopIds,
      toggleShopId,
      selectAllShops,
      clearAllShops,
      refreshShops,
    }),
    [shops, selectedShopId, selectedShop, selectedShopIds, selectedShops, isLoading, setSelectedShopId, setSelectedShopIds, toggleShopId, selectAllShops, clearAllShops]
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) {
    throw new Error('useShop must be used within a ShopProvider');
  }
  return ctx;
}
