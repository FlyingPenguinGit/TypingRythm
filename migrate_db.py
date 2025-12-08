from app import app
from models import db, Song
import json
import os

DATA_FILE = 'songs_data.json'

def migrate():
    with app.app_context():
        # Create tables
        db.create_all()
        
        if not os.path.exists(DATA_FILE):
            print(f"No {DATA_FILE} found. Database initialized empty.")
            return

        with open(DATA_FILE, 'r') as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError:
                print(f"Error reading {DATA_FILE}")
                return

        print(f"Found {len(data)} songs in JSON.")
        
        for video_id, info in data.items():
            # Check if exists
            if Song.query.get(video_id):
                print(f"Skipping {video_id} (already exists)")
                continue
                
            beat_map = info.get('beat_map', {})
            analysis = info.get('analysis', {})
            
            # Extract lists safely
            beat_times = analysis.get('beat_times', [])
            onset_times = analysis.get('onset_times', [])
            
            # Read audio file if exists
            audio_data = None
            audio_path = os.path.join('static', 'songs', f"{video_id}.mp3")
            if os.path.exists(audio_path):
                try:
                    with open(audio_path, 'rb') as af:
                        audio_data = af.read()
                    print(f"  Loaded audio for {video_id} ({len(audio_data)} bytes)")
                except Exception as e:
                    print(f"  Failed to load audio for {video_id}: {e}")

            song = Song(
                id=video_id,
                title=info.get('title', 'Unknown Title'),
                thumbnail_url=info.get('thumbnail', ''),
                duration=info.get('duration', 0),
                bpm=float(analysis.get('bpm', 0)),
                difficulty=info.get('difficulty', 1),
                beat_times=beat_times,
                onset_times=onset_times,
                beat_map=beat_map,
                case_sensitive=beat_map.get('case_sensitive', False),
                include_spaces=beat_map.get('include_spaces', False),
                audio_file=audio_data
            )
            db.session.add(song)
            print(f"Added {song.title}")

        db.session.commit()
        print("Migration complete!")

if __name__ == '__main__':
    migrate()
