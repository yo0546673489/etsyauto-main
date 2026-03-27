import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { storeApi, Store } from '../api/client';

export default function StoresPage() {
  const navigate = useNavigate();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<number | null>(null);

  useEffect(() => {
    storeApi.getAll().then(setStores).finally(() => setLoading(false));
  }, []);

  const handleInitialSync = async (store: Store) => {
    if (!confirm(`להתחיל סנכרון ראשוני לחנות "${store.store_name}"?`)) return;
    setSyncing(store.id);
    try {
      await storeApi.triggerInitialSync(store.id);
      alert('סנכרון ראשוני הופעל בהצלחה');
      setStores(prev => prev.map(s => s.id === store.id ? { ...s } : s));
    } catch (e: any) {
      alert(e.response?.data?.error || 'שגיאה בהפעלת הסנכרון');
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="text-blue-600 text-sm hover:underline">← חזרה</button>
        <h1 className="font-bold text-gray-900 text-lg">ניהול חנויות</h1>
      </div>

      <div className="p-4 max-w-4xl mx-auto">
        {loading ? (
          <div className="text-center text-gray-400 py-12">טוען...</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">מס'</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">שם</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">מייל</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">AdsPower</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">סטטוס</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stores.map(store => (
                  <tr key={store.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500">{store.store_number}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{store.store_name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{store.store_email}</td>
                    <td className="px-4 py-3 text-gray-500">#{store.adspower_profile_id}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium
                        ${store.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${store.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                        {store.status === 'active' ? 'פעיל' : store.status}
                      </span>
                      {store.initial_sync_completed && (
                        <span className="mr-2 text-xs text-green-600">✓ סונכרן</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!store.initial_sync_completed && (
                        <button
                          onClick={() => handleInitialSync(store)}
                          disabled={syncing === store.id}
                          className="px-3 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
                          style={{ backgroundColor: '#2196F3' }}
                        >
                          {syncing === store.id ? 'מופעל...' : 'סנכרון ראשוני'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
