const Snaps = {
  pendingSnaps: [],
  selectedRecipients: [],
  sendToStory: false,

  async loadPendingSnaps() {
    try {
      const snaps = await App.api('/api/snaps/pending');
      this.pendingSnaps = snaps;
      return snaps;
    } catch (err) {
      console.error('Error loading snaps:', err);
      return [];
    }
  },

  async loadSendToList() {
    this.selectedRecipients = [];
    this.sendToStory = false;

    try {
      const { friends } = await App.api('/api/users/friends');
      const container = document.getElementById('send-to-friends');

      if (!friends.length) {
        container.innerHTML = `
          <div class="empty-state">
            <p>Add friends to send snaps!</p>
          </div>
        `;
        return;
      }

      container.innerHTML = friends.map(friend => `
        <div class="send-to-item" onclick="Snaps.toggleRecipient('${friend._id}', this)">
          <div class="conv-avatar">
            ${friend.avatar ? `<img src="${friend.avatar}" alt="">` : '👻'}
          </div>
          <div class="conv-info">
            <div class="conv-name">${friend.displayName || friend.username}</div>
            <div class="conv-preview">@${friend.username}</div>
          </div>
          <div class="send-to-check" id="check-${friend._id}"></div>
        </div>
      `).join('');
    } catch (err) {
      console.error('Error loading friends:', err);
    }

    // Setup send-to events
    this.setupSendToEvents();
  },

  setupSendToEvents() {
    // Back
    document.getElementById('send-to-back').onclick = () => {
      App.navigateTo('camera-screen');
      Camera.closePreview();
    };

    // Story toggle
    document.getElementById('send-to-story').onclick = () => {
      this.sendToStory = !this.sendToStory;
      const check = document.getElementById('story-check');
      check.classList.toggle('selected', this.sendToStory);
      this.updateSendButton();
    };

    // Confirm send
    document.getElementById('send-to-confirm').onclick = () => {
      this.sendSnap();
    };

    // Search
    document.getElementById('send-to-search').oninput = (e) => {
      const query = e.target.value.toLowerCase();
      document.querySelectorAll('#send-to-friends .send-to-item').forEach(item => {
        const name = item.querySelector('.conv-name').textContent.toLowerCase();
        item.style.display = name.includes(query) ? 'flex' : 'none';
      });
    };
  },

  toggleRecipient(userId, element) {
    const index = this.selectedRecipients.indexOf(userId);
    const check = document.getElementById(`check-${userId}`);

    if (index > -1) {
      this.selectedRecipients.splice(index, 1);
      check.classList.remove('selected');
    } else {
      this.selectedRecipients.push(userId);
      check.classList.add('selected');
    }

    this.updateSendButton();
  },

  updateSendButton() {
    const btn = document.getElementById('send-to-confirm');
    const count = this.selectedRecipients.length + (this.sendToStory ? 1 : 0);
    const countSpan = document.getElementById('send-count');

    if (count > 0) {
      btn.style.display = 'flex';
      countSpan.textContent = count;
    } else {
      btn.style.display = 'none';
    }
  },

  async sendSnap() {
    if (!App.capturedImageData) return;

    const caption = document.getElementById('snap-caption-input').value.trim();

    UI.showLoading();

    try {
      // Send to selected friends
      if (this.selectedRecipients.length > 0) {
        await App.api('/api/snaps/send', {
          method: 'POST',
          body: JSON.stringify({
            recipients: this.selectedRecipients,
            imageData: App.capturedImageData,
            duration: 5,
            caption: caption,
            filters: [Camera.currentFilter]
          })
        });
      }

      // Post as story
      if (this.sendToStory) {
        await Stories.postStory(App.capturedImageData, caption);
      }

      UI.showToast('Sent! 🚀', 'success');
      App.navigateTo('camera-screen');
      Camera.closePreview();
    } catch (err) {
      UI.showToast('Failed to send', 'error');
      console.error(err);
    } finally {
      UI.hideLoading();
    }
  },

  handleNewSnap(data) {
    UI.showToast('New snap! 📸', 'info');
    this.loadPendingSnaps();
  },

  async openSnap(snapId) {
    try {
      const snap = await App.api(`/api/snaps/${snapId}/open`, {
        method: 'POST'
      });

      this.showSnapViewer(snap);
    } catch (err) {
      console.error('Error opening snap:', err);
      UI.showToast('Could not open snap', 'error');
    }
  },

  showSnapViewer(snap) {
    const viewer = document.getElementById('snap-viewer');
    const image = document.getElementById('snap-viewer-image');
    const username = document.getElementById('snap-viewer-username');
    const time = document.getElementById('snap-viewer-time');
    const caption = document.getElementById('snap-viewer-caption');
    const progress = document.getElementById('snap-timer-progress');

    image.src = snap.imageData;
    username.textContent = snap.sender?.displayName || snap.sender?.username || 'Unknown';
    time.textContent = App.formatTime(snap.createdAt);

    if (snap.caption) {
      caption.textContent = snap.caption;
      caption.style.display = 'block';
    } else {
      caption.style.display = 'none';
    }

    viewer.style.display = 'block';
    document.getElementById('bottom-nav').style.display = 'none';

    // Timer
    const duration = snap.duration || 5;
    progress.style.transition = `width ${duration}s linear`;
    progress.style.width = '100%';

    requestAnimationFrame(() => {
      progress.style.width = '0%';
    });

    // Auto-close after duration
    this.snapTimer = setTimeout(() => {
      this.closeSnapViewer();
    }, duration * 1000);

    // Close button
    document.getElementById('snap-close-btn').onclick = () => {
      this.closeSnapViewer();
    };

    // Notify sender
    if (App.socket) {
      App.socket.emit('snap_opened', { snapId: snap._id });
    }
  },

  closeSnapViewer() {
    clearTimeout(this.snapTimer);
    document.getElementById('snap-viewer').style.display = 'none';
    document.getElementById('bottom-nav').style.display = 'flex';
    document.getElementById('snap-timer-progress').style.width = '100%';
    document.getElementById('snap-timer-progress').style.transition = 'none';
  }
};