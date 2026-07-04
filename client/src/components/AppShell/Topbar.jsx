import { Bell, User, LogOut } from 'lucide-react';
import { useRouter } from 'next/router';
import useAuthStore from '@/store/authStore';
import useNotificationStore from '@/store/notificationStore';
import useSettingsStore from '@/store/settingsStore';
import { assetUrl } from '@/lib/url';

export default function Topbar({ onNotificationsClick }) {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { unreadCount } = useNotificationStore();
  const { settings } = useSettingsStore();
  const avatar = user?.avatar || settings?.avatar;

  function handleLogout() {
    logout();
    router.push('/login');
  }

  return (
    <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6 flex-shrink-0">
      <div />
      <div className="flex items-center gap-2">
        <button
          onClick={onNotificationsClick}
          className="relative p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-4.5 h-4.5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-violet-500 rounded-full" />
          )}
        </button>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800">
          <div className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center overflow-hidden">
            {avatar ? (
              <img
                src={assetUrl(avatar)}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="w-3 h-3 text-white" />
            )}
          </div>
          <span className="text-sm text-gray-300 font-medium">{user?.name || 'Operator'}</span>
          <span className="text-xs text-gray-600 border-l border-gray-700 pl-2">{user?.role}</span>
        </div>

        <button
          onClick={handleLogout}
          className="p-2 text-gray-500 hover:text-red-400 rounded-lg hover:bg-gray-800 transition-colors"
          aria-label="Logout"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
