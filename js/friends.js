const Friends = {
  friendsList: [],
  friendRequests: [],
  searchTimeout: null,

  async loadFriends() {
    try {
      const data = await App.api('/api/users/friends');
      this.friendsList = data.friends || [];
      this.friendRequests = data.friendRequests || [];
      this.renderFriends();
    } catch (err) {
      console.error('Error loading friends:', err);
    }
  },

  renderFriends() {
    // Friend requests
    const requestsSection = document.getElementById('friend-requests-section');
    const requestsList = document.getElementById('friend-requests-list');

    if (this.friendRequests.length > 0) {
      requestsSection.style.display = 'block';
      requestsList.innerHTML = this.friendRequests.map(req => {
        const user = req.from;
        if (!user) return '';
        return `
          <div class="friend-item">
            <div class="friend-avatar">
              ${user.avatar ? `<img src="${user.avatar}" alt="">` : '👻'}
            </div>
            <div class="friend-info">
              <div class="friend-name">${user.displayName || user.username}</div>
              <div class="friend-username">@${user.username}</div>
            </div>
            <button class="friend-action-btn accept" onclick="Friends.acceptRequest('${user._id}')">Accept</button>
            <button class="friend-action-btn decline" onclick="Friends.declineRequest('${user._id}')">✕</button>
          </div>
        `;
      }).join('');
    } else {
      requestsSection.style.display = 'none';
    }

    // Friends list
    const list = document.getElementById('friends-list');
    if (!this.friendsList.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">👥</div>
          <h3>No friends yet</h3>
          <p>Search for people to add as friends</p>
        </div>
      `;
      return;
    }

    list.innerHTML = this.friendsList.map(friend => `
      <div class="friend-item" onclick="Chat.openChat('${friend._id}', '${friend.username}', '${friend.displayName}', '${friend.avatar || ''}')">
        <div class="friend-avatar">
          ${friend.avatar ? `<img src="${friend.avatar}" alt="">` : '👻'}
        </div>
        <div class="friend-info">
          <div class="friend-name">${friend.displayName || friend.username}</div>
          <div class="friend-username">@${friend.username}</div>
        </div>
        <span class="conv-preview" style="font-size: 12px;">
          🏆 ${friend.snapScore || 0}
        </span>
      </div>
    `).join('');
  },

  async acceptRequest(userId) {
    try {
      await App.api(`/api/users/accept-friend/${userId}`, { method: 'POST' });
      UI.showToast('Friend added! 🎉', 'success');
      this.loadFriends();
    } catch (err) {
      UI.showToast(err.message, 'error');
    }
  },

  async declineRequest(userId) {
    try {
      await App.api(`/api/users/decline-friend/${userId}`, { method: 'POST' });
      UI.showToast('Request declined', 'info');
      this.loadFriends();
    } catch (err) {
      UI.showToast(err.message, 'error');
    }
  },

  async searchUsers(query) {
    if (!query || query.length < 2) {
      document.getElementById('search-results').innerHTML = '';
      return;
    }

    try {
      const users = await App.api(`/api/users/search?q=${encodeURIComponent(query)}`);
      this.renderSearchResults(users);
    } catch (err) {
      console.error('Search error:', err);
    }
  },

  renderSearchResults(users) {
    const container = document.getElementById('search-results');

    if (!users.length) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No users found</p>
        </div>
      `;
      return;
    }

    const friendIds = this.friendsList.map(f => f._id);
    const sentRequestIds = App.user.sentFriendRequests || [];

    container.innerHTML = users.map(user => {
      const isFriend = friendIds.includes(user._id);
      const requestSent = sentRequestIds.includes(user._id);

      let actionBtn = '';
      if (isFriend) {
        actionBtn = `<button class="friend-action-btn added">✓ Friends</button>`;
      } else if (requestSent) {
        actionBtn = `<button class="friend-action-btn pending">Pending</button>`;
      } else {
        actionBtn = `<button class="friend-action-btn add" onclick="Friends.sendRequest('${user._id}', this)">+ Add</button>`;
      }

      return `
        <div class="friend-item">
          <div class="friend-avatar">
            ${user.avatar ? `<img src="${user.avatar}" alt="">` : '👻'}
          </div>
          <div class="friend-info">
            <div class="friend-name">${user.displayName || user.username}</div>
            <div class="friend-username">@${user.username}</div>
          </div>
          ${actionBtn}
        </div>
      `;
    }).join('');
  },

  async sendRequest(userId, btn) {
    try {
      const result = await App.api(`/api/users/friend-request/${userId}`, {
        method: 'POST'
      });

      if (result.status === 'accepted') {
        btn.textContent = '✓ Friends';
        btn.className = 'friend-action-btn added';
        UI.showToast('Friend added! 🎉', 'success');
        this.loadFriends();
      } else {
        btn.textContent = 'Pending';
        btn.className = 'friend-action-btn pending';
        UI.showToast('Friend request sent!', 'success');
      }
    } catch (err) {
      UI.showToast(err.message, 'error');
    }
  },

  async removeFriend(userId) {
    if (!confirm('Remove this friend?')) return;

    try {
      await App.api(`/api/users/friend/${userId}`, { method: 'DELETE' });
      UI.showToast('Friend removed', 'info');
      this.loadFriends();
    } catch (err) {
      UI.showToast(err.message, 'error');
    }
  }
};

// Event listeners for friends screens
document.addEventListener('DOMContentLoaded', () => {
  // View friends
  document.getElementById('view-friends-btn')?.addEventListener('click', () => {
    App.navigateTo('friends-screen');
    Friends.loadFriends();
  });

  document.getElementById('friends-back-btn')?.addEventListener('click', () => {
    App.navigateTo('profile-screen');
  });

  // Add friends
  document.getElementById('add-friends-btn')?.addEventListener('click', () => {
    App.navigateTo('add-friends-screen');
  });

  document.getElementById('add-friends-back-btn')?.addEventListener('click', () => {
    App.navigateTo('friends-screen');
  });

  // Search input
  document.getElementById('add-friend-search')?.addEventListener('input', (e) => {
    clearTimeout(Friends.searchTimeout);
    Friends.searchTimeout = setTimeout(() => {
      Friends.searchUsers(e.target.value.trim());
    }, 300);
  });

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to log out?')) {
      App.logout();
    }
  });

  // Edit display name
  document.getElementById('edit-display-name-btn')?.addEventListener('click', async () => {
    const newName = prompt('Enter new display name:', App.user.displayName);
    if (newName && newName.trim()) {
      try {
        const updated = await App.api('/api/auth/profile', {
          method: 'PUT',
          body: JSON.stringify({ displayName: newName.trim() })
        });
        App.user.displayName = updated.displayName;
        localStorage.setItem('snapclone_user', JSON.stringify(App.user));
        App.updateProfile();
        UI.showToast('Display name updated!', 'success');
      } catch (err) {
        UI.showToast(err.message, 'error');
      }
    }
  });

  // Change avatar
  document.getElementById('change-avatar-btn')?.addEventListener('click', () => {
    document.getElementById('avatar-input').click();
  });

  document.getElementById('avatar-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const updated = await App.api('/api/auth/profile', {
          method: 'PUT',
          body: JSON.stringify({ avatar: ev.target.result })
        });
        App.user.avatar = updated.avatar;
        localStorage.setItem('snapclone_user', JSON.stringify(App.user));
        App.updateProfile();
        UI.showToast('Avatar updated!', 'success');
      } catch (err) {
        UI.showToast(err.message, 'error');
      }
    };
    reader.readAsDataURL(file);
  });

  // Settings
  document.getElementById('settings-btn')?.addEventListener('click', () => {
    UI.showToast('Settings coming soon!', 'info');
  });
});