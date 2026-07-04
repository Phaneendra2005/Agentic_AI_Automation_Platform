import { io } from 'socket.io-client';

let socket = null;

function getToken() {
  try {
    const stored = localStorage.getItem('agentflow-auth');
    if (stored) return JSON.parse(stored)?.state?.token || null;
  } catch {}
  return null;
}

export function getSocket() {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000', {
      auth: { token: getToken() },
      autoConnect: false,
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket?.connected) {
    socket.disconnect();
    socket = null;
  }
}
