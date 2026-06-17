const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const auth = require('../middleware/auth');

// Get conversations list
router.get('/conversations', auth, async (req, res) => {
  try {
    const messages = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: req.user._id },
            { recipient: req.user._id }
          ]
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [
              { $gt: ['$sender', '$recipient'] },
              { sender: '$sender', recipient: '$recipient' },
              { sender: '$recipient', recipient: '$sender' }
            ]
          },
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$recipient', req.user._id] },
                    { $eq: ['$read', false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { 'lastMessage.createdAt': -1 } }
    ]);

    // Populate user info
    const User = require('../models/User');
    const conversations = await Promise.all(
      messages.map(async (conv) => {
        const otherUserId = conv.lastMessage.sender.toString() === req.userId.toString()
          ? conv.lastMessage.recipient
          : conv.lastMessage.sender;

        const otherUser = await User.findById(otherUserId)
          .select('username displayName avatar lastActive');

        return {
          user: otherUser,
          lastMessage: conv.lastMessage,
          unreadCount: conv.unreadCount
        };
      })
    );

    res.json(conversations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get messages with a user
router.get('/:userId', auth, async (req, res) => {
  try {
    const { before, limit = 50 } = req.query;
    const query = {
      $or: [
        { sender: req.userId, recipient: req.params.userId },
        { sender: req.params.userId, recipient: req.userId }
      ]
    };

    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('sender', 'username displayName avatar');

    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Save/unsave message
router.put('/:messageId/save', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const savedIndex = message.savedBy.indexOf(req.userId);
    if (savedIndex > -1) {
      message.savedBy.splice(savedIndex, 1);
    } else {
      message.savedBy.push(req.userId);
    }

    message.saved = message.savedBy.length > 0;
    // If saved, remove expiration
    if (message.saved) {
      message.expiresAt = null;
    } else {
      message.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    await message.save();
    res.json(message);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete message (for self)
router.delete('/:messageId', auth, async (req, res) => {
  try {
    const message = await Message.findOne({
      _id: req.params.messageId,
      sender: req.userId
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    await Message.deleteOne({ _id: req.params.messageId });
    res.json({ message: 'Message deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;