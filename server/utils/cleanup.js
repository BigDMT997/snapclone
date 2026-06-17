const Snap = require('../models/Snap');
const Story = require('../models/Story');

function startCleanupJob() {
  // Run every hour
  setInterval(async () => {
    try {
      // Delete opened snaps past their expiry
      const expiredSnaps = await Snap.deleteMany({
        opened: true,
        openedAt: { $lt: new Date(Date.now() - 10000) } // 10 seconds after opened
      });

      // Delete very old unopened snaps (30 days)
      const oldSnaps = await Snap.deleteMany({
        opened: false,
        createdAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      });

      console.log(`Cleanup: ${expiredSnaps.deletedCount} expired snaps, ${oldSnaps.deletedCount} old snaps removed`);
    } catch (err) {
      console.error('Cleanup error:', err);
    }
  }, 60 * 60 * 1000);
}

module.exports = { startCleanupJob };