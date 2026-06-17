const UI = {
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  },

  showLoading() {
    document.getElementById('loading-overlay').style.display = 'flex';
  },

  hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
  },

  // Haptic feedback (if supported)
  vibrate(duration = 10) {
    if (navigator.vibrate) {
      navigator.vibrate(duration);
    }
  },

  // Swipe detection for navigation
  initSwipeNavigation() {
    let startX = 0;
    let startY = 0;
    let isDragging = false;

    const app = document.getElementById('app');

    app.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isDragging = true;
    }, { passive: true });

    app.addEventListener('touchend', (e) => {
      if (!isDragging) return;
      isDragging = false;

      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = endX - startX;
      const diffY = endY - startY;

      // Only horizontal swipes
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 80) {
        if (App.currentScreen === 'camera-screen') {
          if (diffX < 0) {
            // Swipe left → Chat
            App.navigateTo('chat-screen');
          } else {
            // Swipe right → Stories
            App.navigateTo('stories-screen');
          }
        } else if (App.currentScreen === 'chat-screen' && diffX > 0) {
          App.navigateTo('camera-screen');
        } else if (App.currentScreen === 'stories-screen' && diffX < 0) {
          App.navigateTo('camera-screen');
        }
      }
    }, { passive: true });
  },

  // iOS install prompt
  showInstallPrompt() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = window.navigator.standalone;

    if (isIOS && !isStandalone) {
      setTimeout(() => {
        this.showToast('Tip: Tap Share → "Add to Home Screen" to install', 'info');
      }, 5000);
    }
  }
};

// Init swipe and install prompt
document.addEventListener('DOMContentLoaded', () => {
  UI.initSwipeNavigation();
  UI.showInstallPrompt();
});

// Simple keyboard handling - scroll to bottom when input is focused
document.addEventListener('focusin', (e) => {
  if (e.target.matches('input, textarea')) {
    setTimeout(() => {
      const container = document.getElementById('messages-container');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
      // Scroll the input into view
      e.target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 300);
  }
});