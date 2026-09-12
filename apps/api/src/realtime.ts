import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { identityFor } from './auth.js';
import { origins } from './config.js';
import type { Identity } from './model.js';
import { activityAudience, notificationState } from './repository.js';
import { setChangeHandler } from './services.js';
export function createRealtime(http: HttpServer) {
  const io = new Server(http, {
    transports: ['websocket'],
    allowUpgrades: false,
    cors: { origin: origins, credentials: true },
    allowRequest: (request, callback) =>
      callback(null, !!request.headers.origin && origins.includes(request.headers.origin)),
    maxHttpBufferSize: 16384,
  });
  const users = new Map<string, Set<string>>();
  const presence = () => {
    const count = users.size;
    for (const s of io.sockets.sockets.values())
      if ((s.data.identity as Identity).role === 'ADMIN') s.emit('presence', { count });
  };
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (typeof token !== 'string') throw new Error();
      socket.data.identity = await identityFor(token);
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });
  io.on('connection', (socket) => {
    const user = socket.data.identity as Identity;
    socket.join(`user:${user.id}`);
    const connections = users.get(user.id) || new Set<string>();
    connections.add(socket.id);
    users.set(user.id, connections);
    const expiry = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, user.exp * 1000 - Date.now()),
    );
    socket.emit('ready');
    presence();
    socket.on('disconnect', () => {
      clearTimeout(expiry);
      connections.delete(socket.id);
      if (!connections.size) users.delete(user.id);
      presence();
    });
  });
  const revalidate = async () => {
    for (const socket of io.sockets.sockets.values()) {
      try {
        socket.data.identity = await identityFor(socket.handshake.auth.token);
      } catch {
        socket.disconnect(true);
      }
    }
  };
  setChangeHandler(async (change) => {
    await revalidate();
    const recipients = change.taskId ? await activityAudience(change.taskId) : [];
    for (const user of recipients) {
      // Private server-assigned rooms; clients cannot join arbitrary projects/users.
      io.to(`user:${user.id}`).emit('activity', { taskId: change.taskId });
      io.to(`user:${user.id}`).emit('notifications', {
        unread: (await notificationState(user)).unread,
      });
    }
    if (change.previousAssignee) io.to(`user:${change.previousAssignee}`).emit('invalidate');
    if (change.all) io.emit('invalidate');
  });
  return {
    io,
    onlineCount: () => users.size,
    disconnectSession: (sessionId: string) => {
      for (const s of io.sockets.sockets.values())
        if (s.data.identity.session_id === sessionId) s.disconnect(true);
    },
    notify: async (user: Identity) => {
      await revalidate();
      io.to(`user:${user.id}`).emit('notifications', {
        unread: (await notificationState(user)).unread,
      });
    },
  };
}
