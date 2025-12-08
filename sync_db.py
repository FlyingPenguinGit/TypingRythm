import sys
import os
import json
from sqlalchemy import create_engine, MetaData, Table
from sqlalchemy.orm import sessionmaker
from app import app
from models import db, Song

def sync_to_remote(remote_url):
    print(f"Syncing to {remote_url}...")
    
    # 1. Get Local Data
    with app.app_context():
        local_songs = Song.query.all()
        print(f"Found {len(local_songs)} songs locally.")
        local_data = [s.to_dict() for s in local_songs] # This returns dicts, but we need ORM objects or raw insert

        # Better: keep them bound or detach them?
        # Let's just read the attribute values we need to copy
        
        songs_to_push = []
        for s in local_songs:
            songs_to_push.append({
                'id': s.id,
                'title': s.title,
                'thumbnail_url': s.thumbnail_url,
                'duration': s.duration,
                'bpm': s.bpm,
                'difficulty': s.difficulty,
                'beat_times': json.dumps(s.beat_times),
                'onset_times': json.dumps(s.onset_times),
                'beat_map': json.dumps(s.beat_map),
                'case_sensitive': s.case_sensitive,
                'include_spaces': s.include_spaces,
                'date_added': s.date_added,
                'audio_file': s.audio_file
            })

    # 2. Connect to Remote
    if remote_url.startswith("postgres://"):
        remote_url = remote_url.replace("postgres://", "postgresql://")
        
    remote_engine = create_engine(remote_url)
    Session = sessionmaker(bind=remote_engine)
    remote_session = Session()
    
    # 3. Reflect Remote Table
    try:
        # Check if table exists, if not create
        db.metadata.create_all(remote_engine)
        print("Remote tables verified/created.")
        
        count = 0 
        for song_data in songs_to_push:
            # Check if exists
            from sqlalchemy import text
            existing = remote_session.execute(
                text("SELECT id FROM song WHERE id = :id"), 
                {'id': song_data['id']}
            ).fetchone()
            
            if existing:
                print(f"Updating {song_data['title']}...")
                # Update
                update_stmt = text("""
                    UPDATE song SET 
                        title=:title, thumbnail_url=:thumbnail_url, duration=:duration, 
                        bpm=:bpm, difficulty=:difficulty, beat_times=:beat_times, 
                        onset_times=:onset_times, beat_map=:beat_map, 
                        case_sensitive=:case_sensitive, include_spaces=:include_spaces,
                        audio_file=:audio_file
                    WHERE id=:id
                """)
                remote_session.execute(update_stmt, song_data)
            else:
                print(f"Inserting {song_data['title']}...")
                # Insert
                insert_stmt = text("""
                    INSERT INTO song (
                        id, title, thumbnail_url, duration, bpm, difficulty, 
                        beat_times, onset_times, beat_map, case_sensitive, include_spaces, date_added, audio_file
                    ) VALUES (
                        :id, :title, :thumbnail_url, :duration, :bpm, :difficulty, 
                        :beat_times, :onset_times, :beat_map, :case_sensitive, :include_spaces, :date_added, :audio_file
                    )
                """)
                remote_session.execute(insert_stmt, song_data)
            count += 1

            
        remote_session.commit()
        print(f"Successfully synced {count} songs.")
        
    except Exception as e:
        print(f"Error syncing: {e}")
        remote_session.rollback()
    finally:
        remote_session.close()

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python sync_db.py <remote_database_url>")
    else:
        sync_to_remote(sys.argv[1])
