// js/snaps.js
const Snaps = {
  pendingSnaps: [],
  selectedRecipients: [],
  sendToStory: false,
  snapTimer: null,

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

    // Reset all checkmarks
    document.getElementById('story-check').classList.remove('selected');
    document.getElementById('send-to-confirm').style.display = 'none';

    try {
      const { friends } = await App.api('/api/users/friends');
      const container = document.getElementById('send-to-friends');

      if (!friends.length) {
        container.innerHTML = `
          <div class="empty-state">
            <p>Add friends to send snaps!</p>
          </div>
        `;
      } else {
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
      }
    } catch (err) {
      console.error('Error loading friends:', err);
    }

    this.setupSendToEvents();
  },

  setupSendToEvents() {
    // FIXED: X button now properly closes and returns to camera
    const backBtn = document.getElementById('send-to-back');
    const newBackBtn = backBtn.cloneNode(true);
    backBtn.parentNode.replaceChild(newBackBtn, backBtn);
    newBackBtn.addEventListener('click', () => {
      this.selectedRecipients = [];
      this.sendToStory = false;
      App.navigateTo('camera-screen');
      Camera.closePreview();
    });

    // Story toggle
    const storyOpt = document.getElementById('send-to-story');
    const newStoryOpt = storyOpt.cloneNode(true);
    storyOpt.parentNode.replaceChild(newStoryOpt, storyOpt);
    newStoryOpt.addEventListener('click', () => {
      this.sendToStory = !this.sendToStory;
      const check = document.getElementById('story-check');
      check.classList.toggle('selected', this.sendToStory);
      this.updateSendButton();
    });

    // Confirm send
    const confirmBtn = document.getElementById('send-to-confirm');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', () => {
      this.sendSnap();
    });

    // Search
    const searchInput = document.getElementById('send-to-search');
    searchInput.oninput = (e) => {
      const query = e.target.value.toLowerCase();
      document.querySelectorAll('#send-to-friends .send-to-item').forEach(item => {
        const nameEl = item.querySelector('.conv-name');
        if (nameEl) {
          const name = nameEl.textContent.toLowerCase();
          item.style.display = name.includes(query) ? 'flex' : 'none';
        }
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
    if (!App.capturedImageData) {
      UI.showToast('No image to send', 'error');
      return;
    }

    const caption = document.getElementById('snap-caption-input')?.value?.trim() || '';

    UI.showLoading();

    try {
      // FIXED: Send as SNAP not regular image
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

      if (this.sendToStory) {
        await Stories.postStory(App.capturedImageData, caption, true);
      }

      UI.showToast('Sent! 🚀', 'success');

      // Reset state
      this.selectedRecipients = [];
      this.sendToStory = false;

      App.navigateTo('camera-screen');
      Camera.closePreview();

      // Reload conversations so new snaps show
      Chat.loadConversations();
    } catch (err) {
      UI.showToast('Failed to send', 'error');
      console.error(err);
    } finally {
      UI.hideLoading();
    }
  },

  handleNewSnap(data) {
    UI.showToast('📸 New snap!', 'info');
    this.loadPendingSnaps();
    Chat.loadConversations();
  },

async openSnap(snapId, fallbackCallback) {
    try {
      const snap = await App.api(`/api/snaps/${snapId}/open`, {
        method: 'POST'
      });

      // Check if snap has valid data
      if (!snap || !snap.imageData) {
        console.warn('Snap has no image data, deleting and opening chat');
        await this.deleteBuggedSnap(snapId);
        if (fallbackCallback) fallbackCallback();
        return;
      }

      this.showSnapViewer(snap);
    } catch (err) {
      console.error('Error opening snap:', err);
      // Delete the bugged snap
      await this.deleteBuggedSnap(snapId);
      UI.showToast('Snap unavailable, opening chat', 'info');
      // Fall back to opening chat
      if (fallbackCallback) {
        fallbackCallback();
      }
      // Refresh conversation list
      Chat.loadConversations();
    }
  },

  async deleteBuggedSnap(snapId) {
    try {
      await App.api(`/api/snaps/${snapId}/delete`, {
        method: 'DELETE'
      });
      console.log('Deleted bugged snap:', snapId);
    } catch (err) {
      console.error('Failed to delete bugged snap:', err);
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

    const duration = snap.duration || 5;
    progress.style.transition = 'none';
    progress.style.width = '100%';

    requestAnimationFrame(() => {
      progress.style.transition = `width ${duration}s linear`;
      progress.style.width = '0%';
    });

    this.snapTimer = setTimeout(() => {
      this.closeSnapViewer();
    }, duration * 1000);

    document.getElementById('snap-close-btn').onclick = () => {
      this.closeSnapViewer();
    };

    if (App.socket) {
      App.socket.emit('snap_opened', { snapId: snap._id });
    }

    // Refresh chat list to update status
    setTimeout(() => Chat.loadConversations(), 1000);
  },

  closeSnapViewer() {
    clearTimeout(this.snapTimer);
    document.getElementById('snap-viewer').style.display = 'none';
    document.getElementById('bottom-nav').style.display = 'flex';
    document.getElementById('snap-timer-progress').style.width = '100%';
    document.getElementById('snap-timer-progress').style.transition = 'none';
    Chat.loadConversations();
  }
};