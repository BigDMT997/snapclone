const Stories = {
  storiesFeed: [],
  currentStoryGroup: null,
  currentStoryIndex: 0,
  storyTimer: null,

  async loadStories() {
    try {
      const feed = await App.api('/api/stories/feed');
      this.storiesFeed = feed;
      this.renderStories();
    } catch (err) {
      console.error('Error loading stories:', err);
    }
  },

  renderStories() {
    const container = document.getElementById('friends-stories-list');

    // My stories
    const myStories = this.storiesFeed.find(g => g.user?._id === App.user._id);
    const myStoryContainer = document.getElementById('my-story-container');

    if (myStories && myStories.stories.length > 0) {
      myStoryContainer.innerHTML = `
        <div class="story-item" onclick="Stories.viewStoryGroup('${App.user._id}')">
          <div class="story-avatar has-story">
            ${App.user.avatar ? `<img src="${App.user.avatar}" alt="">` : '👻'}
          </div>
          <span>My Story</span>
        </div>
        <div class="story-item" id="my-story-add">
          <div class="story-avatar add-story">
            <i class="fas fa-plus"></i>
          </div>
          <span>Add</span>
        </div>
      `;
    }

    document.getElementById('my-story-add')?.addEventListener('click', () => {
      App.navigateTo('camera-screen');
    });

    // Friends' stories
    const friendStories = this.storiesFeed.filter(g => g.user?._id !== App.user._id);

    if (!friendStories.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📖</div>
          <h3>No stories</h3>
          <p>Your friends' stories will appear here</p>
        </div>
      `;
      return;
    }

    container.innerHTML = friendStories.map(group => {
      const user = group.user;
      if (!user) return '';
      const hasUnviewed = group.hasUnviewed;

      return `
        <div class="story-list-item" onclick="Stories.viewStoryGroup('${user._id}')">
          <div class="story-list-avatar ${hasUnviewed ? '' : 'viewed'}">
            ${user.avatar ? `<img src="${user.avatar}" alt="">` : '👻'}
          </div>
          <div class="story-list-info">
            <div class="story-list-name">${user.displayName || user.username}</div>
            <div class="story-list-time">${group.stories.length} ${group.stories.length === 1 ? 'story' : 'stories'}</div>
          </div>
        </div>
      `;
    }).join('');
  },

  viewStoryGroup(userId) {
    const group = this.storiesFeed.find(g => g.user?._id === userId);
    if (!group || !group.stories.length) return;

    this.currentStoryGroup = group;
    this.currentStoryIndex = 0;

    // Find first unviewed
    const firstUnviewed = group.stories.findIndex(s => !s.viewed);
    if (firstUnviewed > -1) {
      this.currentStoryIndex = firstUnviewed;
    }

    this.showStory();
  },

  showStory() {
    if (!this.currentStoryGroup || this.currentStoryIndex >= this.currentStoryGroup.stories.length) {
      this.closeStoryViewer();
      return;
    }

    const story = this.currentStoryGroup.stories[this.currentStoryIndex];
    const viewer = document.getElementById('story-viewer');
    const image = document.getElementById('story-viewer-image');
    const username = document.getElementById('story-viewer-username');
    const time = document.getElementById('story-viewer-time');
    const avatar = document.getElementById('story-viewer-avatar');
    const caption = document.getElementById('story-viewer-caption');
    const progress = document.getElementById('story-progress');

    const user = this.currentStoryGroup.user;
    image.src = story.imageData;
    username.textContent = user.displayName || user.username;
    time.textContent = App.formatTime(story.createdAt);
    avatar.innerHTML = user.avatar ? `<img src="${user.avatar}" alt="">` : '👻';

    if (story.caption) {
      caption.textContent = story.caption;
      caption.style.display = 'block';
    } else {
      caption.style.display = 'none';
    }

    viewer.style.display = 'block';
    document.getElementById('bottom-nav').style.display = 'none';

    // Progress bar
    progress.style.transition = 'none';
    progress.style.width = '0%';
    requestAnimationFrame(() => {
      progress.style.transition = 'width 5s linear';
      progress.style.width = '100%';
    });

    // Auto-advance
    clearTimeout(this.storyTimer);
    this.storyTimer = setTimeout(() => {
      this.nextStory();
    }, 5000);

    // Mark as viewed
    this.markStoryViewed(story._id);

    // Touch controls
    this.setupStoryControls();
  },

  setupStoryControls() {
    const viewer = document.getElementById('story-viewer');

    // Remove old listeners
    const newViewer = viewer.cloneNode(false);
    while (viewer.firstChild) {
      newViewer.appendChild(viewer.firstChild);
    }
    viewer.parentNode.replaceChild(newViewer, viewer);

    newViewer.addEventListener('click', (e) => {
      const rect = newViewer.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const midpoint = rect.width / 2;

      if (x < midpoint) {
        this.prevStory();
      } else {
        this.nextStory();
      }
    });

    // Close button
    document.getElementById('story-close-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeStoryViewer();
    });

    // Reply
    const replyInput = document.getElementById('story-reply-input');
    replyInput.addEventListener('focus', () => {
      clearTimeout(this.storyTimer);
    });

    replyInput.addEventListener('blur', () => {
      this.storyTimer = setTimeout(() => {
        this.nextStory();
      }, 5000);
    });

    document.getElementById('story-reply-send').addEventListener('click', () => {
      this.sendStoryReply();
    });
  },

  nextStory() {
    this.currentStoryIndex++;
    if (this.currentStoryIndex >= this.currentStoryGroup.stories.length) {
      // Move to next group
      const currentGroupIndex = this.storiesFeed.findIndex(
        g => g.user?._id === this.currentStoryGroup.user?._id
      );
      const nextGroup = this.storiesFeed[currentGroupIndex + 1];

      if (nextGroup && nextGroup.user?._id !== App.user._id) {
        this.currentStoryGroup = nextGroup;
        this.currentStoryIndex = 0;
        this.showStory();
      } else {
        this.closeStoryViewer();
      }
    } else {
      this.showStory();
    }
  },

  prevStory() {
    if (this.currentStoryIndex > 0) {
      this.currentStoryIndex--;
      this.showStory();
    }
  },

  closeStoryViewer() {
    clearTimeout(this.storyTimer);
    document.getElementById('story-viewer').style.display = 'none';
    document.getElementById('bottom-nav').style.display = 'flex';
    this.currentStoryGroup = null;
    this.currentStoryIndex = 0;
    this.loadStories();
  },

  async markStoryViewed(storyId) {
    try {
      await App.api(`/api/stories/${storyId}/view`, {
        method: 'POST'
      });
    } catch (err) {
      console.error('Error marking story viewed:', err);
    }
  },

  async postStory(imageData, caption) {
    if (!imageData) {
      UI.showToast('No image to post', 'error');
      return;
    }

    try {
      UI.showLoading();
      await App.api('/api/stories', {
        method: 'POST',
        body: JSON.stringify({
          imageData,
          caption: caption || document.getElementById('snap-caption-input')?.value?.trim() || '',
          filters: [Camera.currentFilter]
        })
      });

      UI.showToast('Story posted! 📖', 'success');
      this.loadStories();
      Camera.closePreview();
    } catch (err) {
      UI.showToast('Failed to post story', 'error');
      console.error(err);
    } finally {
      UI.hideLoading();
    }
  },

  sendStoryReply() {
    const input = document.getElementById('story-reply-input');
    const text = input.value.trim();
    if (!text || !this.currentStoryGroup) return;

    const userId = this.currentStoryGroup.user._id;

    if (App.socket) {
      App.socket.emit('send_message', {
        recipientId: userId,
        content: `📖 Story reply: ${text}`,
        type: 'text'
      });
    }

    input.value = '';
    UI.showToast('Reply sent!', 'success');
  }
};