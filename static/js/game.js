// Socket.io removed as it was unused and causing issues

class Game {
    constructor() {
        this.audio = new Audio();
        this.isPlaying = false;
        this.score = 0;
        this.combo = 0;
        this.notes = [];
        this.activeNotes = [];
        this.startTime = 0;

        // Horizontal settings
        this.travelTime = 3000;
        this.hitWindow = 200; // Increased from 150ms for more forgiveness
        this.targetX = 150; // Updated to match CSS

        // Auto-calibration
        this.offsetHistory = [];
        this.calibrationOffset = 0;
        this.maxHistory = 10;

        this.notesLayer = document.getElementById('notes-layer');
        this.feedbackLayer = document.getElementById('feedback-layer');
        this.scoreEl = document.getElementById('score');
        this.comboEl = document.getElementById('combo');
        this.accuracyEl = document.getElementById('accuracy');
        this.progressBar = document.getElementById('progress-bar');
        this.songTitleEl = document.getElementById('song-title');

        this.totalNotes = 0;
        this.hitNotes = 0;
        this.missedNotes = 0;

        // Health System
        this.maxHealth = 100;
        this.currentHealth = 100;
        this.healthBar = document.getElementById('health-bar');

        this.bindEvents();

        if (typeof SONG_DATA !== 'undefined' && SONG_DATA) {
            this.initGame(SONG_DATA);
        } else {
            console.error("SONG_DATA is missing or invalid.");
        }
    }

    bindEvents() {
        document.addEventListener('keydown', (e) => this.handleInput(e));
        this.setupVolumeControl();
    }

    // ... (Volume Control methods remain same) ...

    setupVolumeControl() {
        const volumeSlider = document.getElementById('volume-slider');
        const volumeValue = document.getElementById('volume-value');
        const pauseVolumeSlider = document.getElementById('pause-volume-slider');
        const pauseVolumeValue = document.getElementById('pause-volume-value');

        // Load saved volume or default to 70%
        const savedVolume = localStorage.getItem('gameVolume') || 70;
        this.audio.volume = savedVolume / 100;

        // Set both sliders
        if (volumeSlider) volumeSlider.value = savedVolume;
        if (volumeValue) volumeValue.innerText = `${savedVolume}%`;
        if (pauseVolumeSlider) pauseVolumeSlider.value = savedVolume;
        if (pauseVolumeValue) pauseVolumeValue.innerText = `${savedVolume}%`;

        // Game volume slider
        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                const volume = e.target.value;
                this.updateVolume(volume);
            });
        }

        // Pause menu volume slider
        if (pauseVolumeSlider) {
            pauseVolumeSlider.addEventListener('input', (e) => {
                const volume = e.target.value;
                this.updateVolume(volume);
            });
        }

        // Resume button
        const resumeBtn = document.getElementById('resume-btn');
        if (resumeBtn) {
            resumeBtn.addEventListener('click', () => this.togglePause());
        }

        // Top Pause Button
        const pauseBtnTop = document.getElementById('pause-btn-top');
        if (pauseBtnTop) {
            pauseBtnTop.addEventListener('click', () => this.togglePause());
        }
    }

    updateVolume(volume) {
        this.audio.volume = volume / 100;
        localStorage.setItem('gameVolume', volume);

        // Update all volume displays
        const volumeValue = document.getElementById('volume-value');
        const pauseVolumeValue = document.getElementById('pause-volume-value');
        const volumeSlider = document.getElementById('volume-slider');
        const pauseVolumeSlider = document.getElementById('pause-volume-slider');

        if (volumeValue) volumeValue.innerText = `${volume}%`;
        if (pauseVolumeValue) pauseVolumeValue.innerText = `${volume}%`;
        if (volumeSlider) volumeSlider.value = volume;
        if (pauseVolumeSlider) pauseVolumeSlider.value = volume;
    }

    togglePause() {
        const pauseMenu = document.getElementById('pause-menu');
        if (!pauseMenu) return;

        if (pauseMenu.classList.contains('hidden')) {
            // Pause
            this.audio.pause();
            pauseMenu.classList.remove('hidden');
        } else {
            // Resume
            this.audio.play();
            pauseMenu.classList.add('hidden');
            this.loop();
        }
    }

    initGame(data) {
        if (this.songTitleEl) this.songTitleEl.innerText = data.title;

        // Set background image
        const bgEl = document.getElementById('game-background');
        if (bgEl && data.thumbnail) {
            bgEl.style.backgroundImage = `url(${data.thumbnail})`;
        }

        this.score = 0;
        this.combo = 0;
        this.hitNotes = 0;
        this.missedNotes = 0;
        this.currentHealth = 100;
        this.updateHealth(0);

        this.totalNotes = data.beat_map.length; // Fallback if array
        if (data.beat_map && data.beat_map.notes) this.totalNotes = data.beat_map.notes.length;

        this.updateUI();

        const videoId = window.location.pathname.split('/').pop();
        this.audio.src = `/static/songs/${videoId}.mp3`;
        this.audio.load();

        let beatMapNotes = [];
        if (Array.isArray(data.beat_map)) {
            beatMapNotes = data.beat_map;
        } else if (data.beat_map && data.beat_map.notes) {
            beatMapNotes = data.beat_map.notes;
        }

        this.notes = beatMapNotes.map(n => ({
            ...n,
            time: n.time * 1000,
            hit: false,
            element: null
        }));

        const startDelay = 1500; // 1.5 seconds for countdown
        const countdownEl = document.getElementById('countdown-overlay');

        if (countdownEl) {
            countdownEl.classList.remove('hidden');

            let count = 3;
            countdownEl.innerText = count;

            // Interval = Total Time / Steps = 1500 / 3 = 500ms
            const intervalTime = startDelay / count;

            const countdownInterval = setInterval(() => {
                count--;
                if (count > 0) {
                    countdownEl.innerText = count;
                } else {
                    clearInterval(countdownInterval);
                    countdownEl.remove();

                    this.startPlayback();
                }
            }, intervalTime);
        } else {
            console.warn("Countdown element missing, starting immediately");
            this.startPlayback();
        }
    }

    startPlayback() {
        this.audio.play().catch(e => console.error("Audio play failed:", e));
        this.startTime = performance.now();
        this.isPlaying = true;
        this.loop();
    }

    loop() {
        if (!this.isPlaying) return;

        const rawSyncTime = this.audio.currentTime * 1000;
        const syncTime = rawSyncTime - this.calibrationOffset;

        if (this.audio.duration) {
            const progress = (this.audio.currentTime / this.audio.duration) * 100;
            if (this.progressBar) this.progressBar.style.width = `${progress}%`;
        }

        const spawnWindow = syncTime + this.travelTime;

        this.notes.forEach(note => {
            if (!note.element && !note.hit && note.time <= spawnWindow && note.time > syncTime - 200) {
                this.createNoteElement(note);
            }
        });

        this.activeNotes.forEach((note) => {
            if (note.hit) return;

            const timeUntilHit = note.time - syncTime;
            const trackWidth = document.querySelector('.track-container').offsetWidth;
            const startX = trackWidth;
            const endX = this.targetX;

            const progress = 1 - (timeUntilHit / this.travelTime);
            const currentX = startX - (startX - endX) * progress;

            if (note.element) {
                note.element.style.left = `${currentX}px`;

                if (timeUntilHit < -this.hitWindow) {
                    this.miss(note);
                }

                if (currentX < -50) {
                    note.element.remove();
                    note.element = null;
                }
            }
        });

        this.activeNotes = this.activeNotes.filter(n => n.element !== null || (n.hit && n.element));

        if (!this.audio.paused) {
            requestAnimationFrame(() => this.loop());
        } else if (this.audio.ended) {
            this.endGame();
        }
    }

    createNoteElement(note) {
        const el = document.createElement('div');
        el.className = 'note';
        // Display '␣' for spaces, otherwise the char
        el.innerText = (note.char === ' ') ? '␣' : note.char;
        this.notesLayer.appendChild(el);
        note.element = el;
        this.activeNotes.push(note);
    }

    handleInput(e) {
        // ESC key for pause menu
        if (e.key === 'Escape') {
            e.preventDefault();
            this.togglePause();
            return;
        }

        // Arrow keys for volume control
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            const volumeSlider = document.getElementById('volume-slider');
            const volumeValue = document.getElementById('volume-value');
            if (!volumeSlider) return;

            let currentVolume = parseInt(volumeSlider.value);
            currentVolume += (e.key === 'ArrowRight' ? 5 : -5);
            currentVolume = Math.max(0, Math.min(100, currentVolume));

            volumeSlider.value = currentVolume;
            this.audio.volume = currentVolume / 100;
            if (volumeValue) volumeValue.innerText = `${currentVolume}%`;
            localStorage.setItem('gameVolume', currentVolume);
            return;
        }

        if (!this.isPlaying) return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        const key = e.key;
        const sortedNotes = this.activeNotes.filter(n => !n.hit).sort((a, b) => a.time - b.time);

        // False Input Check: No notes at all?
        if (sortedNotes.length === 0) {
            this.mistake();
            return;
        }

        const targetNote = sortedNotes[0];
        const rawSyncTime = this.audio.currentTime * 1000;
        const syncTime = rawSyncTime - this.calibrationOffset;
        const rawDiff = rawSyncTime - targetNote.time;
        const diff = Math.abs(targetNote.time - syncTime);

        if (diff <= this.hitWindow) {
            let inputChar = key;
            const isCaseSensitive = (typeof SONG_DATA !== 'undefined' && SONG_DATA.beat_map && SONG_DATA.beat_map.case_sensitive);

            if (!isCaseSensitive) {
                inputChar = key.toLowerCase();
            }

            if (inputChar === targetNote.key) {
                this.hit(targetNote, diff);
                this.updateCalibration(rawDiff);
            } else {
                // Wrong key pressed within window
                this.mistake();
            }
        } else {
            // Pressed key but closest note is too far away
            this.mistake();
        }
    }

    updateCalibration(rawDiff) {
        this.offsetHistory.push(rawDiff);
        if (this.offsetHistory.length > this.maxHistory) {
            this.offsetHistory.shift();
        }

        const sum = this.offsetHistory.reduce((a, b) => a + b, 0);
        const avg = sum / this.offsetHistory.length;

        if (Math.abs(this.calibrationOffset - avg) > 1) {
            this.calibrationOffset = this.calibrationOffset * 0.9 + avg * 0.1;
        } else {
            this.calibrationOffset = avg;
        }
    }

    updateHealth(amount) {
        this.currentHealth += amount;
        if (this.currentHealth > this.maxHealth) this.currentHealth = this.maxHealth;
        if (this.currentHealth <= 0) {
            this.currentHealth = 0;
            this.endGame(true); // true = failed
        }

        if (this.healthBar) {
            this.healthBar.style.width = `${this.currentHealth}%`;

            // Change color based on health
            // We can use background-position to shift the gradient
            // 100% health = 100% position (green)
            // 0% health = 0% position (red)
            this.healthBar.style.backgroundPosition = `${this.currentHealth}% 0`;
        }
    }

    mistake() {
        this.updateHealth(-2); // Reduced penalty from -5 to -2
        this.combo = 0;
        this.missedNotes++;
        this.showFeedback('miss');
        this.updateUI();
    }

    hit(note, diff) {
        note.hit = true;
        if (note.element) {
            note.element.classList.add('hit');
            setTimeout(() => {
                if (note.element) note.element.remove();
                note.element = null;
            }, 200);
        }

        let scoreToAdd = 0;
        let feedback = '';

        if (diff < 70) {
            scoreToAdd = 300;
            feedback = 'perfect';
            this.updateHealth(4); // Increased gain from 2 to 4
        } else if (diff < 150) {
            scoreToAdd = 100;
            feedback = 'good';
            this.updateHealth(2); // Increased gain from 1 to 2
        } else {
            scoreToAdd = 50;
            feedback = 'ok';
            this.updateHealth(1); // Added small gain for OK
        }

        this.score += scoreToAdd * (1 + this.combo * 0.1);
        this.combo++;
        this.hitNotes++;

        this.showFeedback(feedback);
        this.updateUI();
    }

    miss(note) {
        note.hit = true;
        if (note.element) {
            note.element.classList.add('missed');
            setTimeout(() => {
                if (note.element) note.element.remove();
                note.element = null;
            }, 200);
        }
        this.combo = 0;
        this.missedNotes++;
        this.updateHealth(-5); // Reduced penalty from -10 to -5
        this.showFeedback('miss');
        this.updateUI();
    }

    showFeedback(type) {
        const el = document.createElement('div');
        el.className = `feedback ${type}`;
        el.innerText = type.toUpperCase() + '!';
        this.feedbackLayer.appendChild(el);
        setTimeout(() => el.remove(), 1000);
    }

    updateUI() {
        if (this.scoreEl) this.scoreEl.innerText = Math.floor(this.score).toLocaleString();
        if (this.comboEl) this.comboEl.innerText = `x${this.combo}`;

        if (this.totalNotes > 0) {
            const accuracy = Math.floor((this.hitNotes / (this.hitNotes + this.missedNotes)) * 100);
            if (this.accuracyEl) this.accuracyEl.innerText = `${accuracy}%`;
        }
    }

    endGame(failed = false) {
        this.isPlaying = false;
        if (failed) {
            alert(`Game Over! You ran out of health.\nScore: ${Math.floor(this.score)}`);
        } else {
            alert(`Song Finished! Score: ${Math.floor(this.score)}`);
        }
        window.location.href = '/';
    }
}

const game = new Game();
