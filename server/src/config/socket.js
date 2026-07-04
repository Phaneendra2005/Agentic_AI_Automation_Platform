const { Server } = require('socket.io');
const { CLIENT_URL } = require('./env');
const { JWT_SECRET } = require('./env');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: CLIENT_URL, methods: ['GET', 'POST'] },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id).select('sessionVersion');
      if (!user) return next(new Error('Invalid or expired token'));
      if ((decoded.sessionVersion ?? 0) !== (user.sessionVersion || 0)) {
        return next(new Error('Invalid or expired token'));
      }
      socket.userId = decoded.id;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    console.log('[Socket] Client connected:', socket.id);
    socket.join(`owner:${socket.userId}`);

    socket.on('subscribe:execution', (executionId) => {
      socket.join(`execution:${executionId}`);
    });

    socket.on('unsubscribe:execution', (executionId) => {
      socket.leave(`execution:${executionId}`);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Client disconnected:', socket.id);
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

function emitDashboardUpdate(ownerId, activity = {}) {
  if (!io || !ownerId) return;
  io.to(`owner:${ownerId}`).emit('dashboard:updated', {
    ...activity,
    timestamp: activity.timestamp || new Date().toISOString(),
  });
}

function emitSettingsEvent(ownerId, event, payload = {}) {
  if (!io || !ownerId) return;
  io.to(`owner:${ownerId}`).emit(event, {
    ...payload,
    timestamp: payload.timestamp || new Date().toISOString(),
  });
  io.to(`owner:${ownerId}`).emit('settings:updated', {
    event,
    ...payload,
    timestamp: payload.timestamp || new Date().toISOString(),
  });
}
function emitWorkflowUpdate(ownerId, workflow) {
  if (!io || !ownerId) return;
  io.to(`owner:${ownerId}`).emit('workflow:updated', {
    id: workflow._id,
    name: workflow.name,
    description: workflow.description,
    status: workflow.status,
    tags: workflow.tags,
    timestamp: new Date().toISOString(),
  });
}

module.exports = { initSocket, getIO, emitDashboardUpdate, emitSettingsEvent, emitWorkflowUpdate };
