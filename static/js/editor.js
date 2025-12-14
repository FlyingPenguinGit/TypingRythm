
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements with Safety Checks
    const canvas = document.getElementById('timeline-canvas');
    if (!canvas) { console.error("Canvas element not found"); return; }

    const ctx = canvas.getContext('2d');
    const timelineWrapper = document.getElementById('timeline-wrapper');
    const playhead = document.getElementById('playhead');
    const playBtn = document.getElementById('play-btn');
    const recordBtn = document.getElementById('record-btn');
    const saveBtn = document.getElementById('save-btn');
    const timeDisplay = document.getElementById('time-display');

    if (!playhead || !playBtn || !recordBtn || !saveBtn || !timeDisplay) {
        console.error("Critical UI elements missing");
        return;
    }

    // Constants
    const PIXELS_PER_SECOND = 150;
    const CANVAS_HEIGHT = 300;
    canvas.height = CANVAS_HEIGHT;

    // Interaction Constants
    const GHOST_RADIUS = 6;
    const ACTIVE_RADIUS = 9;
    const HIT_TOLERANCE_PX = 15; // Pixel tolerance for clicking (approx 100ms at 150px/s)
    const SNAP_TOLERANCE = 0.1;

    // Data 
    const beatTimes = (songData && songData.beat_times) ? songData.beat_times : [];
    const onsetTimes = (songData && songData.onset_times) ? songData.onset_times : [];

    let currentMap = new Set();
    if (songData && songData.beat_map && songData.beat_map.notes) {
        songData.beat_map.notes.forEach(note => currentMap.add(note.time));
    }

    // Audio & Waveform
    const audioUrl = `/audio/${songData.id}`;
    const audio = new Audio(audioUrl);
    let isPlaying = false;
    let isRecording = false;
    let animationFrameId;

    // Waveform Buffer
    let waveformBuffer = null;
    let audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Setup Canvas Width
    const duration = (songData && songData.duration) ? songData.duration : 180;
    const totalWidth = Math.ceil(duration * PIXELS_PER_SECOND) + 500;
    canvas.width = totalWidth;

    // Fetch and Decode Audio for Waveform
    fetchWaveform();

    // Initial Playhead Update
    updatePlayhead();
    draw();

    // Event Listeners
    playBtn.addEventListener('click', () => togglePlay(false));
    recordBtn.addEventListener('click', () => togglePlay(true));

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault();
            if (isRecording && isPlaying) {
                recordInput();
            } else {
                togglePlay(false);
            }
        }
        else if (isRecording && isPlaying && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey) {
            recordInput();
        }
    });

    audio.addEventListener('ended', () => {
        isPlaying = false;
        isRecording = false;
        updateButtons();
        cancelAnimationFrame(animationFrameId);
    });

    saveBtn.addEventListener('click', saveBeatmap);

    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('dblclick', handleCanvasDoubleClick);

    async function fetchWaveform() {
        try {
            // Draw loading text
            ctx.fillStyle = 'white';
            ctx.font = '20px Outfit';
            ctx.fillText("Loading Waveform...", 20, 150);

            const response = await fetch(audioUrl);
            const arrayBuffer = await response.arrayBuffer();
            waveformBuffer = await audioContext.decodeAudioData(arrayBuffer);
            draw(); // Redraw with waveform
        } catch (e) {
            console.error("Error loading waveform:", e);
        }
    }

    // Main Loop
    function loop() {
        if (isPlaying) {
            updatePlayhead();
            draw();

            // Auto scroll
            const currentX = audio.currentTime * PIXELS_PER_SECOND;
            const viewportWidth = timelineWrapper.clientWidth;
            if (currentX > viewportWidth / 2) {
                timelineWrapper.scrollLeft = currentX - (viewportWidth / 2);
            }

            updateTimeDisplay();
            animationFrameId = requestAnimationFrame(loop);
        }
    }

    function togglePlay(recordMode = false) {
        if (isPlaying) {
            audio.pause();
            isPlaying = false;
            isRecording = false;
            updateButtons();
            cancelAnimationFrame(animationFrameId);
        } else {
            isRecording = recordMode;
            audio.play().catch(e => console.error("Audio play failed:", e));
            isPlaying = true;
            updateButtons();
            loop();
        }
    }

    function updateButtons() {
        if (isPlaying) {
            if (isRecording) {
                playBtn.disabled = true;
                playBtn.style.opacity = 0.5;
                recordBtn.innerHTML = '<span class="material-symbols-outlined">stop</span> Stop';
                recordBtn.style.background = '#ff4444';
                recordBtn.style.color = 'white';
            } else {
                recordBtn.disabled = true;
                recordBtn.style.opacity = 0.5;
                playBtn.innerHTML = '<span class="material-symbols-outlined">pause</span> Pause';
            }
        } else {
            playBtn.disabled = false;
            playBtn.style.opacity = 1;
            recordBtn.disabled = false;
            recordBtn.style.opacity = 1;

            playBtn.innerHTML = '<span class="material-symbols-outlined">play_arrow</span> Play';
            recordBtn.innerHTML = '<span class="material-symbols-outlined">fiber_manual_record</span> Record';
            recordBtn.style.background = '#ffab00';
            recordBtn.style.color = 'black';
        }
    }

    function recordInput() {
        const t = audio.currentTime;
        let bestCandidate = -1;
        let minDiff = Infinity;

        // Unified Check
        [...beatTimes, ...onsetTimes].forEach(time => {
            const diff = Math.abs(time - t);
            if (diff < minDiff) { minDiff = diff; bestCandidate = time; }
        });

        if (minDiff < SNAP_TOLERANCE) {
            currentMap.add(bestCandidate);
        } else {
            const customT = Math.round(t * 100) / 100;
            currentMap.add(customT);
        }
        draw();
    }

    function updatePlayhead() {
        if (!playhead) return;
        const x = audio.currentTime * PIXELS_PER_SECOND;
        playhead.style.left = `${x}px`;
    }

    function updateTimeDisplay() {
        const cur = formatTime(audio.currentTime);
        const dur = formatTime(duration);
        timeDisplay.innerText = `${cur} / ${dur}`;
    }

    function formatTime(s) {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60).toString().padStart(2, '0');
        return `${m}:${sec}`;
    }

    // Coordinate Helper
    function getCanvasCoordinates(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        // const scaleY = canvas.height / rect.height; // Not needed for single lane X check mostly

        const x = (e.clientX - rect.left) * scaleX;
        // const y = (e.clientY - rect.top) * scaleY;

        return x;
    }

    function draw() {
        if (!ctx) return;

        // Clear
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw Waveform
        if (waveformBuffer) {
            drawWaveform(waveformBuffer);
        }

        // Draw Center Line
        const midY = CANVAS_HEIGHT / 2;
        ctx.strokeStyle = '#333';
        ctx.beginPath();
        ctx.moveTo(0, midY); ctx.lineTo(canvas.width, midY);
        ctx.stroke();

        // Highlighting for recording
        if (isRecording) {
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
            ctx.lineWidth = 4;
            ctx.strokeRect(0, 0, canvas.width, CANVAS_HEIGHT);
        }

        // --- UNIFIED RENDERING ---

        // 1. Draw Ghost Beats (Blue)
        ctx.fillStyle = 'rgba(0, 136, 255, 0.4)';
        beatTimes.forEach(t => {
            if (!currentMap.has(t)) {
                const x = t * PIXELS_PER_SECOND;
                ctx.beginPath();
                ctx.arc(x, midY, GHOST_RADIUS, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        // 2. Draw Ghost Onsets (Orange)
        ctx.fillStyle = 'rgba(255, 170, 0, 0.4)';
        onsetTimes.forEach(t => {
            if (!currentMap.has(t)) {
                const x = t * PIXELS_PER_SECOND;
                ctx.beginPath();
                ctx.arc(x, midY + 10, GHOST_RADIUS, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        // 3. Draw Active Beats (Green)
        ctx.fillStyle = '#00ff88';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00ff88';
        currentMap.forEach(t => {
            const x = t * PIXELS_PER_SECOND;
            ctx.beginPath();
            ctx.moveTo(x, midY - ACTIVE_RADIUS);
            ctx.lineTo(x + ACTIVE_RADIUS, midY);
            ctx.lineTo(x, midY + ACTIVE_RADIUS);
            ctx.lineTo(x - ACTIVE_RADIUS, midY);
            ctx.fill();
        });
        ctx.shadowBlur = 0;
    }

    function drawWaveform(buffer) {
        const data = buffer.getChannelData(0);
        const step = Math.ceil(data.length / canvas.width);
        const amp = CANVAS_HEIGHT / 2;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();

        for (let i = 0; i < canvas.width; i++) {
            let min = 1.0;
            let max = -1.0;
            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
        }
    }

    function handleCanvasClick(e) {
        const x = getCanvasCoordinates(e);
        const time = x / PIXELS_PER_SECOND;

        // Check pixel distance instead of time distance for better UX?
        // Actually time distance is fine if PIXELS_PER_SECOND is constant.
        // tolerance 15px = 0.1s
        const toleranceSecs = HIT_TOLERANCE_PX / PIXELS_PER_SECOND;

        // 1. Check Close to Active (Delete)
        const closestActive = findClosestInSet(currentMap, time);
        if (closestActive !== null && Math.abs(closestActive - time) < toleranceSecs) {
            currentMap.delete(closestActive);
            draw();
            return;
        }

        // 2. Check Close to Beat Ghost (Activate)
        let closestBeat = findClosestInArray(beatTimes, time);
        if (closestBeat !== null && Math.abs(closestBeat - time) < toleranceSecs) {
            currentMap.add(closestBeat);
            draw();
            return;
        }

        // 3. Check Close to Onset Ghost (Activate)
        let closestOnset = findClosestInArray(onsetTimes, time);
        if (closestOnset !== null && Math.abs(closestOnset - time) < toleranceSecs) {
            currentMap.add(closestOnset);
            draw();
            return;
        }
    }

    function handleCanvasDoubleClick(e) {
        const x = getCanvasCoordinates(e);
        const time = x / PIXELS_PER_SECOND;
        const t = Math.round(time * 100) / 100;
        currentMap.add(t);
        draw();
    }

    function findClosestInSet(set, targetTime) {
        let closest = null;
        let minDiff = Infinity;
        for (let t of set) {
            const diff = Math.abs(t - targetTime);
            if (diff < minDiff) { minDiff = diff; closest = t; }
        }
        return closest;
    }

    function findClosestInArray(arr, targetTime) {
        let closest = null;
        let minDiff = Infinity;
        for (let t of arr) {
            const diff = Math.abs(t - targetTime);
            if (diff < minDiff) { minDiff = diff; closest = t; }
        }
        return closest;
    }

    async function saveBeatmap() {
        saveBtn.innerText = "Saving...";
        saveBtn.disabled = true;

        const timestamps = Array.from(currentMap);

        try {
            const res = await fetch(`/save_beatmap/${songData.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timestamps: timestamps })
            });
            const data = await res.json();

            if (data.status === 'success') {
                saveBtn.innerText = "Saved!";
                setTimeout(() => {
                    saveBtn.innerHTML = '<span class="material-symbols-outlined">save</span> Save & Apply';
                    saveBtn.disabled = false;
                }, 1000);
            } else {
                alert("Error saving: " + data.error);
                saveBtn.disabled = false;
            }
        } catch (e) {
            console.error(e);
            alert("Network error.");
            saveBtn.disabled = false;
        }
    }
});
