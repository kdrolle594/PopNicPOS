import { Server } from 'socket.io';

let io;

export function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || '*',
      methods: ['GET', 'POST'],
    }
  });

  io.on('connection', (socket) => {
    socket.on('joinDeliveryRoom',  ({ orderId }) => socket.join(`delivery-${orderId}`));
    socket.on('watchDelivery',     ({ orderId }) => socket.join(`delivery-${orderId}`));
    socket.on('leaveDeliveryRoom', ({ orderId }) => socket.leave(`delivery-${orderId}`));
    socket.on('driverLocation', ({ orderId, lat, lng, driverName }) => {
      socket.to(`delivery-${orderId}`).emit('driverLocation', {
        lat, lng, driverName, timestamp: Date.now()
      });
    });
  });
}

export function emitNewOrder(order) {
  if (io) io.emit('newOrder', order);
}

export function emitOrderStatusUpdated(orderId, status) {
  if (io) io.emit('orderStatusUpdated', { orderId, status });
}

export function emitOrderDriverAssigned(orderId, driver) {
  if (io) io.emit('orderDriverAssigned', { orderId, ...driver });
}

export function getIO() {
  return io;
}
