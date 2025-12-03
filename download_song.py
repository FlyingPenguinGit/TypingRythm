import os
import yt_dlp

TEMP_DIR = 'temp_downloads'


def download_song(video_id):
    url = f"https://www.youtube.com/watch?v={video_id}"
    output_template = os.path.join(TEMP_DIR, f"{video_id}.%(ext)s")
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': output_template,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'quiet': True,
        'no_warnings': True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            ydl.download([url])
            return os.path.join(TEMP_DIR, f"{video_id}.mp3")
        except Exception as e:
            print(f"Error downloading {video_id}: {e}")
            return None

