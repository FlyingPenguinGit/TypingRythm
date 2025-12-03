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

        this.bindEvents();

        if (typeof SONG_DATA !== 'undefined' && SONG_DATA) {
            this.initGame(SONG_DATA);
        } else {
            console.error("SONG_DATA is missing or invalid.");
        }
    }

    bindEvents() {
        document.addEventListener('keydown', (e) => this.handleInput(e));
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
        this.totalNotes = data.beat_map.length;
        this.updateUI();

        const videoId = window.location.pathname.split('/').pop();
        this.audio.src = `/static/songs/${videoId}.mp3`;
        this.audio.load();

        this.notes = data.beat_map.map(n => ({
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
        el.innerText = note.char;
        this.notesLayer.appendChild(el);
        note.element = el;
        this.activeNotes.push(note);
    }

    handleInput(e) {
        if (!this.isPlaying) return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        const key = e.key.toLowerCase();
        const sortedNotes = this.activeNotes.filter(n => !n.hit).sort((a, b) => a.time - b.time);

        if (sortedNotes.length === 0) return;

        const targetNote = sortedNotes[0];
        const rawSyncTime = this.audio.currentTime * 1000;
        const syncTime = rawSyncTime - this.calibrationOffset;
        const rawDiff = rawSyncTime - targetNote.time;
        const diff = Math.abs(targetNote.time - syncTime);

        if (diff <= this.hitWindow) {
            if (key === targetNote.key.toLowerCase()) {
                this.hit(targetNote, diff);
                this.updateCalibration(rawDiff);
            }
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
        } else if (diff < 150) {
            scoreToAdd = 100;
            feedback = 'good';
        } else {
            scoreToAdd = 50;
            feedback = 'ok';
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
        if (this.comboEl) this.comboEl.innerText = this.combo;

        if (this.totalNotes > 0) {
            const accuracy = Math.floor((this.hitNotes / (this.hitNotes + this.missedNotes)) * 100);
            if (this.accuracyEl) this.accuracyEl.innerText = `${accuracy}%`;
        }
    }

    endGame() {
        this.isPlaying = false;
        alert(`Song Finished! Score: ${Math.floor(this.score)}`);
        window.location.href = '/';
    }
}

const game = new Game();
