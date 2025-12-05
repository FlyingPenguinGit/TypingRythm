import os
import yt_dlp
import librosa
import numpy as np
from pydub import AudioSegment

# Configuration
STATIC_SONGS_FOLDER = 'static/songs'

def ensure_dirs():
    if not os.path.exists(STATIC_SONGS_FOLDER):
        os.makedirs(STATIC_SONGS_FOLDER)

def download_audio(youtube_url):
    """
    Downloads audio from a YouTube URL and converts it to MP3.
    Returns the path to the downloaded file, the video ID, and the video title.
    """
    ensure_dirs()
    
    # Extract video ID
    if "v=" in youtube_url:
        video_id = youtube_url.split("v=")[1].split("&")[0]
    elif "youtu.be/" in youtube_url:
        video_id = youtube_url.split("youtu.be/")[1].split("?")[0]
    else:
        video_id = "unknown_video"

    output_filename = f"{video_id}.mp3"
    output_path = os.path.join(STATIC_SONGS_FOLDER, output_filename)
    
    # We need to fetch info to get the title even if file exists
    # But yt-dlp might be slow if we just want title.
    # Let's assume if file exists we might not have title if we didn't save it before.
    # But app.py handles persistence.
    # So here we just return what we can.
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': os.path.join(STATIC_SONGS_FOLDER, f"{video_id}.%(ext)s"),
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'quiet': True,
        'no_warnings': True,
    }

    # Check for cookies.txt to avoid bot detection (Render.com fix)
    cookies_path = os.path.join(os.path.dirname(__file__), "cookies.txt")
    print("Exists:", os.path.exists(cookies_path))

    if os.path.exists(cookies_path):
        ydl_opts['cookiefile'] = cookies_path
        print(f"Using cookies from {cookies_path}")

    title = "Unknown Title"

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Get info first
            info = ydl.extract_info(youtube_url, download=False)
            title = info.get('title', 'Unknown Title')
            
            # Download if not exists
            if not os.path.exists(output_path):
                ydl.download([youtube_url])
                
        return output_path, video_id, title
    except Exception as e:
        print(f"Error downloading {youtube_url}: {e}")
        return None, None, None

def analyze_audio(file_path):
    """
    Analyzes the audio file to detect BPM and beat onsets.
    Returns a dictionary with analysis data.
    """
    try:
        y, sr = librosa.load(file_path, sr=22050)
        
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)
        
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        onset_frames = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr)
        onset_times = librosa.frames_to_time(onset_frames, sr=sr)

        return {
            'bpm': float(tempo),
            'beat_times': beat_times.tolist(),
            'onset_times': onset_times.tolist(),
            'duration': librosa.get_duration(y=y, sr=sr)
        }
    except Exception as e:
        print(f"Error analyzing audio: {e}")
        return None
