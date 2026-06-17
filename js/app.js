const App = {
  apiUrl: '',
  socket: null,
  user: null,
  token: null,
  currentScreen: 'camera-screen',
  capturedImageData: null,
  currentFilter: 'none',
  currentChatUser: null,
  onlineUsers: new Set(),

  async init() {
    // Check for saved token
    this.token = localStorage.getItem('snapclone_token');
    const savedUser = localStorage.getItem('snapclone_user');

    if (this.token && savedUser) {
      this.user = JSON.parse(savedUser);
      try {
        const response = await this.api('/api/auth/me');
        this.user = response;
        localStorage.setItem('snapclone_user', JSON.stringify(this.user));
        this.showApp();
      } catch (err) {
        this.logout();
        this.showAuth();
      }
    } else {
      this.showAuth();
    }

    this.hideSplash();
    this.registerServiceWorker();
  },

  async api(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(this.apiUrl + url, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'API Error');
    }

    return data;
  },

  connectSocket() {
    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io(this.apiUrl || window.location.origin, {
      auth: { token: this.token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    this.socket.on('new_message', (message) => {
      Chat.handleNewMessage(message);
    });

    this.socket.on('message_sent', (message) => {
      Chat.handleMessageSent(message);
    });

    this.socket.on('new_snap', (data) => {
      Snaps.handleNewSnap(data);
    });

    this.socket.on('snap_sent', (data) => {
      UI.showToast('Snap sent!', 'success');
    });

    this.socket.on('snap_was_opened', (data) => {
      UI.showToast('Your snap was opened', 'info');
    });

    this.socket.on('user_typing', (data) => {
      Chat.showTypingIndicator(data.userId);
    });

    this.socket.on('user_stop_typing', (data) => {
      Chat.hideTypingIndicator(data.userId);
    });

    this.socket.on('messages_read', (data) => {
      Chat.handleMessagesRead(data.readerId);
    });

    this.socket.on('user_online', (data) => {
      this.onlineUsers.add(data.userId);
      Chat.updateOnlineStatus(data.userId, true);
    });

    this.socket.on('user_offline', (data) => {
      this.onlineUsers.delete(data.userId);
      Chat.updateOnlineStatus(data.userId, false);
    });

    this.socket.on('screenshot_alert', (data) => {
      UI.showToast('Someone took a screenshot!', 'info');
    });
  },

  showApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    this.connectSocket();
    Camera.init();
    Chat.loadConversations();
    Stories.loadStories();
    Friends.loadFriends();
    this.updateProfile();
    this.setupNavigation();
  },

  showAuth() {
    document.getElementById('auth-screen').style.display = 'block';
    document.getElementById('app').style.display = 'none';
    Auth.init();
  },

  hideSplash() {
    setTimeout(() => {
      const splash = document.getElementById('splash-screen');
      splash.classList.add('fade-out');
      setTimeout(() => splash.style.display = 'none', 500);
    }, 1500);
  },

  setupNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const screen = btn.dataset.screen;
        if (screen) {
          this.navigateTo(screen);
          navBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });

    // Back buttons
    document.querySelectorAll('.back-to-camera').forEach(btn => {
      btn.addEventListener('click', () => this.navigateTo('camera-screen'));
    });

    // Profile button (now on chat tab)
    const chatProfileBtn = document.getElementById('chat-profile-btn');
    if (chatProfileBtn) {
      chatProfileBtn.addEventListener('click', () => {
        this.navigateTo('profile-screen');
      });
    }

    document.getElementById('profile-back-btn').addEventListener('click', () => {
      this.navigateTo('camera-screen');
    });
  },

  navigateTo(screenId) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => {
      s.classList.remove('active');
      s.style.display = 'none';
    });

    const target = document.getElementById(screenId);
    if (target) {
      target.style.display = 'block';
      target.classList.add('active');
      this.currentScreen = screenId;

      if (screenId === 'chat-screen') {
        Chat.loadConversations();
      } else if (screenId === 'stories-screen') {
        Stories.loadStories();
      } else if (screenId === 'friends-screen') {
        Friends.loadFriends();
      }
    }

    const bottomNav = document.getElementById('bottom-nav');
    const hideNavScreens = ['chat-detail-screen', 'story-viewer', 'snap-viewer', 'send-to-screen', 'add-friends-screen'];
    bottomNav.style.display = hideNavScreens.includes(screenId) ? 'none' : 'flex';

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.screen === screenId);
    });
  },

  updateProfile() {
    if (!this.user) return;

    document.getElementById('profile-display-name').textContent = this.user.displayName;
    document.getElementById('profile-username').textContent = '@' + this.user.username;
    document.getElementById('snap-score-value').textContent = this.user.snapScore || 0;
    document.getElementById('friends-count-value').textContent = this.user.friends?.length || 0;

    if (this.user.avatar) {
      const avatarElements = document.querySelectorAll('#chat-user-avatar, #profile-avatar-large');
      avatarElements.forEach(el => {
        if (this.user.avatar.startsWith('data:')) {
          el.innerHTML = `<img src="${this.user.avatar}" alt="avatar">`;
        }
      });
    }
  },

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('snapclone_token');
    localStorage.removeItem('snapclone_user');
    if (this.socket) {
      this.socket.disconnect();
    }
    Camera.stop();
    this.showAuth();
  },

  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('SW registered:', registration.scope);
      } catch (err) {
        console.error('SW registration failed:', err);
      }
    }
  },

  formatTime(date) {
    const now = new Date();
    const d = new Date(date);
    const diff = now - d;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return d.toLocaleDateString();
  },

  formatMessageTime(date) {
    const d = new Date(date);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
};

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());