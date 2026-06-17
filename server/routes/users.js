const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// Search users
router.get('/search', auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json([]);
    }

    const users = await User.find({
      _id: { $ne: req.userId },
      $or: [
        { username: { $regex: q, $options: 'i' } },
        { displayName: { $regex: q, $options: 'i' } }
      ]
    })
    .select('username displayName avatar snapScore')
    .limit(20);

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Send friend request
router.post('/friend-request/:userId', auth, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser._id.equals(req.userId)) {
      return res.status(400).json({ error: 'Cannot add yourself' });
    }

    const currentUser = await User.findById(req.userId);

    // Check if already friends
    if (currentUser.friends.includes(targetUser._id)) {
      return res.status(400).json({ error: 'Already friends' });
    }

    // Check if request already sent
    if (currentUser.sentFriendRequests.includes(targetUser._id)) {
      return res.status(400).json({ error: 'Friend request already sent' });
    }

    // Check if they sent us a request (auto-accept)
    const existingRequest = currentUser.friendRequests.find(
      r => r.from.toString() === targetUser._id.toString()
    );

    if (existingRequest) {
      // Auto-accept
      currentUser.friends.push(targetUser._id);
      targetUser.friends.push(currentUser._id);

      currentUser.friendRequests = currentUser.friendRequests.filter(
        r => r.from.toString() !== targetUser._id.toString()
      );
      targetUser.sentFriendRequests = targetUser.sentFriendRequests.filter(
        id => id.toString() !== currentUser._id.toString()
      );

      await currentUser.save();
      await targetUser.save();

      return res.json({ message: 'Friend added!', status: 'accepted' });
    }

    // Send request
    targetUser.friendRequests.push({ from: currentUser._id });
    currentUser.sentFriendRequests.push(targetUser._id);

    await targetUser.save();
    await currentUser.save();

    res.json({ message: 'Friend request sent', status: 'sent' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Accept friend request
router.post('/accept-friend/:userId', auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.userId);
    const fromUser = await User.findById(req.params.userId);

    if (!fromUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const requestIndex = currentUser.friendRequests.findIndex(
      r => r.from.toString() === fromUser._id.toString()
    );

    if (requestIndex === -1) {
      return res.status(400).json({ error: 'No friend request from this user' });
    }

    currentUser.friends.push(fromUser._id);
    fromUser.friends.push(currentUser._id);

    currentUser.friendRequests.splice(requestIndex, 1);
    fromUser.sentFriendRequests = fromUser.sentFriendRequests.filter(
      id => id.toString() !== currentUser._id.toString()
    );

    await currentUser.save();
    await fromUser.save();

    res.json({ message: 'Friend request accepted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Decline friend request
router.post('/decline-friend/:userId', auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.userId);

    currentUser.friendRequests = currentUser.friendRequests.filter(
      r => r.from.toString() !== req.params.userId
    );

    const fromUser = await User.findById(req.params.userId);
    if (fromUser) {
      fromUser.sentFriendRequests = fromUser.sentFriendRequests.filter(
        id => id.toString() !== currentUser._id.toString()
      );
      await fromUser.save();
    }

    await currentUser.save();
    res.json({ message: 'Friend request declined' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove friend
router.delete('/friend/:userId', auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.userId);
    const friend = await User.findById(req.params.userId);

    currentUser.friends = currentUser.friends.filter(
      id => id.toString() !== req.params.userId
    );

    if (friend) {
      friend.friends = friend.friends.filter(
        id => id.toString() !== req.userId.toString()
      );
      await friend.save();
    }

    await currentUser.save();
    res.json({ message: 'Friend removed' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get friends list
router.get('/friends', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate('friends', 'username displayName avatar snapScore lastActive')
      .populate('friendRequests.from', 'username displayName avatar');
    res.json({
      friends: user.friends,
      friendRequests: user.friendRequests
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Block user
router.post('/block/:userId', auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.userId);
    if (!currentUser.blocked.includes(req.params.userId)) {
      currentUser.blocked.push(req.params.userId);
      // Also remove from friends
      currentUser.friends = currentUser.friends.filter(
        id => id.toString() !== req.params.userId
      );
      await currentUser.save();

      const otherUser = await User.findById(req.params.userId);
      if (otherUser) {
        otherUser.friends = otherUser.friends.filter(
          id => id.toString() !== req.userId.toString()
        );
        await otherUser.save();
      }
    }
    res.json({ message: 'User blocked' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user profile
router.get('/profile/:userId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('username displayName avatar snapScore lastActive');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;