# Typing Rhythm Game

A browser-based rhythm game where you type to the beat of your favorite songs.

## Features
- **YouTube Integration**: Paste any YouTube link to play.
- **Automatic Beat Detection**: The server analyzes the audio to generate a unique beat map.
- **Real-time Gameplay**: Falling notes, score tracking, combo system, and accuracy calculation.
- **Neon Visuals**: Sleek dark mode with glowing neon accents.

## Setup

1.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```
    *Note: You also need `ffmpeg` installed and added to your system PATH for audio processing.*

2.  **Run the Server**:
    ```bash
    python app.py
    ```

3.  **Play**:
    Open your browser and navigate to `http://localhost:8000`.

## Project Structure
- `app.py`: Main Flask application.
- `audio_engine.py`: Handles YouTube downloading and audio analysis (librosa).
- `game_engine.py`: Generates note maps from analysis data.
- `static/`: CSS, JS, and downloaded songs.
- `templates/`: HTML files.