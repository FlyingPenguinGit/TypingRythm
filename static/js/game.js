class Game {
    constructor() {
        // Read config from data attributes
        const configEl = document.getElementById('game-config');
        if (configEl) {
            window.GAME_CONFIG = {
                practice: configEl.dataset.practice === 'True',
                speed: parseFloat(configEl.dataset.speed) || 1.0,
                startTime: parseFloat(configEl.dataset.startTime) || 0.0
            };
        } else {
            window.GAME_CONFIG = { practice: false, speed: 1.0, startTime: 0.0 };
        }



        this.audio = new Audio();
        this.isPlaying = false;
        this.gameOver = false;
        this.score = 0;
        this.combo = 0;
        this.notes = [];
        this.activeNotes = [];
        this.startTime = 0;

        this.lastNoteTime = 0;
        this.isFadingOut = false;

        // Apply settings
        const scheme = localStorage.getItem('colorScheme') || 'default';
        const font = localStorage.getItem('fontStyle') || 'outfit';
        document.body.className = `theme-${scheme} font-${font}`;

        const visualizerValue = localStorage.getItem('visualizerEnabled') || 'true';
        this.visualizerEnabled = visualizerValue === 'true';

        const timingIndicatorValue = localStorage.getItem('timingIndicatorEnabled') || 'true';
        this.timingIndicatorEnabled = timingIndicatorValue === 'true';

        // Horizontal settings
        this.travelTime = 3000;
        this.hitWindow = 200; // Increased from 150ms for more forgiveness
        this.targetX = 150; // Updated to match CSS

        // Auto-calibration
        this.offsetHistory = [];
        this.calibrationOffset = parseFloat(this.getCookie('calibrationOffset')) || 0;
        this.maxHistory = 10;

        this.notesLayer = document.getElementById('notes-layer');
        this.feedbackLayer = document.getElementById('feedback-layer');
        this.scoreEl = document.getElementById('score');
        this.comboEl = document.getElementById('combo');
        this.accuracyEl = document.getElementById('accuracy');
        this.progressBar = document.getElementById('progress-bar');
        this.songTitleEl = document.getElementById('song-title');
        this.gameOverSongTitleEl = document.getElementById('game-over-song-title');
        this.timingIndicator = document.querySelector('.timing-indicator');

        this.totalNotes = 0;
        this.hitNotes = 0;
        this.missedNotes = 0;
        this.maxCombo = 0;

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

        // Audio Visualizer
        this.audioContext = null;
        this.analyser = null;
        this.freqData = null;

        this.visualizerEl = document.getElementById("audio-visualizer");
        this.visualizerBars = [];
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

        // pause retry button
        const retryBtn = document.getElementById('pause-retry-btn');

        // Retry button handler
        if (retryBtn) {
            retryBtn.onclick = () => window.location.reload();
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
        if (!pauseMenu || this.gameOver) return;

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
        if (this.gameOverSongTitleEl) this.gameOverSongTitleEl.innerText = data.title;

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

        if (this.notes.length > 0) {
            // Find the last note time (assuming sorted, but being safe)
            this.lastNoteTime = this.notes.reduce((max, n) => Math.max(max, n.time), 0);
        }

        // Practice Mode: Skip notes before start time
        if (typeof GAME_CONFIG !== 'undefined' && GAME_CONFIG.startTime > 0) {
            const skipTime = GAME_CONFIG.startTime * 1000;
            this.notes.forEach(n => {
                if (n.time < skipTime) {
                    n.hit = true; // Mark as hit so they don't spawn or count as miss
                }
            });
        }

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
        if (typeof GAME_CONFIG !== 'undefined') {
            this.audio.currentTime = GAME_CONFIG.startTime || 0;
            this.audio.playbackRate = GAME_CONFIG.speed || 1.0;
        }

        this.audio.play().catch(e => console.error("Audio play failed:", e));
        this.startTime = performance.now();
        this.isPlaying = true;

        if (this.visualizerEnabled) {
            this.initVisualizer();
        }
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

        // Update visualizer
        if (this.analyser && this.visualizerEnabled) {
            this.analyser.getByteFrequencyData(this.freqData);
            for (let i = 0; i < this.visualizerBars.length; i++) {
                const bar = this.visualizerBars[i];
                const h = (this.freqData[i] / 255) * 35; // max height 35px
                bar.style.height = `${h}px`;
            }
        }



        const spawnWindow = syncTime + this.travelTime;

        this.notes.forEach(note => {
            if (!note.element && !note.hit && note.time <= spawnWindow && note.time > syncTime - 200) {
                this.createNoteElement(note);
            }
        });


        // Find the next upcoming note for timing indicator
        let nextNote = null;
        let minTimeUntilHit = Infinity;

        this.activeNotes.forEach((note) => {
            if (note.hit) return;

            const timeUntilHit = note.time - syncTime;
            const trackWidth = document.querySelector('.track-container').offsetWidth;
            const startX = trackWidth;
            const endX = this.targetX;

            const progress = 1 - (timeUntilHit / this.travelTime);
            const currentX = startX - (startX - endX) * progress;

            // Track the closest upcoming note
            if (timeUntilHit > -this.hitWindow && timeUntilHit < minTimeUntilHit) {
                nextNote = note;
                minTimeUntilHit = timeUntilHit;
            }

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

        // Update timing indicator
        if (this.timingIndicator && this.timingIndicatorEnabled) {
            // Only show the indicator during the last 1000ms (1 second) of travel for quicker animation
            const showWindow = 1000;

            if (nextNote && minTimeUntilHit <= showWindow && minTimeUntilHit > -this.hitWindow) {
                // Show indicator and scale it based on time until hit
                this.timingIndicator.classList.add('active');

                // Scale from 200px to 80px (target indicator size)
                const maxSize = 200;
                const minSize = 80;
                const sizeRange = maxSize - minSize;

                // Progress from 0 (far) to 1 (at target)
                const timingProgress = Math.max(0, Math.min(1, 1 - (minTimeUntilHit / showWindow)));
                const currentSize = maxSize - (sizeRange * timingProgress);

                this.timingIndicator.style.width = `${currentSize}px`;
                this.timingIndicator.style.height = `${currentSize}px`;
            } else {
                // Hide indicator when no notes are close
                this.timingIndicator.classList.remove('active');
            }
        }

        this.activeNotes = this.activeNotes.filter(n => n.element !== null || (n.hit && n.element));

        if (!this.audio.paused) {
            requestAnimationFrame(() => this.loop());
        } else if (this.audio.ended) {
            this.endGame();
        }

        // Early fade out check
        if (!this.isFadingOut && !this.gameOver && this.lastNoteTime > 0 && this.audio.duration && this.isPlaying) {
            const lastNoteSec = this.lastNoteTime / 1000;
            const timeSinceLastNote = syncTime - this.lastNoteTime;

            // If song ends more than 5s after last note
            if ((this.audio.duration - lastNoteSec) > 5.0) {
                // Buffer of 2 seconds after last note
                if (timeSinceLastNote > 2000) {
                    this.fadeOutAndEnd();
                }
            }
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
            const volumeSlider = document.getElementById('pause-volume-slider');
            const volumeValue = document.getElementById('pause-volume-value');
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
        if (e.ctrlKey || e.altKey || e.metaKey || e.key === 'Shift') {
            return;
        }

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

    setCookie(name, value, days) {
        let expires = "";
        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = "; expires=" + date.toUTCString();
        }
        document.cookie = name + "=" + (value || "") + expires + "; path=/";
    }

    getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) == ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    updateHealth(amount) {
        // Practice Mode: Invincible (No damage)
        if (typeof GAME_CONFIG !== 'undefined' && GAME_CONFIG.practice && amount < 0) {
            return;
        }

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
        this.updateHealth(-3); // Reduced penalty from -5 to -3
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
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
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

    fadeOutAndEnd() {
        console.log("Fading out...");
        this.isFadingOut = true;
        const fadeDuration = 2000; // 2 seconds fade
        const startVolume = this.audio.volume;
        const steps = 20;
        const intervalTime = fadeDuration / steps;
        const volStep = startVolume / steps;

        const fadeInterval = setInterval(() => {
            if (this.audio.volume > volStep) {
                this.audio.volume -= volStep;
            } else {
                this.audio.volume = 0;
                clearInterval(fadeInterval);
                this.endGame(false);
            }
        }, intervalTime);
    }

    endGame(failed = false) {
        this.isPlaying = false;

        if (failed) {
            // Tape Stop Effect
            const fadeInterval = setInterval(() => {
                if (this.audio.playbackRate > 0.1) {
                    // Reduce, but ensure we don't go below valid range accidentally
                    this.audio.playbackRate = Math.max(0, this.audio.playbackRate - 0.025);
                    this.notesLayer.style.opacity = this.audio.playbackRate;
                } else {
                    clearInterval(fadeInterval);
                    this.audio.pause();
                    this.notesLayer.style.opacity = 0;
                    this.gameOver = true;
                    this.showGameOverOverlay(true, 'F');
                }
            }, 50);
        } else {
            this.togglePause(); // Just pause normally
            this.gameOver = true;
            const grade = this.calculateGrade();
            this.saveScore(this.score, grade);
            this.showGameOverOverlay(false, grade);
        }

        this.setCookie('calibrationOffset', this.calibrationOffset, 365);
    }

    calculateMaxScore() {
        // Max score calculation assuming all perfect hits (300 base) and maintaining combo
        // Score += 300 * (1 + combo * 0.1)
        // Combo goes 0, 1, 2, ..., N-1
        const N = this.totalNotes;
        if (N === 0) return 0;

        // Sum of (1 + i*0.1) for i=0 to N-1 is N + 0.1 * (N*(N-1)/2)
        const multiplierSum = N + 0.1 * (N * (N - 1) / 2);
        return 300 * multiplierSum;
    }

    calculateGrade() {
        const accuracy = (this.hitNotes + this.missedNotes) > 0
            ? (this.hitNotes / (this.hitNotes + this.missedNotes))
            : 0;

        if (accuracy >= 0.95) return 'S';
        if (accuracy >= 0.90) return 'A';
        if (accuracy >= 0.80) return 'B';
        if (accuracy >= 0.70) return 'C';
        if (accuracy >= 0.60) return 'D';
        return 'F';
    }

    saveScore(score, grade) {
        if (typeof GAME_CONFIG !== 'undefined' && GAME_CONFIG.practice) return;

        const videoId = window.location.pathname.split('/').pop();
        const storageKey = 'typing_rhythm_scores';

        let scores = {};
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                scores = JSON.parse(stored);
            }
        } catch (e) {
            console.error("Failed to parse scores:", e);
        }

        const entry = scores[videoId] || {};
        const currentBest = Number.isFinite(entry.score) ? entry.score : 0;
        const currentGrade = entry.grade || 'F';

        const gradeOrder = ['F', 'D', 'C', 'B', 'A', 'S'];
        const newGradeIndex = gradeOrder.indexOf(grade);
        const currentGradeIndex = gradeOrder.indexOf(currentGrade);

        // Update if score is higher OR grade is better
        if (score > currentBest || newGradeIndex > currentGradeIndex) {
            scores[videoId] = {
                score: Math.max(Math.floor(score), currentBest),
                grade: newGradeIndex > currentGradeIndex ? grade : currentGrade
            };
            localStorage.setItem(storageKey, JSON.stringify(scores));
        }
    }

    showGameOverOverlay(failed, grade = 'F') {
        const overlay = document.getElementById('game-over-overlay');
        const title = document.getElementById('game-over-title');
        const finalScore = document.getElementById('final-score');
        const maxCombo = document.getElementById('max-combo');
        const finalAccuracy = document.getElementById('final-accuracy');
        const notesHit = document.getElementById('notes-hit');
        const retryBtn = document.getElementById('retry-btn');

        if (!overlay) return;

        // Set title based on failure/success
        if (title) {
            if (failed) {
                title.innerText = 'GAME OVER!';
                title.style.color = 'var(--primary-glow)';
            } else {
                title.innerHTML = `SONG COMPLETE! - GRADE <span class="grade-${grade.toLowerCase()}" style="display:inline-block"><span class="grade-letter" style="font-size:inherit">${grade}</span></span>`;
                title.style.color = 'var(--secondary-glow)';
            }
        }

        // Populate stats
        if (finalScore) finalScore.innerText = Math.floor(this.score).toLocaleString();
        if (maxCombo) maxCombo.innerText = `x${this.maxCombo}`;

        const accuracy = (this.hitNotes + this.missedNotes) > 0
            ? Math.floor((this.hitNotes / (this.hitNotes + this.missedNotes)) * 100)
            : 0;
        if (finalAccuracy) finalAccuracy.innerText = `${accuracy}%`;
        if (notesHit) notesHit.innerText = `${this.hitNotes}/${this.hitNotes + this.missedNotes}`;

        // Show overlay
        overlay.classList.remove('hidden');

        // Retry button handler
        if (retryBtn) {
            retryBtn.onclick = () => window.location.reload();
        }
    }

    initVisualizer() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaElementSource(this.audio);

            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 64; // low number = smoother bars
            this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

            source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);

            // Build bars
            this.visualizerEl.innerHTML = "";
            this.visualizerBars = [];

            for (let i = 0; i < this.analyser.frequencyBinCount; i++) {
                const bar = document.createElement("div");
                bar.className = "audio-bar";
                this.visualizerEl.appendChild(bar);
                this.visualizerBars.push(bar);
            }
        }
    }
}

const game = new Game();
