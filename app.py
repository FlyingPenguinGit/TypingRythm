import os
import json
import tempfile
from flask import Flask, render_template, request, jsonify, session, Response
from flask_socketio import SocketIO
from audio_engine import download_audio, analyze_audio
from game_engine import generate_beat_map, map_lyrics_to_beats, calculate_difficulty
from lyrics_engine import get_lyrics, save_lyrics
from models import db, Song
from sqlalchemy.orm import defer
from functools import lru_cache
from datetime import datetime

print("App is starting...")

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
ADMIN_PASSWORD = "AdminPassword"

# Database Configuration
SUPABASE_DB_URL = "postgresql://postgres:1TWESCSkjOFI978e@db.xyxqrcypdzbolgfvcfjq.supabase.co:5432/postgres"

db_url = os.environ.get('DATABASE_URL') or SUPABASE_DB_URL

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
    songs = Song.query.options(defer(Song.audio_file), defer(Song.beat_times), defer(Song.onset_times), defer(Song.beat_map)).all()
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
    song = Song.query.options(defer(Song.audio_file), defer(Song.beat_times), defer(Song.onset_times)).get_or_404(video_id)
    
    # Check if audio file exists in the database
    if not song.audio_file:
        print(f"Audio for {video_id} missing in DB. Downloading...")
        youtube_url = f"https://www.youtube.com/watch?v={video_id}"
        
        # Assuming download_audio now returns the audio content (bytes)
        # and potentially saves it to disk if that's still desired for caching
        # or it could be modified to directly return bytes for DB storage.
        # For this refactoring, we'll assume it returns bytes.
        return "Audio not found", 404
        audio_content = download_audio_to_bytes(youtube_url) # Renamed to clarify
        
        if not audio_content:
             return "Error: Could not recover audio file", 500
        
        song.audio_file = audio_content
        db.session.commit()
             
    # Practice Mode Params
    practice_mode = request.args.get('practice') == 'true'
    speed = float(request.args.get('speed', 1.0))
    start_time = float(request.args.get('start', 0.0))

    # The template will now need an endpoint to serve the audio from the DB
    # or the audio_file itself (if small enough and handled by to_dict)
    # For large files, an endpoint is better.
    # Assuming song.to_dict() is updated to provide an audio_url pointing to /audio/<video_id>
    return render_template('game.html', song_data=song.to_dict(), practice_mode=practice_mode, speed=speed, start_time=start_time)

@app.route('/zen_game/<video_id>')
def zen_game(video_id):
    song = Song.query.options(defer(Song.beat_map), defer(Song.audio_file)).get_or_404(video_id)
    
    # Pass song data with beat/onset times - word generation happens in JS
    song_data = song.to_dict()
    
    # Remove the pre-generated beatmap since we'll generate words dynamically in JS
    if 'beat_map' in song_data:
        del song_data['beat_map']
    
    return render_template('zen_game.html', song_data=song_data)

@app.route('/editor/<video_id>')
def editor(video_id):
    song = Song.query.options(defer(Song.audio_file)).get_or_404(video_id)

    # Check for missing analysis data and regenerate if needed
    if not song.onset_times or not song.beat_times:
        print(f"Missing analysis data for {video_id} in editor, re-analyzing...")
        # Need to reload the song WITH audio_file since it was deferred
        song_with_audio = Song.query.get(video_id)
        if song_with_audio and song_with_audio.audio_file:
             with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
                tmp.write(song_with_audio.audio_file)
                tmp_path = tmp.name
            
             try:
                analysis_data = analyze_audio(tmp_path)
                if analysis_data:
                    song.bpm = analysis_data['bpm']
                    song.beat_times = analysis_data['beat_times']
                    song.onset_times = analysis_data['onset_times']
                    song.duration = analysis_data['duration']
                    db.session.commit()
             finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
    
    return render_template('editor.html', song_data=song.to_dict())

@app.route('/save_beatmap/<video_id>', methods=['POST'])
def save_beatmap(video_id):
    song = Song.query.options(defer(Song.audio_file)).get_or_404(video_id)
    data = request.json
    timestamps = data.get('timestamps', [])
    
    # Sort and unique timestamps ensuring they are floats
    timestamps = sorted(list(set([float(t) for t in timestamps])))
    
    # Get lyrics
    lyrics = get_lyrics(video_id)
    
    case_sensitive = song.case_sensitive
    include_spaces = song.include_spaces
    
    # Map lyrics
    notes = map_lyrics_to_beats(timestamps, lyrics, case_sensitive, include_spaces)
    
    # Calc diff
    difficulty = calculate_difficulty(notes, song.duration, case_sensitive)
    
    # Update Song
    song.beat_map = {
        'notes': notes,
        'difficulty': difficulty,
        'case_sensitive': case_sensitive,
        'include_spaces': include_spaces
    }
    song.difficulty = difficulty
    song.version = (song.version or 1) + 1
    
    db.session.commit()
    
    return jsonify({'status': 'success'})

# Cache audio blobs in memory
@lru_cache(maxsize=256)
def load_audio_blob(video_id):
    song = Song.query.options(
        defer(Song.beat_map),
        defer(Song.onset_times),
        defer(Song.beat_times)
    ).get(video_id)

    if song and song.audio_file:
        return song.audio_file
    return None


@app.route('/audio/<video_id>')
def serve_audio(video_id):

    data = load_audio_blob(video_id)

    if data is None:
        return "Audio not found", 404

    file_size = len(data)
    range_header = request.headers.get('Range', None)

    if range_header:
        # "bytes=START-END"
        byte1, byte2 = range_header.replace("bytes=", "").split("-")
        start = int(byte1)
        end = int(byte2) if byte2 else file_size - 1
        end = min(end, file_size - 1)

        chunk = data[start:end + 1]

        rv = Response(
            chunk,
            status=206,
            mimetype="audio/mpeg",
            direct_passthrough=True
        )

        rv.headers.add("Content-Range", f"bytes {start}-{end}/{file_size}")
        rv.headers.add("Accept-Ranges", "bytes")
        rv.headers.add("Content-Length", str(len(chunk)))
        return rv

    # Full request (no Range)
    rv = Response(
        data,
        status=200,
        mimetype="audio/mpeg",
        direct_passthrough=True
    )
    rv.headers.add("Accept-Ranges", "bytes")
    rv.headers.add("Content-Length", str(file_size))
    return rv


@app.route('/delete_song/<video_id>', methods=['DELETE'])
def delete_song(video_id):
    song = Song.query.get_or_404(video_id)
    db.session.delete(song)
    db.session.commit()
    return jsonify({'status': 'success'})

@app.route('/regenerate_beatmap/<video_id>', methods=['POST'])
def regenerate_beatmap(video_id):
    song = Song.query.options(defer(Song.beat_map)).get_or_404(video_id)
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
    # Check if analysis data is complete; if not, re-analyze
    if not song.onset_times or not song.beat_times:
        print(f"Missing analysis data for {video_id}, re-analyzing...")
        # Need to fetch audio data to re-analyze. 
        # Since we serve form DB, we might need a temp file or update AudioEngine to accept bytes.
        # But wait, AudioEngine.analyze_audio takes a file path.
        # Let's write the binary to a temp file.
        import tempfile
        import os
        import audio_engine

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp.write(song.audio_file)
            tmp_path = tmp.name
        
        try:
             # Re-run analysis
            analysis_data = audio_engine.analyze_audio(tmp_path)
            
            if analysis_data:
                # Update Song object with new data
                song.bpm = analysis_data['bpm']
                song.beat_times = analysis_data['beat_times']
                song.onset_times = analysis_data['onset_times']
                song.duration = analysis_data['duration']
            
                # Commit these updates so next time it's fast
                db.session.commit()
            
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

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
    song.version = (song.version or 1) + 1  # Increment version
    song.date_added = datetime.now()
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
    existing_song = db.session.get(Song, video_id)

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
        # Read audio bytes
        with open(file_path, "rb") as f:
            audio_bytes = f.read()

        # Optional: delete file after reading
        try:
            os.remove(file_path)
        except:
            pass

        # Check if we already have this song in DB
        existing_song = db.session.get(Song, video_id)
        if not existing_song:
            existing_song = Song(id=video_id)
            existing_song.audio_file = audio_bytes
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
