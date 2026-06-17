const Chat = {
  conversations: [],
  currentMessages: [],
  typingTimeout: null,

  async loadConversations() {
    try {
      const data = await App.api('/api/messages/conversations');
      this.conversations = data;
      this.renderConversations();
    } catch (err) {
      console.error('Error loading conversations:', err);
    }
  },

  renderConversations() {
    const container = document.getElementById('conversations-list');

    if (!this.conversations.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💬</div>
          <h3>No chats yet</h3>
          <p>Add friends and start chatting!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.conversations.map(conv => {
      const user = conv.user;
      if (!user) return '';

      const isOnline = App.onlineUsers.has(user._id);
      let preview = '';
      let previewClass = '';

      if (conv.lastMessage) {
        const isMine = conv.lastMessage.sender?.toString() === App.user._id;
        if (conv.lastMessage.type === 'image') {
          preview = isMine ? 'You sent a photo' : 'Sent a photo';
        } else {
          preview = conv.lastMessage.content || '';
        }
        if (conv.unreadCount > 0) previewClass = 'unread';
      }

      return `
        <div class="conversation-item" onclick="Chat.openChat('${user._id}', '${user.username}', '${user.displayName}', '${user.avatar || ''}')">
          <div class="conv-avatar">
            ${user.avatar ? `<img src="${user.avatar}" alt="">` : '👻'}
          </div>
          <div class="conv-info">
            <div class="conv-name">${user.displayName || user.username}</div>
            <div class="conv-preview ${previewClass}">${preview}</div>
          </div>
          <div class="conv-meta">
            <span class="conv-time">${conv.lastMessage ? App.formatTime(conv.lastMessage.createdAt) : ''}</span>
            ${conv.unreadCount > 0 ? '<div class="conv-badge"></div>' : ''}
          </div>
        </div>
      `;
    }).join('');
  },

  async openChat(userId, username, displayName, avatar) {
    this.currentChatUserId = userId;
    App.currentChatUser = { _id: userId, username, displayName, avatar };

    // Update header
    document.getElementById('chat-username').textContent = displayName || username;
    document.getElementById('chat-avatar').innerHTML = avatar ? `<img src="${avatar}" alt="">` : '👻';

    const isOnline = App.onlineUsers.has(userId);
    const statusEl = document.getElementById('chat-status');
    statusEl.textContent = isOnline ? 'Online' : '';
    statusEl.className = isOnline ? 'chat-status online' : 'chat-status';

    // Show screen
    App.navigateTo('chat-detail-screen');

    // Load messages
    await this.loadMessages(userId);

    // Mark as read
    if (App.socket) {
      App.socket.emit('message_read', { senderId: userId });
    }

    // Setup input
    this.setupChatInput();
  },

  async loadMessages(userId) {
    try {
      const messages = await App.api(`/api/messages/${userId}`);
      this.currentMessages = messages;
      this.renderMessages();
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  },

  renderMessages() {
    const container = document.getElementById('messages-container');

    if (!this.currentMessages.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">👋</div>
          <h3>Say hello!</h3>
          <p>Send a message to start the conversation</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.currentMessages.map(msg => {
      const isMine = msg.sender?._id === App.user._id || msg.sender === App.user._id;
      const savedClass = msg.savedBy?.includes(App.user._id) ? '🔒' : '';

      let content = '';
      if (msg.type === 'image' && msg.mediaData) {
        content = `<img src="${msg.mediaData}" class="message-image" alt="Photo">`;
      } else {
        content = msg.content;
      }

      return `
        <div class="message-bubble ${isMine ? 'sent' : 'received'}"
             oncontextmenu="Chat.messageActions(event, '${msg._id}')"
             data-message-id="${msg._id}">
          ${content}
          <div class="message-time">${App.formatMessageTime(msg.createdAt)}</div>
          ${savedClass ? `<span class="message-saved-indicator">${savedClass}</span>` : ''}
        </div>
      `;
    }).join('');

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  },

  setupChatInput() {
    const input = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-message-btn');
    const micBtn = document.getElementById('chat-mic-btn');

    // Remove old listeners by cloning
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);

    newInput.addEventListener('input', () => {
      const hasText = newInput.value.trim().length > 0;
      sendBtn.style.display = hasText ? 'flex' : 'none';
      micBtn.style.display = hasText ? 'none' : 'flex';

      // Typing indicator
      if (App.socket && this.currentChatUserId) {
        App.socket.emit('typing', { recipientId: this.currentChatUserId });
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
          App.socket.emit('stop_typing', { recipientId: this.currentChatUserId });
        }, 2000);
      }
    });

    newInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendMessage();
      }
    });

    // Send button
    const newSendBtn = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
    newSendBtn.addEventListener('click', () => this.sendMessage());

    // Camera button in chat
    const cameraBtn = document.getElementById('chat-camera-btn');
    const newCameraBtn = cameraBtn.cloneNode(true);
    cameraBtn.parentNode.replaceChild(newCameraBtn, cameraBtn);
    newCameraBtn.addEventListener('click', () => {
      document.getElementById('chat-media-input').click();
    });

    // Media input
    const mediaInput = document.getElementById('chat-media-input');
    const newMediaInput = mediaInput.cloneNode(true);
    mediaInput.parentNode.replaceChild(newMediaInput, mediaInput);
    newMediaInput.addEventListener('change', (e) => {
      if (e.target.files[0]) {
        this.sendMediaMessage(e.target.files[0]);
      }
    });
  },

  sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();

    if (!content || !this.currentChatUserId) return;

    if (App.socket) {
      App.socket.emit('send_message', {
        recipientId: this.currentChatUserId,
        content: content,
        type: 'text'
      });

      App.socket.emit('stop_typing', { recipientId: this.currentChatUserId });
    }

    input.value = '';
    document.getElementById('send-message-btn').style.display = 'none';
    document.getElementById('chat-mic-btn').style.display = 'flex';
  },

  async sendMediaMessage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (App.socket) {
        App.socket.emit('send_message', {
          recipientId: this.currentChatUserId,
          content: '📷 Photo',
          type: 'image',
          mediaData: e.target.result
        });
      }
    };
    reader.readAsDataURL(file);
  },

  handleNewMessage(message) {
    const senderId = message.sender?._id || message.sender;

    // If we're in the chat with this user, add message
    if (this.currentChatUserId === senderId ||
        this.currentChatUserId === message.recipient) {
      this.currentMessages.push(message);
      this.renderMessages();

      // Mark as read
      if (App.socket && senderId !== App.user._id) {
        App.socket.emit('message_read', { senderId: senderId });
      }
    }

    // Update conversations list
    this.loadConversations();

    // Show notification if not in chat
    if (senderId !== App.user._id && this.currentChatUserId !== senderId) {
      const senderName = message.sender?.displayName || message.sender?.username || 'Someone';
      UI.showToast(`${senderName}: ${message.content}`, 'info');

      // Update badge
      const badge = document.getElementById('chat-badge');
      if (badge) {
        badge.style.display = 'flex';
        const count = parseInt(badge.textContent || '0') + 1;
        badge.textContent = count;
      }
    }
  },

  handleMessageSent(message) {
    if (this.currentChatUserId) {
      this.currentMessages.push(message);
      this.renderMessages();
    }
    this.loadConversations();
  },

  handleMessagesRead(readerId) {
    // Could update read receipts UI here
  },

  showTypingIndicator(userId) {
    if (this.currentChatUserId === userId) {
      document.getElementById('typing-indicator').style.display = 'block';
      const container = document.getElementById('messages-container');
      container.scrollTop = container.scrollHeight;
    }
  },

  hideTypingIndicator(userId) {
    if (this.currentChatUserId === userId) {
      document.getElementById('typing-indicator').style.display = 'none';
    }
  },

  updateOnlineStatus(userId, isOnline) {
    if (this.currentChatUserId === userId) {
      const statusEl = document.getElementById('chat-status');
      statusEl.textContent = isOnline ? 'Online' : '';
      statusEl.className = isOnline ? 'chat-status online' : 'chat-status';
    }
  },

  messageActions(event, messageId) {
    event.preventDefault();
    // Simple save toggle
    this.toggleSaveMessage(messageId);
  },

  async toggleSaveMessage(messageId) {
    try {
      await App.api(`/api/messages/${messageId}/save`, {
        method: 'PUT'
      });
      UI.showToast('Message saved', 'success');
      if (this.currentChatUserId) {
        await this.loadMessages(this.currentChatUserId);
      }
    } catch (err) {
      console.error('Error saving message:', err);
    }
  }
};

// Back button handler
document.getElementById('chat-back-btn')?.addEventListener('click', () => {
  Chat.currentChatUserId = null;
  App.currentChatUser = null;
  App.navigateTo('chat-screen');
  Chat.loadConversations();
});

// New chat button
document.getElementById('new-chat-btn')?.addEventListener('click', () => {
  App.navigateTo('friends-screen');
});