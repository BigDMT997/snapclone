// js/chat.js
const Chat = {
  conversations: [],
  currentMessages: [],
  typingTimeout: null,
  replyingTo: null,
  currentChatUserId: null,

  async loadConversations() {
    try {
      const data = await App.api('/api/messages/conversations');
      this.conversations = data;

      // Also load snap feed
      const snapFeed = await App.api('/api/snaps/feed').catch(() => []);
      this.snapFeed = snapFeed;

      this.renderConversations();
    } catch (err) {
      console.error('Error loading conversations:', err);
    }
  },

  renderConversations() {
    const container = document.getElementById('conversations-list');

    // Merge snaps and messages by user
    const conversationMap = new Map();

    // Add message conversations
    this.conversations.forEach(conv => {
      if (conv.user) {
        conversationMap.set(conv.user._id, {
          user: conv.user,
          lastMessage: conv.lastMessage,
          unreadCount: conv.unreadCount,
          lastActivity: new Date(conv.lastMessage?.createdAt || 0)
        });
      }
    });

    // Add snap activity
    if (this.snapFeed) {
      this.snapFeed.forEach(snapConv => {
        if (snapConv.user) {
          const existing = conversationMap.get(snapConv.user._id) || { user: snapConv.user, lastActivity: new Date(0) };
          existing.snapStatus = this.getSnapStatus(snapConv.lastSnap);
          existing.pendingSnapCount = snapConv.pendingCount;
          existing.lastSnapId = snapConv.lastSnap._id;

          const snapTime = new Date(snapConv.lastSnap.createdAt);
          if (snapTime > existing.lastActivity) {
            existing.lastActivity = snapTime;
            existing.lastSnapTime = snapTime;
          }
          conversationMap.set(snapConv.user._id, existing);
        }
      });
    }

    const allConversations = Array.from(conversationMap.values())
      .sort((a, b) => b.lastActivity - a.lastActivity);

    if (!allConversations.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💬</div>
          <h3>No chats yet</h3>
          <p>Add friends and start chatting!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = allConversations.map(conv => {
      const user = conv.user;
      if (!user) return '';

      let preview = '';
      let previewClass = '';
      let snapBadge = '';

      // Show snap status
      if (conv.snapStatus) {
        snapBadge = `<div class="conv-snap-status ${conv.snapStatus.class}">${conv.snapStatus.icon} ${conv.snapStatus.text}</div>`;
        preview = conv.snapStatus.preview;
        if (conv.pendingSnapCount > 0) previewClass = 'unread';
      } else if (conv.lastMessage) {
        const isMine = (conv.lastMessage.sender?._id || conv.lastMessage.sender)?.toString() === App.user._id;
        if (conv.lastMessage.type === 'image') {
          preview = isMine ? 'You sent a photo' : 'Sent a photo';
        } else {
          preview = (isMine ? 'You: ' : '') + (conv.lastMessage.content || '');
        }
        if (conv.unreadCount > 0) previewClass = 'unread';
      }

      const timeStr = conv.lastActivity && conv.lastActivity > new Date(0)
        ? App.formatTime(conv.lastActivity)
        : '';

      return `
        <div class="conversation-item" onclick="Chat.handleConversationClick('${user._id}', '${user.username}', '${user.displayName}', '${user.avatar || ''}', ${conv.pendingSnapCount > 0}, '${conv.lastSnapId || ''}')">
          <div class="conv-avatar">
            ${user.avatar ? `<img src="${user.avatar}" alt="">` : '👻'}
          </div>
          <div class="conv-info">
            <div class="conv-name">${user.displayName || user.username}</div>
            <div class="conv-preview ${previewClass}">${snapBadge}${preview}</div>
          </div>
          <div class="conv-meta">
            <span class="conv-time">${timeStr}</span>
            ${conv.unreadCount > 0 || conv.pendingSnapCount > 0 ? '<div class="conv-badge"></div>' : ''}
          </div>
        </div>
      `;
    }).join('');
  },

  getSnapStatus(snap) {
    if (!snap) return null;
    const isMine = (snap.sender?._id || snap.sender)?.toString() === App.user._id;

    if (isMine) {
      if (snap.opened) {
        return { class: 'opened', icon: '◻', text: 'Opened', preview: 'Opened' };
      } else {
        return { class: 'sent', icon: '▶', text: 'Delivered', preview: 'Delivered' };
      }
    } else {
      if (snap.opened) {
        return { class: 'opened', icon: '◻', text: 'Opened', preview: 'Opened' };
      } else {
        return { class: 'received', icon: '▶', text: 'New Snap', preview: 'Tap to view' };
      }
    }
  },

  handleConversationClick(userId, username, displayName, avatar, hasPendingSnap, snapId) {
    if (hasPendingSnap && snapId) {
      // Open the snap first
      Snaps.openSnap(snapId);
    } else {
      this.openChat(userId, username, displayName, avatar);
    }
  },

  async openChat(userId, username, displayName, avatar) {
    this.currentChatUserId = userId;
    App.currentChatUser = { _id: userId, username, displayName, avatar };

    document.getElementById('chat-username').textContent = displayName || username;
    document.getElementById('chat-avatar').innerHTML = avatar ? `<img src="${avatar}" alt="">` : '👻';

    const isOnline = App.onlineUsers.has(userId);
    const statusEl = document.getElementById('chat-status');
    statusEl.textContent = isOnline ? 'Active now' : '';
    statusEl.className = isOnline ? 'chat-status online' : 'chat-status';

    App.navigateTo('chat-detail-screen');

    await this.loadMessages(userId);

    if (App.socket) {
      App.socket.emit('message_read', { senderId: userId });
    }

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

    container.innerHTML = this.currentMessages.map((msg, index) => {
      const senderId = msg.sender?._id || msg.sender;
      const isMine = senderId?.toString() === App.user._id;
      const savedClass = msg.savedBy?.includes(App.user._id) ? '🔒' : '';

      let content = '';
      if (msg.type === 'image' && msg.mediaData) {
        content = `<img src="${msg.mediaData}" class="message-image" alt="Photo">`;
      } else {
        content = this.escapeHtml(msg.content);
      }

      // Reply preview
      let replyPreview = '';
      if (msg.replyTo) {
        replyPreview = `<div class="reply-preview">↪ ${this.escapeHtml(msg.replyTo.content || 'Photo')}</div>`;
      }

      // Read receipt for sent messages
      let readReceipt = '';
      if (isMine) {
        if (msg.read) {
          readReceipt = '<div class="read-receipt">Read</div>';
        } else {
          readReceipt = '<div class="read-receipt">Delivered</div>';
        }
      }

      return `
        <div class="message-wrapper ${isMine ? 'sent' : 'received'}" data-message-id="${msg._id}" data-index="${index}">
          <div class="message-bubble ${isMine ? 'sent' : 'received'}">
            ${replyPreview}
            ${content}
            <div class="message-time">${App.formatMessageTime(msg.createdAt)}</div>
            ${savedClass ? `<span class="message-saved-indicator">${savedClass}</span>` : ''}
          </div>
          ${readReceipt}
        </div>
      `;
    }).join('');

    // Setup swipe-to-reply
    this.setupSwipeToReply();

    container.scrollTop = container.scrollHeight;
  },

  // FIXED: Swipe right to reply
  setupSwipeToReply() {
    const messages = document.querySelectorAll('.message-wrapper');
    messages.forEach(msgEl => {
      let startX = 0;
      let currentX = 0;
      let isDragging = false;

      msgEl.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isDragging = true;
      }, { passive: true });

      msgEl.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentX = e.touches[0].clientX;
        const diff = currentX - startX;

        if (diff > 0 && diff < 100) {
          msgEl.style.transform = `translateX(${diff}px)`;
          if (diff > 50) {
            msgEl.classList.add('reply-active');
          } else {
            msgEl.classList.remove('reply-active');
          }
        }
      }, { passive: true });

      msgEl.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        const diff = currentX - startX;

        msgEl.style.transition = 'transform 0.2s ease';
        msgEl.style.transform = 'translateX(0)';

        setTimeout(() => {
          msgEl.style.transition = '';
        }, 200);

        if (diff > 50) {
          const messageId = msgEl.dataset.messageId;
          const index = parseInt(msgEl.dataset.index);
          this.startReply(messageId, index);
        }

        msgEl.classList.remove('reply-active');
      });
    });
  },

  startReply(messageId, index) {
    const message = this.currentMessages[index];
    if (!message) return;

    this.replyingTo = message;

    const senderId = message.sender?._id || message.sender;
    const senderName = senderId?.toString() === App.user._id
      ? 'yourself'
      : (App.currentChatUser?.displayName || 'them');

    const previewText = message.type === 'image' ? '📷 Photo' : message.content;

    // Show reply bar above input
    let replyBar = document.getElementById('reply-bar');
    if (!replyBar) {
      replyBar = document.createElement('div');
      replyBar.id = 'reply-bar';
      replyBar.className = 'reply-bar';
      const inputBar = document.querySelector('.chat-input-bar');
      inputBar.parentNode.insertBefore(replyBar, inputBar);
    }

    replyBar.innerHTML = `
      <div class="reply-bar-content">
        <div class="reply-bar-line"></div>
        <div class="reply-bar-info">
          <div class="reply-bar-name">Replying to ${senderName}</div>
          <div class="reply-bar-text">${this.escapeHtml(previewText)}</div>
        </div>
        <button class="reply-bar-cancel" onclick="Chat.cancelReply()">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;
    replyBar.style.display = 'block';

    document.getElementById('message-input').focus();
  },

  cancelReply() {
    this.replyingTo = null;
    const replyBar = document.getElementById('reply-bar');
    if (replyBar) {
      replyBar.style.display = 'none';
    }
  },

  setupChatInput() {
    const input = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-message-btn');
    const micBtn = document.getElementById('chat-mic-btn');

    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);

    newInput.addEventListener('input', () => {
      const hasText = newInput.value.trim().length > 0;
      sendBtn.style.display = hasText ? 'flex' : 'none';
      micBtn.style.display = hasText ? 'none' : 'flex';

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

    // FIXED: Keyboard handling - scroll to bottom when focused
    newInput.addEventListener('focus', () => {
      setTimeout(() => {
        const container = document.getElementById('messages-container');
        container.scrollTop = container.scrollHeight;
      }, 300);
    });

    const newSendBtn = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
    newSendBtn.addEventListener('click', () => this.sendMessage());

    // Camera button in chat - opens gallery for photo
    const cameraBtn = document.getElementById('chat-camera-btn');
    const newCameraBtn = cameraBtn.cloneNode(true);
    cameraBtn.parentNode.replaceChild(newCameraBtn, cameraBtn);
    newCameraBtn.addEventListener('click', () => {
      document.getElementById('chat-media-input').click();
    });

    const mediaInput = document.getElementById('chat-media-input');
    const newMediaInput = mediaInput.cloneNode(true);
    mediaInput.parentNode.replaceChild(newMediaInput, mediaInput);
    newMediaInput.addEventListener('change', (e) => {
      if (e.target.files[0]) {
        this.sendMediaMessage(e.target.files[0]);
      }
    });

    const mediaBtn = document.getElementById('chat-media-btn');
    if (mediaBtn) {
      mediaBtn.onclick = () => newMediaInput.click();
    }
  },

  sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();

    if (!content || !this.currentChatUserId) return;

    const messageData = {
      recipientId: this.currentChatUserId,
      content: content,
      type: 'text'
    };

    if (this.replyingTo) {
      messageData.replyToId = this.replyingTo._id;
    }

    if (App.socket) {
      App.socket.emit('send_message', messageData);
      App.socket.emit('stop_typing', { recipientId: this.currentChatUserId });
    }

    input.value = '';
    document.getElementById('send-message-btn').style.display = 'none';
    document.getElementById('chat-mic-btn').style.display = 'flex';
    this.cancelReply();
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
    const senderId = (message.sender?._id || message.sender)?.toString();

    if (this.currentChatUserId === senderId ||
        this.currentChatUserId === message.recipient?.toString()) {
      this.currentMessages.push(message);
      this.renderMessages();

      if (App.socket && senderId !== App.user._id) {
        App.socket.emit('message_read', { senderId: senderId });
      }
    }

    this.loadConversations();

    if (senderId !== App.user._id && this.currentChatUserId !== senderId) {
      const senderName = message.sender?.displayName || message.sender?.username || 'Someone';
      UI.showToast(`${senderName}: ${message.content}`, 'info');

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
    // Update read receipts
    if (this.currentChatUserId === readerId) {
      this.currentMessages.forEach(msg => {
        if ((msg.sender?._id || msg.sender)?.toString() === App.user._id) {
          msg.read = true;
        }
      });
      this.renderMessages();
    }
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
      statusEl.textContent = isOnline ? 'Active now' : '';
      statusEl.className = isOnline ? 'chat-status online' : 'chat-status';
    }
  },

  messageActions(event, messageId) {
    event.preventDefault();
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
  },

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.getElementById('chat-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      Chat.currentChatUserId = null;
      App.currentChatUser = null;
      Chat.cancelReply();
      App.navigateTo('chat-screen');
      Chat.loadConversations();
    });
  }

  const newChatBtn = document.getElementById('new-chat-btn');
  if (newChatBtn) {
    newChatBtn.addEventListener('click', () => {
      App.navigateTo('friends-screen');
    });
  }
});