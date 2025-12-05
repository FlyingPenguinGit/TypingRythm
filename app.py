import os
import json
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO
from audio_engine import download_audio, analyze_audio
from game_engine import generate_beat_map
from lyrics_engine import get_lyrics, save_lyrics

print("App is starting...")

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*")

DATA_FILE = 'songs_data.json'

def load_data():
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_data(data):
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=4)

@app.route('/')
def menu():
    data = load_data()
    songs = []
    for video_id, info in data.items():
        beat_map = info.get('beat_map', {})
        songs.append({
            'id': video_id,
            'title': info.get('title', 'Unknown Title'),
            'thumbnail': info.get('thumbnail', ''),
            'duration': info.get('duration', 0),
            'bpm': int(info.get('analysis', {}).get('bpm', 0)),
            'difficulty': info.get('difficulty', 1),
            'case_sensitive': beat_map.get('case_sensitive', False),
            'include_spaces': beat_map.get('include_spaces', False)
        })
    return render_template('menu.html', songs=songs)

@app.route('/game/<video_id>')
def game(video_id):
    data = load_data()
    song_data = data.get(video_id)
    if not song_data:
        return "Song not found", 404
    return render_template('game.html', song_data=song_data)

@app.route('/process_song', methods=['POST'])
def process_song():
    data = request.json
    youtube_url = data.get('url')
    custom_lyrics = data.get('custom_lyrics')
    monotone_factor_input = float(data.get('monotone_factor', 0.5))
    monotone_min = 0.1
    monotone_max = 0.8
    monotone_factor = monotone_min + (monotone_max - monotone_min) * monotone_factor_input
    
    case_sensitive = data.get('case_sensitive', False)
    include_spaces = data.get('include_spaces', False)
    
    if not youtube_url:
        return jsonify({'error': 'No URL provided'}), 400
    
    # 1. Download
    file_path, video_id, title = download_audio(youtube_url)
    if not file_path:
        return jsonify({'error': 'Download failed'}), 500
    
    # Check if we already have analysis data
    saved_data = load_data()
    
    analysis = None
    
    # Try to use existing analysis if it has the raw data we need
    if video_id in saved_data:
        existing_analysis = saved_data[video_id].get('analysis', {})
        if 'beat_times' in existing_analysis and existing_analysis['beat_times']:
            analysis = existing_analysis
            # Update title if we have a better one now
            if title and title != "Unknown Title":
                saved_data[video_id]['title'] = title

    if not analysis:
        # No valid cached analysis, run fresh
        analysis = analyze_audio(file_path)
        if not analysis:
            return jsonify({'error': 'Analysis failed'}), 500
        
    # 3. Get Lyrics
    if custom_lyrics and custom_lyrics.strip():
        lyrics = custom_lyrics.strip()
    else:
        lyrics = get_lyrics(video_id)
    
    # 4. Generate Map
    beat_map, difficulty = generate_beat_map(analysis, lyrics, monotone_factor, case_sensitive, include_spaces)
    
    # Prepare analysis for storage (strip heavy lists)
    storage_analysis = {
        'bpm': analysis['bpm'],
        'duration': analysis['duration'],
        'beat_times': analysis['beat_times'], # Keep for re-generation
        'onset_times': analysis['onset_times'] # Keep for re-generation
    }
    
    # Save Data
    song_info = {
        'title': title if title else saved_data.get(video_id, {}).get('title', f"Song {video_id}"),
        'thumbnail': f"https://img.youtube.com/vi/{video_id}/0.jpg",
        'analysis': storage_analysis,
        'beat_map': beat_map,
        'difficulty': difficulty,
        'duration': analysis['duration']
    }
    
    saved_data[video_id] = song_info
    save_data(saved_data)
    
    return jsonify({
        'status': 'success',
        'video_id': video_id
    })



@app.route('/favicon.ico')
def favicon():
    return '', 204

if __name__ == '__main__':
    try:
        print("Starting server...")
        import os
        port = int(os.environ.get('PORT', 8000))
        debug = not os.environ.get('RENDER')
        print("About to run socketio...")
        socketio.run(app, host='0.0.0.0', port=port, debug=debug)
    except Exception as e:
        print("CRASHED:", e)
        raise

