import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { io } from 'socket.io-client';
import { configureSession, currentToken, refreshSession, request } from './api';
import type { Activity, Notification, User } from './types';
const SessionContext = createContext<{
  user: User | null;
  loading: boolean;
  connected: boolean;
  online: number;
  missed: number;
}>({ user: null, loading: true, connected: false, online: 0, missed: 0 });
export const useSession = () => useContext(SessionContext);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [connected, setConnected] = useState(false),
    [online, setOnline] = useState(0),
    [missed, setMissed] = useState(0);
  const client = useQueryClient();
  useEffect(() => {
    configureSession((next) => {
      setUser((previous) => {
        if (previous?.id !== next?.id) client.clear();
        return next;
      });
    });
    void refreshSession()
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => configureSession(() => {});
  }, [client]);
  const token = currentToken();
  useEffect(() => {
    if (!user || !token) return;
    let stopped = false;
    const socket = io(
      import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || window.location.origin,
      {
        transports: ['websocket'],
        auth: { token },
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
      },
    );
    const invalidate = () => {
      void client.invalidateQueries();
    };
    let syncing = false,
      again = false;
    const sync = async (recovering = false) => {
      if (syncing) {
        again = true;
        return;
      }
      syncing = true;
      try {
        let cursor: string | null = null;
        try {
          cursor = localStorage.getItem(`fieldwork:cursor:${user.id}`);
        } catch {
          /* History still loads when device storage is unavailable. */
        }
        const result = await request<{ items: Activity[]; cursor: string }>(
          `/activity${cursor ? `?after=${cursor}` : ''}`,
        );
        if (stopped) return;
        try {
          localStorage.setItem(`fieldwork:cursor:${user.id}`, result.cursor);
        } catch {}
        if (recovering) setMissed(cursor ? result.items.length : 0);
        invalidate();
      } catch {
        /* Query views retain their own retry and error state. */
      } finally {
        syncing = false;
        if (again && !stopped) {
          again = false;
          void sync();
        }
      }
    };
    socket.on('ready', () => {
      setConnected(true);
      void sync(true);
    });
    socket.on('activity', () => {
      void sync();
    });
    socket.on('invalidate', () => {
      void client.resetQueries({ queryKey: ['task'] });
      void client.resetQueries({ queryKey: ['activity'] });
      invalidate();
    });
    socket.on('notifications', ({ unread }: { unread: number }) => {
      client.setQueryData<{ items: Notification[]; unread: number }>(
        ['notifications'],
        (previous) => (previous ? { ...previous, unread } : previous),
      );
      void client.invalidateQueries({ queryKey: ['notifications'] });
    });
    socket.on('presence', ({ count }: { count: number }) => setOnline(count));
    socket.on('disconnect', (reason) => {
      setConnected(false);
      if (reason === 'io server disconnect') void refreshSession().catch(() => {});
    });
    socket.on('connect_error', (error) => {
      setConnected(false);
      if (error.message === 'UNAUTHENTICATED') void refreshSession().catch(() => {});
    });
    return () => {
      stopped = true;
      socket.removeAllListeners();
      socket.disconnect();
      setConnected(false);
    };
  }, [user?.id, token, client]);
  return (
    <SessionContext.Provider value={{ user, loading, connected, online, missed }}>
      {children}
    </SessionContext.Provider>
  );
}
