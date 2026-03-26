'use client'

import { useState } from 'react'
import { MessageDraftModal } from '@/components/orders/MessageDraftModal'

interface Order {
  id: string
  customer: string
  date: string
  status: 'new' | 'processing' | 'shipped'
}

const mockOrders: Order[] = [
  { id: 'ETSY001', customer: 'John Doe', date: '2025-10-17', status: 'new' },
  { id: 'ETSY002', customer: 'Jane Smith', date: '2025-10-16', status: 'processing' },
  { id: 'ETSY003', customer: 'Sam Wilson', date: '2025-10-15', status: 'shipped' },
]

const statusConfig = {
  new: {
    label: 'NEW',
    bgColor: 'bg-status-new',
    textColor: 'text-white',
  },
  processing: {
    label: 'PROCESSING',
    bgColor: 'bg-status-processing',
    textColor: 'text-white',
  },
  shipped: {
    label: 'SHIPPED',
    bgColor: 'bg-status-shipped',
    textColor: 'text-white',
  },
}

export function RecentOrders() {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  return (
    <div className="bg-dark-card border border-dark-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-dark-border">
              <th className="text-left py-4 px-6 text-sm font-semibold text-dark-muted">
                Order ID
              </th>
              <th className="text-left py-4 px-6 text-sm font-semibold text-dark-muted">
                Customer
              </th>
              <th className="text-left py-4 px-6 text-sm font-semibold text-dark-muted">
                Date
              </th>
              <th className="text-left py-4 px-6 text-sm font-semibold text-dark-muted">
                Status
              </th>
              <th className="text-right py-4 px-6 text-sm font-semibold text-dark-muted">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-border">
            {mockOrders.map((order) => {
              const config = statusConfig[order.status]
              
              return (
                <tr key={order.id} className="hover:bg-dark-bg/50 transition-colors">
                  <td className="py-4 px-6 text-sm text-white font-medium">
                    {order.id}
                  </td>
                  <td className="py-4 px-6 text-sm text-white">
                    {order.customer}
                  </td>
                  <td className="py-4 px-6 text-sm text-dark-muted">
                    {order.date}
                  </td>
                  <td className="py-4 px-6">
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold ${config.bgColor} ${config.textColor}`} title={config.label}>
                      {config.label.charAt(0)}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="px-4 py-1.5 text-sm font-medium bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 hover:text-teal-300 border border-teal-500/30 rounded-lg transition-colors"
                    >
                      Draft Message
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Message Draft Modal */}
      {selectedOrder && (
        <MessageDraftModal
          isOpen={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          customerName={selectedOrder.customer}
          orderId={selectedOrder.id}
        />
      )}
    </div>
  )
}
