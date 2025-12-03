import random
import numpy as np

def generate_beat_map(analysis_data, lyrics_text=None):
    """
    Generates a list of notes based on audio analysis and lyrics.
    Returns a tuple: (notes_list, difficulty_score)
    """
    if not analysis_data:
        return [], 1

    beat_times = np.array(analysis_data.get('beat_times', []))
    onset_times = np.array(analysis_data.get('onset_times', []))
    
    combined_times = []
    
    # Add all beats
    for t in beat_times:
        combined_times.append(t)
        
    # Add onsets with much lower probability for "monotone" feel
    # Only add very strong onsets or just keep it simple
    threshold = 0.1
    
    for onset in onset_times:
        if len(beat_times) > 0:
            dist = np.min(np.abs(beat_times - onset))
            if dist > threshold:
                # Reduced probability from 0.35 to 0.1 for less chaos
                # scale probability based on distance
                prob = (dist / threshold) / 3
                if random.random() < prob:
                    combined_times.append(onset)
                
    combined_times.sort()
    
    # Filter out times that are too close
    filtered_times = []
    last_t = -1
    min_gap = 0.15 # Back to 150ms to avoid super fast bursts
    
    for t in combined_times:
        if t - last_t > min_gap:
            filtered_times.append(t)
            last_t = t
            
    start_offset = 2.0
    valid_times = [t for t in filtered_times if t > start_offset]
    
    notes = []
    
    if lyrics_text:
        text_index = 0
        time_index = 0
        
        while time_index < len(valid_times):
            # Loop lyrics if we run out
            char = lyrics_text[text_index % len(lyrics_text)]
            
            if char == ' ':
                text_index += 1
                continue
                
            time = valid_times[time_index]
            
            notes.append({
                'time': time,
                'key': char.lower(),
                'char': char,
                'is_space': False
            })
            
            text_index += 1
            time_index += 1
            
    else:
        chars = "abcdefghijklmnopqrstuvwxyz"
        for t in valid_times:
            char = random.choice(chars)
            notes.append({
                'time': t,
                'key': char,
                'char': char.upper(),
                'is_space': False
            })
            
    # Calculate Difficulty
    duration = analysis_data.get('duration', 1)
    if duration <= 0: duration = 1
    
    # Notes Per Second
    nps = len(notes) / duration
    
    # Scale NPS to 1-5 stars
    # < 1.0 = 1 star
    # 1.0 - 2.0 = 2 stars
    # 2.0 - 3.0 = 3 stars
    # 3.0 - 4.5 = 4 stars
    # > 4.5 = 5 stars
    
    if nps < 1.0: difficulty = 1
    elif nps < 2.0: difficulty = 2
    elif nps < 3.0: difficulty = 3
    elif nps < 4.5: difficulty = 4
    else: difficulty = 5
        
    return notes, difficulty
