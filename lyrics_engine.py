import os
import re
import random

LYRICS_FOLDER = 'lyrics'

FALLBACK_LYRICS = [
    "The quick brown fox jumps over the lazy dog",
    "To be or not to be that is the question",
    "All that glitters is not gold",
    "I wandered lonely as a cloud",
    "Shall I compare thee to a summer's day",
    "Hope is the thing with feathers",
    "Do not go gentle into that good night",
    "Two roads diverged in a yellow wood",
    "Tyger Tyger burning bright",
    "O Captain my Captain our fearful trip is done",
    "In the middle of the journey of our life",
    "I saw the best minds of my generation destroyed by madness",
    "It was the best of times it was the worst of times",
    "Call me Ishmael",
    "It is a truth universally acknowledged",
    "Happy families are all alike every unhappy family is unhappy in its own way"
]

def ensure_lyrics_dir():
    if not os.path.exists(LYRICS_FOLDER):
        os.makedirs(LYRICS_FOLDER)

def get_lyrics(video_id):
    """
    Tries to load lyrics from a .txt file in the lyrics folder.
    Returns the lyrics string or a random fallback if not found.
    Filters out metadata like [Verse 1].
    """
    ensure_lyrics_dir()
    path = os.path.join(LYRICS_FOLDER, f"{video_id}.txt")
    
    text = ""
    
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                text = f.read()
        except Exception as e:
            print(f"Error reading lyrics for {video_id}: {e}")
            text = random.choice(FALLBACK_LYRICS)
    else:
        # Try to pick a random lyrics file from the static/lyrics folder
        try:
            static_lyrics_dir = os.path.join('static', 'lyrics')
            if os.path.exists(static_lyrics_dir):
                files = [f for f in os.listdir(static_lyrics_dir) if f.endswith('.txt')]
                if files:
                    random_file = random.choice(files)
                    with open(os.path.join(static_lyrics_dir, random_file), 'r', encoding='utf-8') as f:
                        text = f.read()
                else:
                    text = random.choice(FALLBACK_LYRICS)
            else:
                text = random.choice(FALLBACK_LYRICS)
        except Exception as e:
            print(f"Error picking random lyrics: {e}")
            text = random.choice(FALLBACK_LYRICS)
        
    # Filter out [Verse 1], (Chorus), etc.
    # Remove content inside square brackets
    text = re.sub(r'\[.*?\]', '', text)
    
    # Clean up newlines and extra spaces
    text = text.replace('\n', ' ').strip()
    # Remove multiple spaces
    text = ' '.join(text.split())
    
    return text

def save_lyrics(video_id, text):
    ensure_lyrics_dir()
    path = os.path.join(LYRICS_FOLDER, f"{video_id}.txt")
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)
