import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import DiscountCard from '../components/DiscountCard';

const api = axios.create({ baseURL: '/api' });

interface DiscountTask {
  id: number;
  store_id: number;
  task_type: 'create_sale' | 'end_sale' | 'update_sale';
  sale_name: string;
  discount_percent: number;
  target_scope: string;
  target_country: string;
  terms_text?: string;
  start_date: string;
  end_date: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  created_at: string;
  executed_at?: string;
}

interface Store {
  id: number;
  store_name: string;
}

export default function DiscountsPage() {
  const [tasks, setTasks] = useState<DiscountTask[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<number | undefined>();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // New discount form
  const [showForm, setShowForm] = useState(false);
  const [formStore, setFormStore] = useState<number>(0);
  const [formTaskType, setFormTaskType] = useState<string>('create_sale');
  const [formSaleName, setFormSaleName] = useState('');
  const [formPercent, setFormPercent] = useState(10);
  const [formScope, setFormScope] = useState('whole_shop');
  const [formCountry, setFormCountry] = useState('Everywhere');
  const [formTerms, setFormTerms] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (selectedStore) params.store_id = selectedStore;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get('/discounts/tasks', { params });
      setTasks(res.data.tasks);
    } catch (err) {
      console.error('Failed to load discount tasks', err);
    } finally {
      setLoading(false);
    }
  }, [selectedStore, statusFilter]);

  useEffect(() => {
    api.get('/stores').then(r => setStores(r.data.stores || [])).catch(() => {});
    loadTasks();
  }, [loadTasks]);

  const handleSubmit = async () => {
    if (!formStore || !formSaleName) return;
    try {
      await api.post('/discounts/tasks', {
        store_id: formStore,
        task_type: formTaskType,
        sale_name: formSaleName,
        discount_percent: formPercent,
        target_scope: formScope,
        target_country: formCountry,
        terms_text: formTerms || undefined,
        start_date: formStartDate,
        end_date: formEndDate,
      });
      setShowForm(false);
      setFormSaleName('');
      setFormPercent(10);
      setFormTerms('');
      setFormStartDate('');
      setFormEndDate('');
      loadTasks();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to create task');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Discounts & Sales</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
          >
            {showForm ? 'Cancel' : '+ New Sale'}
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4">
          <select
            value={selectedStore || ''}
            onChange={e => setSelectedStore(e.target.value ? Number(e.target.value) : undefined)}
            className="border rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">All Stores</option>
            {stores.map(s => (
              <option key={s.id} value={s.id}>{s.store_name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {/* New Discount Form */}
        {showForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <h3 className="font-medium text-gray-900 mb-3">New Discount Task</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <select
                value={formStore}
                onChange={e => setFormStore(Number(e.target.value))}
                className="border rounded px-3 py-2 text-sm"
              >
                <option value={0}>Select Store</option>
                {stores.map(s => (
                  <option key={s.id} value={s.id}>{s.store_name}</option>
                ))}
              </select>
              <select
                value={formTaskType}
                onChange={e => setFormTaskType(e.target.value)}
                className="border rounded px-3 py-2 text-sm"
              >
                <option value="create_sale">Create Sale</option>
                <option value="update_sale">Update Sale</option>
                <option value="end_sale">End Sale</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input
                value={formSaleName}
                onChange={e => setFormSaleName(e.target.value)}
                placeholder="Sale name (alphanumeric)"
                className="border rounded px-3 py-2 text-sm"
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={formPercent}
                  onChange={e => setFormPercent(Number(e.target.value))}
                  min={5}
                  max={75}
                  className="border rounded px-3 py-2 text-sm w-24"
                />
                <span className="text-sm text-gray-600">% off</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <select
                value={formScope}
                onChange={e => setFormScope(e.target.value)}
                className="border rounded px-3 py-2 text-sm"
              >
                <option value="whole_shop">Whole Shop</option>
                <option value="specific_listings">Specific Listings</option>
              </select>
              <input
                value={formCountry}
                onChange={e => setFormCountry(e.target.value)}
                placeholder="Target country"
                className="border rounded px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-500">Start Date</label>
                <input
                  type="date"
                  value={formStartDate}
                  onChange={e => setFormStartDate(e.target.value)}
                  className="border rounded px-3 py-2 text-sm w-full"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">End Date (max 30 days)</label>
                <input
                  type="date"
                  value={formEndDate}
                  onChange={e => setFormEndDate(e.target.value)}
                  className="border rounded px-3 py-2 text-sm w-full"
                />
              </div>
            </div>
            <input
              value={formTerms}
              onChange={e => setFormTerms(e.target.value)}
              placeholder="Terms (optional, max 500 chars)"
              maxLength={500}
              className="w-full border rounded px-3 py-2 text-sm mb-3"
            />
            <button
              onClick={handleSubmit}
              disabled={!formStore || !formSaleName}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50"
            >
              Create Task
            </button>
          </div>
        )}

        {/* Task List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No discount tasks yet
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map(task => (
              <DiscountCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
