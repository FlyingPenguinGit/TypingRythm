import random
import numpy as np

def generate_beat_map(analysis_data, lyrics_text=None, monotone_factor=0.5, case_sensitive=False, include_spaces=True):
    """
    Generates a list of notes based on audio analysis and lyrics.
    monotone_factor: 0.0 (chaotic) to 1.0 (strict beat only)
    case_sensitive: Boolean, if True, keeps original case.
    include_spaces: Boolean, if True, includes space characters in the beatmap.
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
    base_prob = 0.55 * (1.0 - monotone_factor)
    added_counter = 0
    
    for onset in onset_times:
        if len(beat_times) > 0:
            dist = np.min(np.abs(beat_times - onset))
            if dist > threshold:
                prob = (dist / threshold) * base_prob
                if random.random() < prob:
                    added_counter += 1
                    combined_times.append(onset)
    if len(onset_times) > 0:
        print(f"{added_counter / len(onset_times) * 100} percent of off-beats were added")
    else:
        print("No onset times available for off-beats.")
                
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
            
        
        text_index = 0
        time_index = 0
        
        # Create a clean list of chars to map
        # Include spaces only if include_spaces is True
        if include_spaces:
            chars_to_map = [c for c in clean_text if c.isalnum() or c.isspace()]
        else:
            chars_to_map = [c for c in clean_text if c.isalnum()]
        
        if not chars_to_map:
             chars_to_map = ["A"] # Fallback
             
        while time_index < len(valid_times):
            char = chars_to_map[text_index % len(chars_to_map)]
            
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
    
    # 1. Density (NPS)
    nps = len(notes) / duration
    
    # 2. Complexity (Interval Jitter)
    # Calculate time differences between notes
    intervals = []
    for i in range(1, len(notes)):
        diff = notes[i]['time'] - notes[i-1]['time']
        intervals.append(diff)
        
    variance_score = 0
    if intervals:
        avg_interval = sum(intervals) / len(intervals)
        if avg_interval > 0:
            std_dev = np.std(intervals)
            # COV: Coefficient of Variation
            variance_score = std_dev / avg_interval
            
    # Base Score formulation
    # NPS is dominant. 
    score = nps * 1.0
    
    # Adjust for complexity (irregularity makes it harder)
    # If variance is high (e.g. > 0.5), boost score
    # We cap the boost to avoid it becoming too crazy
    complexity_mult = 1.0 + (min(variance_score, 1.0) * 0.3)
    score *= complexity_mult

    # 3. Mechanical Modifiers
    if case_sensitive:
        score *= 1.3 # 30% harder
    
    if include_spaces:
        score *= 1.1 # 10% harder

    # Mapping to 1-5 scale (adjusted thresholds)
    if score < 1.5: difficulty = 1
    elif score < 2.5: difficulty = 2
    elif score < 4.0: difficulty = 3
    elif score < 6.0: difficulty = 4
    else: difficulty = 5
        
    return {
        'notes': notes,
        'difficulty': difficulty,
        'case_sensitive': case_sensitive,
        'include_spaces': include_spaces
    }, difficulty

def generate_zen_text(word_count=50):
    """
    Generates a string of random words.
    """
    words = [
        "time", "year", "people", "way", "day", "man", "thing", "woman", "life", "child", "world", "school", 
        "state", "family", "student", "group", "country", "problem", "hand", "part", "place", "case", "week", 
        "company", "system", "program", "question", "work", "government", "number", "night", "point", "home", 
        "water", "room", "mother", "area", "money", "story", "fact", "month", "lot", "right", "study", "book", 
        "eye", "job", "word", "business", "issue", "side", "kind", "head", "house", "service", "friend", 
        "father", "power", "hour", "game", "line", "end", "member", "law", "car", "city", "community", "name", 
        "president", "team", "minute", "idea", "kid", "body", "information", "back", "parent", "face", "others", 
        "level", "office", "door", "health", "person", "art", "war", "history", "party", "result", "change", 
        "morning", "reason", "research", "girl", "guy", "moment", "air", "teacher", "force", "education"
    ]
    
    selected_words = []
    for _ in range(word_count):
        selected_words.append(random.choice(words))
        
    return " ".join(selected_words)
