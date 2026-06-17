// js/camera.js
const Camera = {
  stream: null,
  facingMode: 'user',
  flashOn: false,
  currentFilter: 'none',
  isRecording: false,

  async init() {
    this.setupEventListeners();
    await this.startCamera();
  },

  setupEventListeners() {
    const captureBtn = document.getElementById('capture-btn');
    captureBtn.addEventListener('click', () => this.capture());

    let pressTimer;
    captureBtn.addEventListener('touchstart', (e) => {
      pressTimer = setTimeout(() => {
        this.startRecording();
      }, 500);
    });

    captureBtn.addEventListener('touchend', () => {
      clearTimeout(pressTimer);
      if (this.isRecording) {
        this.stopRecording();
      }
    });

    document.getElementById('camera-flip-btn').addEventListener('click', () => {
      this.flipCamera();
    });

    document.getElementById('flash-btn').addEventListener('click', () => {
      this.toggleFlash();
    });

    document.getElementById('filters-toggle-btn').addEventListener('click', () => {
      const bar = document.getElementById('filters-bar');
      bar.style.display = bar.style.display === 'none' ? 'block' : 'none';
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.filter;
        this.applyFilter();
      });
    });

    document.getElementById('gallery-btn').addEventListener('click', () => {
      document.getElementById('gallery-input').click();
    });

    document.getElementById('gallery-input').addEventListener('change', (e) => {
      if (e.target.files[0]) {
        this.handleGalleryImage(e.target.files[0]);
      }
    });

    document.getElementById('preview-close').addEventListener('click', () => {
      this.closePreview();
    });

    document.getElementById('text-tool').addEventListener('click', () => {
      this.toggleTextOverlay();
    });

    document.getElementById('snap-caption-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addCaption();
      }
    });

    document.getElementById('snap-caption-input').addEventListener('blur', () => {
      this.addCaption();
    });

    document.getElementById('send-snap-btn').addEventListener('click', () => {
      App.navigateTo('send-to-screen');
      Snaps.loadSendToList();
    });

    document.getElementById('save-snap-btn').addEventListener('click', () => {
      this.saveToDevice();
    });

    document.getElementById('story-btn').addEventListener('click', () => {
      if (App.capturedImageData) {
        const caption = document.getElementById('snap-caption-input').value.trim();
        Stories.postStory(App.capturedImageData, caption);
      } else {
        UI.showToast('No photo to post', 'error');
      }
    });
  },

  async startCamera() {
    try {
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
      }

      const constraints = {
        video: {
          facingMode: this.facingMode,
          width: { ideal: 1080 },
          height: { ideal: 1920 }
        },
        audio: false
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      const video = document.getElementById('camera-preview');
      video.srcObject = this.stream;

      // Mirror preview only for front camera (so it looks like a mirror)
      if (this.facingMode === 'user') {
        video.classList.add('front-camera');
      } else {
        video.classList.remove('front-camera');
      }
    } catch (err) {
      console.error('Camera error:', err);
      UI.showToast('Camera access denied', 'error');
    }
  },

  async flipCamera() {
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    await this.startCamera();
  },

  toggleFlash() {
    this.flashOn = !this.flashOn;
    const flashBtn = document.getElementById('flash-btn');
    flashBtn.style.color = this.flashOn ? 'var(--snap-yellow)' : 'white';

    if (this.stream) {
      const track = this.stream.getVideoTracks()[0];
      if (track.getCapabilities && track.getCapabilities().torch) {
        track.applyConstraints({ advanced: [{ torch: this.flashOn }] });
      }
    }
  },

  applyFilter() {
    const video = document.getElementById('camera-preview');
    const filterMap = {
      'none': 'none',
      'grayscale': 'grayscale(100%)',
      'sepia': 'sepia(100%)',
      'saturate': 'saturate(200%)',
      'contrast': 'contrast(150%)',
      'brightness': 'brightness(130%)',
      'hue-rotate': 'hue-rotate(90deg)',
      'invert': 'invert(100%)',
      'blur': 'blur(2px)',
      'vintage': 'sepia(50%) contrast(120%) brightness(90%)'
    };

    video.style.filter = filterMap[this.currentFilter] || 'none';
  },

  capture() {
    const video = document.getElementById('camera-preview');
    const canvas = document.getElementById('camera-canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const filterMap = {
      'none': 'none',
      'grayscale': 'grayscale(100%)',
      'sepia': 'sepia(100%)',
      'saturate': 'saturate(200%)',
      'contrast': 'contrast(150%)',
      'brightness': 'brightness(130%)',
      'hue-rotate': 'hue-rotate(90deg)',
      'invert': 'invert(100%)',
      'blur': 'blur(2px)',
      'vintage': 'sepia(50%) contrast(120%) brightness(90%)'
    };

    ctx.filter = filterMap[this.currentFilter] || 'none';

    // Draw the image normally - mirror for front camera so it matches preview
    if (this.facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';

    App.capturedImageData = canvas.toDataURL('image/jpeg', 0.8);
    this.showPreview(App.capturedImageData);
  },

  showPreview(imageData) {
    const preview = document.getElementById('photo-preview');
    const img = document.getElementById('captured-image');
    img.src = imageData;
    preview.style.display = 'block';
    document.getElementById('bottom-nav').style.display = 'none';
  },

  closePreview() {
    document.getElementById('photo-preview').style.display = 'none';
    document.getElementById('text-overlay-input').style.display = 'none';
    document.getElementById('caption-display').style.display = 'none';
    document.getElementById('snap-caption-input').value = '';
    document.getElementById('bottom-nav').style.display = 'flex';
    App.capturedImageData = null;
  },

  toggleTextOverlay() {
    const input = document.getElementById('text-overlay-input');
    if (input.style.display === 'none') {
      input.style.display = 'block';
      document.getElementById('snap-caption-input').focus();
    } else {
      this.addCaption();
    }
  },

  addCaption() {
    const input = document.getElementById('snap-caption-input');
    const text = input.value.trim();
    const overlay = document.getElementById('text-overlay-input');
    const display = document.getElementById('caption-display');
    const captionText = document.getElementById('caption-text');

    overlay.style.display = 'none';

    if (text) {
      captionText.textContent = text;
      display.style.display = 'block';
    } else {
      display.style.display = 'none';
    }
  },

  handleGalleryImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      App.capturedImageData = e.target.result;
      this.showPreview(App.capturedImageData);
    };
    reader.readAsDataURL(file);
  },

  saveToDevice() {
    if (!App.capturedImageData) return;

    const link = document.createElement('a');
    link.download = `snapclone_${Date.now()}.jpg`;
    link.href = App.capturedImageData;
    link.click();
    UI.showToast('Saved to device', 'success');
  },

  startRecording() {
    this.isRecording = true;
    document.getElementById('capture-btn').classList.add('recording');
  },

  stopRecording() {
    this.isRecording = false;
    document.getElementById('capture-btn').classList.remove('recording');
    this.capture();
  },

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }
};