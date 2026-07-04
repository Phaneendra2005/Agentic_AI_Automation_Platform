import { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import NotificationsDrawer from './NotificationsDrawer';

export default function AppShell({ children }) {
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Topbar onNotificationsClick={() => setNotifOpen(true)} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
      <NotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  );
}
