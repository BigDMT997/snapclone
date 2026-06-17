const express = require('express');
const router = express.Router();
const Story = require('../models/Story');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Post story
router.post('/', auth, async (req, res) => {
  try {
    const { imageData, caption, filters } = req.body;

    if (!imageData) {
      return res.status(400).json({ error: 'Image is required' });
    }

    const story = new Story({
      user: req.userId,
      imageData,
      caption: caption || '',
      filters: filters || []
    });

    await story.save();
    res.status(201).json(story);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get friends' stories
router.get('/feed', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const friendIds = [...user.friends, req.user._id];

    const stories = await Story.aggregate([
      {
        $match: {
          user: { $in: friendIds },
          expiresAt: { $gt: new Date() }
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$user',
          stories: { $push: '$$ROOT' },
          latestStory: { $first: '$createdAt' }
        }
      },
      { $sort: { latestStory: -1 } }
    ]);

    const feed = await Promise.all(
      stories.map(async (group) => {
        const storyUser = await User.findById(group._id)
          .select('username displayName avatar');
        return {
          user: storyUser,
          stories: group.stories.map(s => ({
            ...s,
            viewed: s.viewers?.some(
              v => v.user?.toString() === req.userId.toString()
            )
          })),
          hasUnviewed: group.stories.some(
            s => !s.viewers?.some(
              v => v.user?.toString() === req.userId.toString()
            )
          )
        };
      })
    );

    res.json(feed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// View story
router.post('/:storyId/view', auth, async (req, res) => {
  try {
    const story = await Story.findById(req.params.storyId);
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    const alreadyViewed = story.viewers.some(
      v => v.user.toString() === req.userId.toString()
    );

    if (!alreadyViewed) {
      story.viewers.push({ user: req.userId });
      await story.save();
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get story viewers
router.get('/:storyId/viewers', auth, async (req, res) => {
  try {
    const story = await Story.findOne({
      _id: req.params.storyId,
      user: req.userId
    }).populate('viewers.user', 'username displayName avatar');

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    res.json(story.viewers);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete story
router.delete('/:storyId', auth, async (req, res) => {
  try {
    await Story.findOneAndDelete({
      _id: req.params.storyId,
      user: req.userId
    });
    res.json({ message: 'Story deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get my stories
router.get('/mine', auth, async (req, res) => {
  try {
    const stories = await Story.find({
      user: req.userId,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    res.json(stories);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;