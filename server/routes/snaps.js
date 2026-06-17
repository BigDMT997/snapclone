const express = require('express');
const router = express.Router();
const Snap = require('../models/Snap');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Get pending snaps
router.get('/pending', auth, async (req, res) => {
  try {
    const snaps = await Snap.find({
      recipient: req.userId,
      opened: false
    })
    .populate('sender', 'username displayName avatar')
    .sort({ createdAt: -1 });

    res.json(snaps);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get sent snaps status
router.get('/sent', auth, async (req, res) => {
  try {
    const snaps = await Snap.find({
      sender: req.userId
    })
    .populate('recipient', 'username displayName avatar')
    .sort({ createdAt: -1 })
    .limit(50);

    res.json(snaps);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Send snap
router.post('/send', auth, async (req, res) => {
  try {
    const { recipients, imageData, duration, caption, filters, stickers } = req.body;

    if (!recipients || !recipients.length || !imageData) {
      return res.status(400).json({ error: 'Recipients and image are required' });
    }

    const snaps = await Promise.all(
      recipients.map(async (recipientId) => {
        const snap = new Snap({
          sender: req.userId,
          recipient: recipientId,
          imageData,
          duration: duration || 5,
          caption: caption || '',
          filters: filters || [],
          stickers: stickers || []
        });
        await snap.save();
        return snap;
      })
    );

    // Update snap score
    await User.findByIdAndUpdate(req.userId, {
      $inc: { snapScore: recipients.length }
    });

    res.json({ message: 'Snaps sent', count: snaps.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Open/view snap
router.post('/:snapId/open', auth, async (req, res) => {
  try {
    const snap = await Snap.findOne({
      _id: req.params.snapId,
      recipient: req.userId
    });

    if (!snap) {
      return res.status(404).json({ error: 'Snap not found' });
    }

    if (snap.opened) {
      return res.status(400).json({ error: 'Snap already opened' });
    }

    snap.opened = true;
    snap.openedAt = new Date();
    // Snap expires after viewing based on duration
    snap.expiresAt = new Date(Date.now() + snap.duration * 1000 + 5000);
    await snap.save();

    // Update recipient snap score
    await User.findByIdAndUpdate(req.userId, {
      $inc: { snapScore: 1 }
    });

    res.json(snap);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get snap feed (friends' activity)
router.get('/feed', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const friendIds = user.friends;

    const snapActivity = await Snap.aggregate([
      {
        $match: {
          $or: [
            { sender: req.user._id, recipient: { $in: friendIds } },
            { sender: { $in: friendIds }, recipient: req.user._id }
          ]
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$sender', req.user._id] },
              '$recipient',
              '$sender'
            ]
          },
          lastSnap: { $first: '$$ROOT' },
          pendingCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$recipient', req.user._id] },
                    { $eq: ['$opened', false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const feed = await Promise.all(
      snapActivity.map(async (item) => {
        const friendUser = await User.findById(item._id)
          .select('username displayName avatar');
        return {
          user: friendUser,
          lastSnap: item.lastSnap,
          pendingCount: item.pendingCount
        };
      })
    );

    res.json(feed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;