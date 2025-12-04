import random
import numpy as np

def generate_beat_map(analysis_data, lyrics_text=None, monotone_factor=0.5, case_sensitive=False):
    """
    Generates a list of notes based on audio analysis and lyrics.
    monotone_factor: 0.0 (chaotic) to 1.0 (strict beat only)
    case_sensitive: Boolean, if True, keeps original case.
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
        
    # Add onsets based on monotone_factor
    threshold = 0.1
    base_prob = 0.4 * (1.0 - monotone_factor)
    
    for onset in onset_times:
        if len(beat_times) > 0:
            dist = np.min(np.abs(beat_times - onset))
            if dist > threshold:
                prob = (dist / threshold) * base_prob
                if random.random() < prob:
                    combined_times.append(onset)
                
    combined_times.sort()
    
    # Filter out times that are too close
    filtered_times = []
    last_t = -1
    min_gap = 0.15 
    
    for t in combined_times:
        if t - last_t > min_gap:
            filtered_times.append(t)
            last_t = t
            
    start_offset = 2.0
    valid_times = [t for t in filtered_times if t > start_offset]
    
    notes = []
    
    # Process lyrics
    if lyrics_text:
        # Remove newlines and extra spaces
        clean_text = " ".join(lyrics_text.split())
        
        # Handle case sensitivity
        if not case_sensitive:
            clean_text = clean_text.upper()
            
        # Filter only alphanumeric characters for the game (and spaces if we wanted, but logic below skips spaces)
        # Actually, let's keep the text as is but skip non-game chars in the loop
        
        text_index = 0
        time_index = 0
        
        # Create a clean list of chars to map
        # We now include spaces if they exist in the clean_text (which they do because we used " ".join)
        # But we need to make sure we don't filter them out
        chars_to_map = [c for c in clean_text if c.isalnum() or c.isspace()]
        
        if not chars_to_map:
             chars_to_map = ["A"] # Fallback
             
        while time_index < len(valid_times):
            char = chars_to_map[text_index % len(chars_to_map)]
            
            # Skip multiple spaces if any (though " ".join handles most)
            # But we want to map spaces to notes now
            
            time = valid_times[time_index]
            
            notes.append({
                'time': time,
                'key': char if case_sensitive else char.lower(), 
                'char': char, 
                'is_space': char == ' '
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
                'char': char if case_sensitive else char.upper(),
                'is_space': False
            })
            
    # Calculate Difficulty
    duration = analysis_data.get('duration', 1)
    if duration <= 0: duration = 1
    
    nps = len(notes) / duration
    
    if nps < 1.0: difficulty = 1
    elif nps < 2.0: difficulty = 2
    elif nps < 3.0: difficulty = 3
    elif nps < 4.5: difficulty = 4
    else: difficulty = 5
        
    return {
        'notes': notes,
        'difficulty': difficulty,
        'case_sensitive': case_sensitive
    }, difficulty
