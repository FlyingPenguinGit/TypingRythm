import os
import json
from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO
from audio_engine import download_audio, analyze_audio
from game_engine import generate_beat_map
from lyrics_engine import get_lyrics, save_lyrics
from models import db, Song
from sqlalchemy.orm import defer

print("App is starting...")

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
ADMIN_PASSWORD = "AdminPassword"

# Database Configuration
NEON_DB_URL = "postgresql://neondb_owner:npg_VeCxmEHWdo74@ep-polished-sound-agenwmn6-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require"

db_url = os.environ.get('DATABASE_URL') or NEON_DB_URL

if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

app.config['SQLALCHEMY_DATABASE_URI'] = db_url

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)
socketio = SocketIO(app, cors_allowed_origins="*")


@app.route('/')
def menu():
    is_admin = False
    request_auth = False
    
    if request.args.get('admin') == 'true':
        if session.get('admin_authenticated'):
            is_admin = True
        else:
            request_auth = True
            
    # Optimize: Don't load audio_file for menu listing
    songs = Song.query.options(defer(Song.audio_file)).all()
    songs_list = [song.to_dict() for song in songs]
    return render_template('menu.html', songs=songs_list, is_admin=is_admin, request_auth=request_auth)

@app.route('/login_admin', methods=['POST'])
def login_admin():
    data = request.json
    print(data.get('password'))
    print(ADMIN_PASSWORD)
    if data.get('password') == ADMIN_PASSWORD:
        session['admin_authenticated'] = True
        return jsonify({'status': 'success'})
    return jsonify({'status': 'error', 'message': 'Invalid password'}), 401

@app.route('/game/<video_id>')
def game(video_id):
    song = Song.query.get_or_404(video_id)
    
    # Check if audio file exists
    file_path = os.path.join('static/songs', f"{video_id}.mp3")
    if not os.path.exists(file_path):
        print(f"Audio for {video_id} missing. Downloading...")
        youtube_url = f"https://www.youtube.com/watch?v={video_id}"
        
        path, _, _ = download_audio(youtube_url)
        if not path:
             return "Error: Could not recover audio file", 500
             
    # Practice Mode Params
    practice_mode = request.args.get('practice') == 'true'
    speed = float(request.args.get('speed', 1.0))
    start_time = float(request.args.get('start', 0.0))

    return render_template('game.html', song_data=song.to_dict(), practice_mode=practice_mode, speed=speed, start_time=start_time)

@app.route('/delete_song/<video_id>', methods=['DELETE'])
def delete_song(video_id):
    song = Song.query.get_or_404(video_id)
    db.session.delete(song)
    db.session.commit()
    return jsonify({'status': 'success'})

@app.route('/regenerate_beatmap/<video_id>', methods=['POST'])
def regenerate_beatmap(video_id):
    song = Song.query.get_or_404(video_id)
    data = request.json or {}
    
    # Use provided preferences or defaults/stored
    monotone_factor_input = float(data.get('monotone_factor', 0.5))
    monotone_min = 0.1
    monotone_max = 0.8
    monotone_factor = monotone_min + (monotone_max - monotone_min) * monotone_factor_input
    
    case_sensitive = data.get('case_sensitive', song.case_sensitive)
    include_spaces = data.get('include_spaces', song.include_spaces)
    custom_lyrics = data.get('custom_lyrics', '')

    # Re-construct analysis data
    analysis = {
        'bpm': song.bpm,
        'duration': song.duration,
        'beat_times': song.beat_times,
        'onset_times': song.onset_times
    }

    # Get lyrics (cached or fresh or custom)
    if custom_lyrics and custom_lyrics.strip():
        lyrics = custom_lyrics.strip()
    else:
        lyrics = get_lyrics(video_id)
    
    # Generate Map
    beat_map, difficulty = generate_beat_map(analysis, lyrics, monotone_factor, case_sensitive, include_spaces)
    
    # Update DB
    song.beat_map = beat_map
    song.difficulty = difficulty
    db.session.commit()
    
    return jsonify({'status': 'success', 'video_id': video_id})


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
    
    # Check if we already have this song in DB
    existing_song = Song.query.get(video_id)
    
    analysis = None
    
    # Try to use existing analysis if available
    if existing_song:
        if existing_song.beat_times and existing_song.onset_times:
             analysis = {
                 'bpm': existing_song.bpm,
                 'duration': existing_song.duration,
                 'beat_times': existing_song.beat_times,
                 'onset_times': existing_song.onset_times
             }
             # Update title if better
             if title and title != "Unknown Title":
                 existing_song.title = title
    
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
    
    # Prepare data for DB
    if not existing_song:
        existing_song = Song(id=video_id)
        db.session.add(existing_song)
    
    existing_song.title = title if title else (existing_song.title if existing_song.title else f"Song {video_id}")
    existing_song.thumbnail_url = f"https://img.youtube.com/vi/{video_id}/0.jpg"
    existing_song.duration = analysis['duration']
    existing_song.bpm = analysis['bpm']
    existing_song.difficulty = difficulty
    existing_song.beat_times = analysis['beat_times']
    existing_song.onset_times = analysis['onset_times']
    existing_song.beat_map = beat_map
    existing_song.case_sensitive = case_sensitive
    existing_song.include_spaces = include_spaces
    
    db.session.commit()
    
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
        # Ensure context for DB creation if needed roughly, though better to use migrate script
        with app.app_context():
            db.create_all()
            
        import os
        port = int(os.environ.get('PORT', 8000))
        debug = not os.environ.get('RENDER')
        print("About to run socketio...")
        socketio.run(app, host='0.0.0.0', port=port, debug=debug)
    except Exception as e:
        print("CRASHED:", e)
        raise
