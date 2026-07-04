import { useEffect, useRef } from 'react';
import { getSocket, connectSocket } from '@/lib/socket';

export function useExecutionSocket(executionId, onEvent) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!executionId) return;

    const socket = connectSocket();

    socket.emit('subscribe:execution', executionId);

    function handler(data) {
      onEventRef.current(data);
    }

    socket.on('agent:event', handler);

    return () => {
      socket.off('agent:event', handler);
      socket.emit('unsubscribe:execution', executionId);
    };
  }, [executionId]);
}
