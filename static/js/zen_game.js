class ZenGame {
    constructor() {
        this.audio = new Audio();
        this.isPlaying = false;
        this.gameOver = false;
        this.score = 0;

        // Word list for random generation
        this.wordList = [
            "time", "year", "people", "way", "day", "man", "thing", "woman", "life", "child",
            "world", "school", "state", "family", "student", "group", "country", "problem",
            "hand", "part", "place", "case", "week", "company", "system", "program", "question",
            "work", "government", "number", "night", "point", "home", "water", "room", "mother",
            "area", "money", "story", "fact", "month", "lot", "right", "study", "book", "eye",
            "job", "word", "business", "issue", "side", "kind", "head", "house", "service",
            "friend", "father", "power", "hour", "game", "line", "end", "member", "law",
            "car", "city", "community", "name", "president", "team", "minute", "idea", "kid",
            "body", "information", "back", "parent", "face", "others", "level", "office",
            "door", "health", "person", "art", "war", "history", "party", "result", "change",
            "morning", "reason", "research", "girl", "guy", "moment", "air", "teacher", "force",
            "education", "music", "light", "voice", "paper", "space", "street", "view", "choice"
        ];

        // Current word state
        this.currentWord = '';
        this.typedChars = '';
        this.keystrokeTimings = []; // Timestamps for current word
        this.wordPatternHistory = []; // Recent rhythm patterns

        // Beat/onset data
        this.beatTimes = [];
        this.onsetTimes = [];
        this.allRhythmPoints = [];
        this.firstBeatTime = 0;

        // Rhythm scoring metrics
        this.totalKeypresses = 0;
        this.rhythmHits = 0;

        // UI Elements
        this.currentWordEl = document.getElementById('current-word');
        this.feedbackLayer = document.getElementById('feedback-layer');
        this.scoreEl = document.getElementById('score');
        this.rhythmEl = document.getElementById('rhythm');
        this.progressBar = document.getElementById('progress-bar');
        this.songTitleEl = document.getElementById('song-title');
        this.gameOverSongTitleEl = document.getElementById('game-over-song-title');

        // Apply color scheme
        const scheme = localStorage.getItem('colorScheme') || 'default';
        const font = localStorage.getItem('fontStyle') || 'outfit';
        document.body.className = `theme-${scheme} font-${font}`;

        this.setupVolumeControl();
        this.bindEvents();

        if (typeof SONG_DATA !== 'undefined' && SONG_DATA) {
            this.initGame(SONG_DATA);
        } else {
            console.error("SONG_DATA is missing");
        }

        // Audio Visualizer
        this.audioContext = null;
        this.analyser = null;
        this.freqData = null;
        this.visualizerEl = document.getElementById("audio-visualizer");
        this.visualizerBars = [];
        const visualizerValue = localStorage.getItem('visualizerEnabled') || 'true';
        this.visualizerEnabled = visualizerValue === 'true';
    }

    bindEvents() {
        document.addEventListener('keydown', (e) => this.handleInput(e));

        const pauseBtnTop = document.getElementById('pause-btn-top');
        if (pauseBtnTop) {
            pauseBtnTop.addEventListener('click', () => this.togglePause());
        }

        const resumeBtn = document.getElementById('resume-btn');
        if (resumeBtn) {
            resumeBtn.addEventListener('click', () => this.togglePause());
        }

        const pauseRetryBtn = document.getElementById('pause-retry-btn');
        if (pauseRetryBtn) {
            pauseRetryBtn.onclick = () => window.location.reload();
        }

        const retryBtn = document.getElementById('retry-btn');
        if (retryBtn) {
            retryBtn.onclick = () => window.location.reload();
        }
    }

    setupVolumeControl() {
        const pauseVolumeSlider = document.getElementById('pause-volume-slider');
        const pauseVolumeValue = document.getElementById('pause-volume-value');

        const savedVolume = localStorage.getItem('gameVolume') || 70;
        this.audio.volume = savedVolume / 100;

        if (pauseVolumeSlider) pauseVolumeSlider.value = savedVolume;
        if (pauseVolumeValue) pauseVolumeValue.innerText = `${savedVolume}%`;

        if (pauseVolumeSlider) {
            pauseVolumeSlider.addEventListener('input', (e) => {
                const volume = e.target.value;
                this.audio.volume = volume / 100;
                localStorage.setItem('gameVolume', volume);
                if (pauseVolumeValue) pauseVolumeValue.innerText = `${volume}%`;
            });
        }
    }

    togglePause() {
        const pauseMenu = document.getElementById('pause-menu');
        if (!pauseMenu || this.gameOver) return;

        if (pauseMenu.classList.contains('hidden')) {
            this.audio.pause();
            pauseMenu.classList.remove('hidden');
        } else {
            this.audio.play();
            pauseMenu.classList.add('hidden');
            this.loop();
        }
    }

    initGame(data) {
        if (this.songTitleEl) this.songTitleEl.innerText = data.title;
        if (this.gameOverSongTitleEl) this.gameOverSongTitleEl.innerText = data.title;

        // Set background
        const bgEl = document.getElementById('game-background');
        if (bgEl && data.thumbnail) {
            bgEl.style.backgroundImage = `url(${data.thumbnail})`;
        }

        // Get beat and onset times
        this.beatTimes = (data.analysis && data.analysis.beat_times) || [];
        this.onsetTimes = (data.analysis && data.analysis.onset_times) || [];

        // Combine and sort
        this.allRhythmPoints = [...this.beatTimes, ...this.onsetTimes].sort((a, b) => a - b);

        // Filter close points
        const filtered = [];
        let lastTime = -1;
        for (let t of this.allRhythmPoints) {
            if (t - lastTime > 0.15) {
                filtered.push(t);
                lastTime = t;
            }
        }
        this.allRhythmPoints = filtered;

        this.firstBeatTime = this.beatTimes.length > 0 ? this.beatTimes[0] : (this.allRhythmPoints.length > 0 ? this.allRhythmPoints[0] : 0);

        // Start with first word hidden
        this.currentWordEl.style.opacity = '0';

        // Load audio
        const videoId = window.location.pathname.split('/').pop();
        this.audio.src = `/static/songs/${videoId}.mp3`;
        this.audio.load();

        // Countdown
        const startDelay = 1500;
        const countdownEl = document.getElementById('countdown-overlay');

        if (countdownEl) {
            countdownEl.classList.remove('hidden');
            let count = 3;
            countdownEl.innerText = count;

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
            this.startPlayback();
        }
    }

    startPlayback() {
        this.audio.play().catch(e => console.error("Audio play failed:", e));
        this.isPlaying = true;

        if (this.visualizerEnabled) {
            this.initVisualizer();
        }

        this.loop();
    }

    loop() {
        if (!this.isPlaying) return;

        const currentTime = this.audio.currentTime;

        // Update progress bar
        if (this.audio.duration) {
            const progress = (currentTime / this.audio.duration) * 100;
            if (this.progressBar) this.progressBar.style.width = `${progress}%`;
        }

        // Update visualizer
        if (this.analyser && this.visualizerEnabled) {
            this.analyser.getByteFrequencyData(this.freqData);
            for (let i = 0; i < this.visualizerBars.length; i++) {
                const bar = this.visualizerBars[i];
                const h = (this.freqData[i] / 255) * 35;
                bar.style.height = `${h}px`;
            }
        }

        // Show first word 0.5s before first beat
        if (this.currentWordEl.style.opacity === '0' && currentTime >= (this.firstBeatTime - 0.5)) {
            this.showNewWord();
        }

        if (!this.audio.paused) {
            requestAnimationFrame(() => this.loop());
        } else if (this.audio.ended) {
            this.endGame();
        }
    }

    showNewWord() {
        this.currentWord = this.wordList[Math.floor(Math.random() * this.wordList.length)];
        this.typedChars = '';
        this.keystrokeTimings = [];

        if (this.currentWordEl) {
            this.currentWordEl.innerText = this.currentWord;
            this.currentWordEl.style.opacity = '1';
            this.currentWordEl.classList.remove('fade-out-left');
        }
    }

    handleInput(e) {
        // ESC for pause
        if (e.key === 'Escape') {
            e.preventDefault();
            this.togglePause();
            return;
        }

        if (!this.isPlaying || this.gameOver || !this.currentWord) return;
        if (e.ctrlKey || e.altKey || e.metaKey || e.key === 'Shift' || e.key === 'Tab') return;

        const key = e.key;
        const currentTime = this.audio.currentTime;

        // Handle backspace
        if (key === 'Backspace') {
            e.preventDefault();
            if (this.typedChars.length > 0) {
                this.typedChars = this.typedChars.slice(0, -1);
                this.keystrokeTimings.pop();
                this.updateWordDisplay();
            }
            return;
        }

        // Regular character input
        if (key.length === 1 && key.match(/[a-z]/i)) {
            e.preventDefault();

            const expectedChar = this.currentWord[this.typedChars.length];

            if (key.toLowerCase() === expectedChar.toLowerCase()) {
                // Correct character
                this.typedChars += expectedChar;
                this.keystrokeTimings.push(currentTime * 1000); // Store in milliseconds
                this.totalKeypresses++;
                this.updateWordDisplay();

                // Check if word is complete
                if (this.typedChars === this.currentWord) {
                    this.onWordComplete();
                }
            } else {
                // Wrong character - visual feedback
                this.currentWordEl.classList.add('wrong-char');
                setTimeout(() => {
                    this.currentWordEl.classList.remove('wrong-char');
                }, 300);
            }
        }
    }

    updateWordDisplay() {
        if (!this.currentWordEl) return;

        // Show typed characters in different color
        const typed = `<span class="typed-chars">${this.typedChars}</span>`;
        const remaining = `<span class="remaining-chars">${this.currentWord.substring(this.typedChars.length)}</span>`;
        this.currentWordEl.innerHTML = typed + remaining;
    }

    onWordComplete() {
        // Calculate rhythm score for this word
        const wordScore = this.calculateRhythmScore();

        // Add to total score
        this.score += wordScore;
        this.updateUI();

        // Show visual feedback
        this.showFeedback(wordScore);

        // Fade out and show new word
        this.currentWordEl.classList.add('fade-out-left');

        setTimeout(() => {
            this.showNewWord();
        }, 300);
    }

    calculateRhythmScore() {
        if (this.keystrokeTimings.length < 2) return 20; // Minimum score for very short words

        // 1. Beat/Onset Alignment Score (40 points max)
        const beatScore = this.scoreBeatAlignment();

        // 2. Internal Rhythm Coherence (30 points max)
        const coherenceScore = this.scoreCoherence();

        // 3. Pattern Consistency (30 points max)
        const patternScore = this.scorePatternConsistency();

        const totalScore = Math.round(beatScore + coherenceScore + patternScore);

        // Store this pattern for future comparison
        this.storePattern();

        return totalScore;
    }

    scoreBeatAlignment() {
        let alignedKeypresses = 0;
        const rhythmWindow = 200; // ms

        for (let keystroke of this.keystrokeTimings) {
            let closestDist = Infinity;

            // Check against all rhythm points
            for (let t of this.allRhythmPoints) {
                const tMs = t * 1000;
                const dist = Math.abs(keystroke - tMs);
                if (dist < closestDist) closestDist = dist;
            }

            if (closestDist < rhythmWindow) {
                alignedKeypresses++;
                this.rhythmHits++;
            }
        }

        const alignmentRatio = alignedKeypresses / this.keystrokeTimings.length;
        return alignmentRatio * 40;
    }

    scoreCoherence() {
        if (this.keystrokeTimings.length < 3) return 20;

        // Calculate intervals between keystrokes
        const intervals = [];
        for (let i = 1; i < this.keystrokeTimings.length; i++) {
            intervals.push(this.keystrokeTimings[i] - this.keystrokeTimings[i - 1]);
        }

        // Calculate standard deviation of intervals
        const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance = intervals.reduce((sum, interval) => {
            return sum + Math.pow(interval - mean, 2);
        }, 0) / intervals.length;
        const stdDev = Math.sqrt(variance);

        // Lower standard deviation = more coherent = higher score
        // Normalize: typical intervals are 100-600ms, stdDev <50ms is excellent
        const coherence = Math.max(0, 1 - (stdDev / 100));
        return coherence * 30;
    }

    scorePatternConsistency() {
        if (this.wordPatternHistory.length === 0) return 20; // First word gets neutral score

        // Calculate intervals for current word
        const currentIntervals = [];
        for (let i = 1; i < this.keystrokeTimings.length; i++) {
            currentIntervals.push(this.keystrokeTimings[i] - this.keystrokeTimings[i - 1]);
        }

        // Normalize intervals by word length
        const currentPattern = this.normalizePattern(currentIntervals);

        // Compare with recent patterns
        let totalSimilarity = 0;
        const recentPatterns = this.wordPatternHistory.slice(-5); // Last 5 words

        for (let pastPattern of recentPatterns) {
            const similarity = this.calculatePatternSimilarity(currentPattern, pastPattern);
            totalSimilarity += similarity;
        }

        const avgSimilarity = totalSimilarity / recentPatterns.length;
        return avgSimilarity * 30;
    }

    normalizePattern(intervals) {
        if (intervals.length === 0) return [];
        const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        return intervals.map(interval => interval / mean);
    }

    calculatePatternSimilarity(pattern1, pattern2) {
        // Use dynamic time warping-like approach for different length patterns
        const minLength = Math.min(pattern1.length, pattern2.length);

        let differences = 0;
        for (let i = 0; i < minLength; i++) {
            differences += Math.abs(pattern1[i] - pattern2[i]);
        }

        const avgDifference = differences / minLength;
        // Convert difference to similarity (0-1 scale)
        return Math.max(0, 1 - avgDifference);
    }

    storePattern() {
        if (this.keystrokeTimings.length < 2) return;

        const intervals = [];
        for (let i = 1; i < this.keystrokeTimings.length; i++) {
            intervals.push(this.keystrokeTimings[i] - this.keystrokeTimings[i - 1]);
        }

        const pattern = this.normalizePattern(intervals);
        this.wordPatternHistory.push(pattern);

        // Keep only last 10 patterns
        if (this.wordPatternHistory.length > 10) {
            this.wordPatternHistory.shift();
        }
    }

    showFeedback(points) {
        if (!this.feedbackLayer || !this.currentWordEl) return;

        const feedback = document.createElement('div');
        feedback.className = 'feedback-popup';
        feedback.innerText = `+${points}`;

        // Color based on score
        if (points >= 80) {
            feedback.style.color = '#00ff88';
        } else if (points >= 50) {
            feedback.style.color = '#ffdd00';
        } else {
            feedback.style.color = '#ff4444';
        }

        // Position at word location
        const rect = this.currentWordEl.getBoundingClientRect();
        const layerRect = this.feedbackLayer.getBoundingClientRect();

        feedback.style.left = `${rect.left - layerRect.left + rect.width / 2}px`;
        feedback.style.top = `${rect.top - layerRect.top}px`;

        this.feedbackLayer.appendChild(feedback);

        // Remove after animation
        setTimeout(() => {
            feedback.remove();
        }, 1500);
    }

    updateUI() {
        if (this.scoreEl) this.scoreEl.innerText = Math.floor(this.score).toLocaleString();

        if (this.totalKeypresses > 0) {
            const rhythmAccuracy = Math.floor((this.rhythmHits / this.totalKeypresses) * 100);
            if (this.rhythmEl) this.rhythmEl.innerText = `${rhythmAccuracy}%`;
        }
    }

    endGame(failed = false) {
        this.isPlaying = false;
        this.gameOver = true;

        if (failed) {
            const fadeInterval = setInterval(() => {
                if (this.audio.playbackRate > 0.1) {
                    this.audio.playbackRate = Math.max(0, this.audio.playbackRate - 0.025);
                } else {
                    clearInterval(fadeInterval);
                    this.audio.pause();
                    this.showGameOverOverlay(true, 'F');
                }
            }, 50);
        } else {
            this.togglePause();
            const grade = this.calculateGrade();
            this.saveScore(this.score, grade);
            this.showGameOverOverlay(false, grade);
        }
    }

    calculateGrade() {
        const rhythmAccuracy = this.totalKeypresses > 0
            ? (this.rhythmHits / this.totalKeypresses)
            : 0;

        if (rhythmAccuracy >= 0.90) return 'S';
        if (rhythmAccuracy >= 0.80) return 'A';
        if (rhythmAccuracy >= 0.70) return 'B';
        if (rhythmAccuracy >= 0.60) return 'C';
        if (rhythmAccuracy >= 0.50) return 'D';
        return 'F';
    }

    saveScore(score, grade) {
        const videoId = window.location.pathname.split('/').pop();
        const storageKey = 'typing_rhythm_zen_scores';

        let scores = {};
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                scores = JSON.parse(stored);
            }
        } catch (e) {
            console.error("Failed to parse zen scores:", e);
        }

        const entry = scores[videoId] || {};
        const currentBest = Number.isFinite(entry.score) ? entry.score : 0;
        const currentGrade = entry.grade || 'F';

        const gradeOrder = ['F', 'D', 'C', 'B', 'A', 'S'];
        const newGradeIndex = gradeOrder.indexOf(grade);
        const currentGradeIndex = gradeOrder.indexOf(currentGrade);

        if (score > currentBest || newGradeIndex > currentGradeIndex) {
            scores[videoId] = {
                score: Math.max(Math.floor(score), currentBest),
                grade: newGradeIndex > currentGradeIndex ? grade : currentGrade,
                version: typeof SONG_DATA !== 'undefined' ? (SONG_DATA.version || 1) : 1
            };
            localStorage.setItem(storageKey, JSON.stringify(scores));
        }
    }

    showGameOverOverlay(failed, grade = 'F') {
        const overlay = document.getElementById('game-over-overlay');
        const title = document.getElementById('game-over-title');
        const finalScore = document.getElementById('final-score');
        const finalAccuracy = document.getElementById('final-accuracy');

        if (!overlay) return;

        if (title) {
            if (failed) {
                title.innerText = 'GAME OVER!';
                title.style.color = 'var(--primary-glow)';
            } else {
                title.innerHTML = `ZEN COMPLETE! - GRADE <span class="grade-${grade.toLowerCase()}" style="display:inline-block"><span class="grade-letter" style="font-size:inherit">${grade}</span></span>`;
                title.style.color = 'var(--secondary-glow)';
            }
        }

        if (finalScore) finalScore.innerText = Math.floor(this.score).toLocaleString();

        const rhythmAccuracy = this.totalKeypresses > 0
            ? Math.floor((this.rhythmHits / this.totalKeypresses) * 100)
            : 0;
        if (finalAccuracy) finalAccuracy.innerText = `${rhythmAccuracy}%`;

        overlay.classList.remove('hidden');
    }

    initVisualizer() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaElementSource(this.audio);

            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 64;
            this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

            source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);

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

const game = new ZenGame();
