import { X, CheckCheck, Bell } from 'lucide-react';
import useNotificationStore from '@/store/notificationStore';
import api from '@/lib/axios';

const TYPE_COLORS = {
  success: 'bg-emerald-500',
  failure: 'bg-red-500',
  escalation: 'bg-yellow-500',
  info: 'bg-blue-500',
};

export default function NotificationsDrawer({ open, onClose }) {
  const { notifications, markAllRead, markRead } = useNotificationStore();

  function handleMarkRead(id) {
    markRead(id);
    api.patch(`/notifications/${id}/read`).catch(() => {});
  }

  function handleMarkAllRead() {
    markAllRead();
    api.patch('/notifications/read-all').catch(() => {});
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-96 bg-gray-900 border-l border-gray-800 z-50 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-violet-400" />
            <span className="text-white font-semibold text-sm">Notifications</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              <CheckCheck className="w-3 h-3" /> Mark all read
            </button>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-white rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-500">
              <Bell className="w-8 h-8 mb-2 opacity-20" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            notifications.map((n) => {
              const id = n._id || n.id;
              const dot = TYPE_COLORS[n.type] || TYPE_COLORS.info;
              return (
                <button
                  key={id}
                  onClick={() => handleMarkRead(id)}
                  className={`w-full text-left px-5 py-4 border-b border-gray-800 hover:bg-gray-800/60 transition-colors ${
                    !n.read ? 'bg-gray-800/30' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${n.read ? 'bg-gray-600' : dot}`} />
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium truncate">{n.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-xs text-gray-600 mt-1">
                        {new Date(n.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
