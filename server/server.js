require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { startCleanupJob } = require('./utils/cleanup');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 10e6
});

// Security
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200
});
app.use('/api/', limiter);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('MONGO_URI environment variable is not set!');
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/snaps', require('./routes/snaps'));
app.use('/api/stories', require('./routes/stories'));

// Socket.IO for real-time messaging
const connectedUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));

  const jwt = require('jsonwebtoken');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'snapclone_secret_key_2024');
    socket.userId = decoded.userId;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.userId}`);
  connectedUsers.set(socket.userId, socket.id);

  // Broadcast online status
  io.emit('user_online', { userId: socket.userId });

  // Send snap
  socket.on('send_snap', async (data) => {
    const { recipientId, imageData, duration, caption } = data;
    const Snap = require('./models/Snap');

    try {
      const snap = new Snap({
        sender: socket.userId,
        recipient: recipientId,
        imageData: imageData,
        duration: duration || 5,
        caption: caption || ''
      });
      await snap.save();

      const recipientSocket = connectedUsers.get(recipientId);
      if (recipientSocket) {
        io.to(recipientSocket).emit('new_snap', {
          snapId: snap._id,
          senderId: socket.userId,
          timestamp: snap.createdAt
        });
      }

      socket.emit('snap_sent', { success: true, snapId: snap._id });
    } catch (err) {
      socket.emit('snap_error', { error: 'Failed to send snap' });
    }
  });

  // Chat messaging
  socket.on('send_message', async (data) => {
    const { recipientId, content, type, mediaData, replyToId } = data;
    const Message = require('./models/Message');

    try {
      const message = new Message({
        sender: socket.userId,
        recipient: recipientId,
        content: content,
        type: type || 'text',
        mediaData: mediaData || null,
        replyTo: replyToId || null,
        read: false
      });
      await message.save();
      await message.populate('sender', 'username displayName avatar');
      if (replyToId) {
        await message.populate('replyTo', 'content type sender');
      }

      const recipientSocket = connectedUsers.get(recipientId);
      if (recipientSocket) {
        io.to(recipientSocket).emit('new_message', message);
      }

      socket.emit('message_sent', message);
    } catch (err) {
      console.error('Send message error:', err);
      socket.emit('message_error', { error: 'Failed to send message' });
    }
  });

  // Typing indicator
  socket.on('typing', (data) => {
    const recipientSocket = connectedUsers.get(data.recipientId);
    if (recipientSocket) {
      io.to(recipientSocket).emit('user_typing', {
        userId: socket.userId
      });
    }
  });

  socket.on('stop_typing', (data) => {
    const recipientSocket = connectedUsers.get(data.recipientId);
    if (recipientSocket) {
      io.to(recipientSocket).emit('user_stop_typing', {
        userId: socket.userId
      });
    }
  });

  // Message read
  socket.on('message_read', async (data) => {
    const Message = require('./models/Message');
    try {
      await Message.updateMany(
        { sender: data.senderId, recipient: socket.userId, read: false },
        { read: true, readAt: new Date() }
      );
      const senderSocket = connectedUsers.get(data.senderId);
      if (senderSocket) {
        io.to(senderSocket).emit('messages_read', { readerId: socket.userId });
      }
    } catch (err) {
      console.error('Error marking messages read:', err);
    }
  });

  // Snap opened
  socket.on('snap_opened', async (data) => {
    const Snap = require('./models/Snap');
    try {
      await Snap.findByIdAndUpdate(data.snapId, {
        opened: true,
        openedAt: new Date()
      });
      const snap = await Snap.findById(data.snapId);
      if (snap) {
        const senderSocket = connectedUsers.get(snap.sender.toString());
        if (senderSocket) {
          io.to(senderSocket).emit('snap_was_opened', {
            snapId: data.snapId,
            openedBy: socket.userId
          });
        }
      }
    } catch (err) {
      console.error('Error marking snap opened:', err);
    }
  });

  // Screenshot notification
  socket.on('screenshot_taken', (data) => {
    const targetSocket = connectedUsers.get(data.targetUserId);
    if (targetSocket) {
      io.to(targetSocket).emit('screenshot_alert', {
        userId: socket.userId,
        type: data.type
      });
    }
  });

  socket.on('disconnect', () => {
    connectedUsers.delete(socket.userId);
    io.emit('user_offline', { userId: socket.userId });
    console.log(`User disconnected: ${socket.userId}`);
  });
});

// Start cleanup job for expired snaps/stories
startCleanupJob();

// Serve index.html for all non-API routes (SPA)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SnapClone server running on port ${PORT}`);
});