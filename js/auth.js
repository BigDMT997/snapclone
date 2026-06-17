const Auth = {
  init() {
    this.setupEventListeners();
  },

  setupEventListeners() {
    // Toggle forms
    document.getElementById('show-register').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('login-form').style.display = 'none';
      document.getElementById('register-form').style.display = 'block';
      this.clearError();
    });

    document.getElementById('show-login').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('register-form').style.display = 'none';
      document.getElementById('login-form').style.display = 'block';
      this.clearError();
    });

    // Login
    document.getElementById('login-btn').addEventListener('click', () => this.login());
    document.getElementById('login-password').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.login();
    });

    // Register
    document.getElementById('register-btn').addEventListener('click', () => this.register());
    document.getElementById('reg-confirm-password').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.register();
    });

    // Username availability check
    let usernameTimeout;
    document.getElementById('reg-username').addEventListener('input', (e) => {
      clearTimeout(usernameTimeout);
      const username = e.target.value.trim();
      const status = document.getElementById('username-status');

      if (username.length < 3) {
        status.textContent = '';
        status.className = 'input-status';
        return;
      }

      status.textContent = '...';
      status.className = 'input-status';

      usernameTimeout = setTimeout(async () => {
        try {
          const result = await fetch(`/api/auth/check-username/${username}`);
          const data = await result.json();
          if (data.available) {
            status.textContent = '✓ Available';
            status.className = 'input-status available';
          } else {
            status.textContent = '✗ Taken';
            status.className = 'input-status taken';
          }
        } catch (err) {
          status.textContent = '';
        }
      }, 500);
    });
  },

  async login() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (!username || !password) {
      this.showError('Please fill in all fields');
      return;
    }

    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.textContent = 'Logging in...';

    try {
      const data = await App.api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      App.token = data.token;
      App.user = data.user;
      localStorage.setItem('snapclone_token', data.token);
      localStorage.setItem('snapclone_user', JSON.stringify(data.user));
      App.showApp();
    } catch (err) {
      this.showError(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Log In';
    }
  },

  async register() {
    const displayName = document.getElementById('reg-displayname').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;

    if (!displayName || !username || !email || !password) {
      this.showError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      this.showError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      this.showError('Password must be at least 6 characters');
      return;
    }

    if (username.length < 3) {
      this.showError('Username must be at least 3 characters');
      return;
    }

    const btn = document.getElementById('register-btn');
    btn.disabled = true;
    btn.textContent = 'Creating account...';

    try {
      const data = await App.api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ displayName, username, email, password })
      });

      App.token = data.token;
      App.user = data.user;
      localStorage.setItem('snapclone_token', data.token);
      localStorage.setItem('snapclone_user', JSON.stringify(data.user));
      App.showApp();
      UI.showToast('Welcome to SnapClone! 👻', 'success');
    } catch (err) {
      this.showError(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign Up';
    }
  },

  showError(message) {
    const errorEl = document.getElementById('auth-error');
    errorEl.textContent = message;
    errorEl.classList.add('show');
    errorEl.style.display = 'block';
  },

  clearError() {
    const errorEl = document.getElementById('auth-error');
    errorEl.textContent = '';
    errorEl.classList.remove('show');
    errorEl.style.display = 'none';
  }
};