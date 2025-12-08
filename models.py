from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import json

db = SQLAlchemy()

class Song(db.Model):
    id = db.Column(db.String(50), primary_key=True)  # YouTube Video ID
    title = db.Column(db.String(255), nullable=False)
    thumbnail_url = db.Column(db.String(255))
    duration = db.Column(db.Float)
    bpm = db.Column(db.Float)
    difficulty = db.Column(db.Float)
    audio_file = db.Column(db.LargeBinary)
    
    # Storing large arrays/dicts as JSON
    beat_times = db.Column(db.JSON)  # List of floats
    onset_times = db.Column(db.JSON) # List of floats
    beat_map = db.Column(db.JSON)    # Full beatmap object
    
    case_sensitive = db.Column(db.Boolean, default=False)
    include_spaces = db.Column(db.Boolean, default=False)
    
    date_added = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'thumbnail': self.thumbnail_url,
            'duration': self.duration,
            'bpm': self.bpm,
            'difficulty': self.difficulty,
            'case_sensitive': self.case_sensitive,
            'include_spaces': self.include_spaces,
            'beat_map': self.beat_map,
             # Return analysis-like structure for compatibility if needed
            'analysis': {
                'bpm': self.bpm,
                'duration': self.duration,
                'beat_times': self.beat_times,
                'onset_times': self.onset_times
            }
        }
