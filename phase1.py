import pandas as pd
import numpy as np
import json
import uuid  
import random  
from datetime import datetime, timedelta

# --- 1. DATA LOADING ---
# Load the mock data tables we generated previously
try:
    df_users = pd.read_csv('users_rows_mock.csv')
    df_content = pd.read_csv('content_rows_mock.csv')
    df_notif = pd.read_csv('notifications_rows_mock.csv')
    df_wish = pd.read_csv('wishlist_rows_mock.csv')
    print("Mock data tables loaded successfully!")
except FileNotFoundError as e:
    print(f"Error loading files: {e}. Please ensure mock generation script was run.")

# --- 2. PRE-PROCESSING USER HISTORICAL ACTIONS (Sequence Tracking) ---
# Extract real bookings from notifications table to see what users actually did
df_bookings = df_notif[df_notif['type'] == 'booking'].copy()

# Parse the JSON payload inside the notification data column to get event titles
def get_event_title(json_str):
    try:
        return json.loads(json_str).get('content_title')
    except:
        return None

df_bookings['booked_event_title'] = df_bookings['data'].apply(get_event_title)

# Group booked events by user to track their historical sequences
user_booking_history = df_bookings.groupby('user_id')['booked_event_title'].apply(list).to_dict()

# --- 3. CORE RECOMMENDATION & SECURITY ENGINE ---
def calculate_recommendation_score(user_id, content_id):
    """
    Combines Phase 1 (Behavioral Scoring) and Phase 2 (Security Matrix) 
    based on the Director's specific business logic notes.
    """
    # Get user and content metadata
    user_row = df_users[df_users['id'] == user_id].iloc[0]
    content_row = df_content[df_content['id'] == content_id].iloc[0]
    
    user_role = user_row['role']
    content_title = content_row['title']
    
    # Parse tags from json string format
    content_tags = json.loads(content_row['tags'])
    user_preferred_tags = json.loads(user_row['preferred_tags'])
    
    # Initialize base score
    score = 0.0
    
    # --- RULE A: User Role Grading & Security Matrix ---
    # DIRECTOR'S NOTE: "some restriction for general usage (gp)"
    if user_role == "GRAND_PUBLIC":
        # Block GP users from accessing premium B2B Networking spaces completely
        if "B2B_NETWORKING" in content_tags:
            return 0.0  # Security block: Hard drop to 0
            
    # --- RULE B: Must-See / Must-Book Logic ---
    # DIRECTOR'S NOTE: "must book -> jury (according to the role)"
    # Note: PRO and DECISION_MAKER acts as the 'Jury' profile in our system
    if user_role in ["PRO", "DECISION_MAKER"]:
        if "B2B_NETWORKING" in content_tags or "CREATOR_TALK" in content_tags:
            # Check if they already booked it
            user_history = user_booking_history.get(user_id, [])
            if content_title not in user_history:
                # They MUST book this, so boost the score significantly to push it to the top
                score += 150.0 

    # --- RULE C: Conditional Behavior Sequence Validation ---
    # DIRECTOR'S NOTE: "must -> the first x event then y event"
    user_history = user_booking_history.get(user_id, [])
    
    # CONDITIONAL BEHAVIOR: If user already booked a VR Experience (X), boost Creator Talks (Y)
    if "VR_EXPERIENCE" in user_preferred_tags and "CREATOR_TALK" in content_tags:
        # Check if they have at least one booking in history (simulating sequence completion)
        if len(user_history) > 0:
            score += 40.0 # Reward sequence pattern alignment
            
    # --- RULE D: General Alignment (Base Match) ---
    # Check if the content tag matches user's general profile preferences
    for tag in content_tags:
        if tag in user_preferred_tags:
            score += 25.0
            
    return score

# --- 4. TEST THE MATRIX ENGINE WITH A RANDOM USER ---
# Use .sample() to pick a completely random user every time you run the script
random_user_row = df_users.sample(n=1).iloc[0]
sample_user_id = random_user_row['id']
sample_user_role = random_user_row['role']

print(f"\n--- TESTING REC ENGINE FOR USER ROLE: {sample_user_role} ---")
print(f"User ID: {sample_user_id}")

recommendations = []
for c_id in df_content['id'].unique():
    c_title = df_content[df_content['id'] == c_id]['title'].iloc[0]
    final_score = calculate_recommendation_score(sample_user_id, c_id)
    recommendations.append({"Content": c_title, "Score": final_score})

# Display top results
df_res = pd.DataFrame(recommendations).sort_values(by="Score", ascending=False)
print(df_res.head(10).to_string(index=False))




# =====================================================================
# --- PHASE 2: CONTENT SCORING & FEATURE ENGINEERING INTEGRATION ---
# =====================================================================

# --- 5. UPDATING CONTENT POOL WITH REAL FESTIVAL EXPERIENCES ---
# Map the real content data with their extracted feature tags
real_festival_contents = [
    {"title": "Empathy Creatures", "tags": json.dumps(["SENSORY_WELLNESS", "VR_EXPERIENCE"])},
    {"title": "A song within us", "tags": json.dumps(["ART_CULTURE", "VR_EXPERIENCE"])},
    {"title": "The eye and I", "tags": json.dumps(["SOCIETY_TECH", "VR_EXPERIENCE"])},
    {"title": "Épanouir", "tags": json.dumps(["SENSORY_WELLNESS", "VR_EXPERIENCE"])},
    {"title": "Care", "tags": json.dumps(["SENSORY_WELLNESS", "AR_STAND"])},
    {"title": "Jailbirds", "tags": json.dumps(["SOCIETY_TECH", "CREATOR_TALK"])},
    {"title": "Mandala", "tags": json.dumps(["TECH_DISCOVERY", "AR_STAND"])},
    {"title": "Mechanical Souls", "tags": json.dumps(["SOCIETY_TECH", "VR_EXPERIENCE"])}
]

# Create a temporary DataFrame for the new real contents
df_real_content = pd.DataFrame(real_festival_contents)
df_real_content['id'] = [str(uuid.uuid4()) for _ in range(len(df_real_content))]
df_real_content['capacity'] = [random.choice([5, 10, 20]) for _ in range(len(df_real_content))]

# --- FIX: Define FESTIVAL_ID right here to prevent NameError ---
LOCAL_FESTIVAL_ID = "9d27df3c-60b3-4efe-98ef-c035a3d63c9b"
df_real_content['festival_id'] = LOCAL_FESTIVAL_ID

# --- 6. SIMULATING USER KEYWORD RATINGS (1 to 5 Stars Choice) ---
# Global keywords displayed on the user's mobile/web app onboarding profile screen
global_keywords = ["SENSORY_WELLNESS", "ART_CULTURE", "SOCIETY_TECH", "TECH_DISCOVERY"]

def generate_user_keyword_ratings():
    """Simulates the 1-5 star preference matrix filled by the user on the app"""
    return {keyword: random.randint(1, 5) for keyword in global_keywords}

# --- 7. ADVANCED HYBRID SCORING ENGINE (Phase 1 + Phase 2) ---
def calculate_advanced_hybrid_score(user_id, content_row, user_ratings):
    """
    Combines Phase 1 rules (Security restrictions + Historical actions)
    with Phase 2 features (1-5 Stars onboarding keyword preferences).
    """
    user_row = df_users[df_users['id'] == user_id].iloc[0]
    user_role = user_row['role']
    
    content_tags = json.loads(content_row['tags'])
    content_title = content_row['title']
    user_preferred_tags = json.loads(user_row['preferred_tags'])
    
    # --- Part A: Keep Phase 1 Rules (Security and Core Logic) ---
    # Restriction for General Usage (GP)
    if user_role == "GRAND_PUBLIC" and "B2B_NETWORKING" in content_tags:
        return 0.0
        
    base_phase1_score = 0.0
    
    # Jury 'Must-Book' logic simulation
    if user_role in ["PRO", "DECISION_MAKER"] and ("B2B_NETWORKING" in content_tags or "CREATOR_TALK" in content_tags):
        user_history = user_booking_history.get(user_id, [])
        if content_title not in user_history:
            base_phase1_score += 150.0
            
    # Sequence Check (X then Y)
    user_history = user_booking_history.get(user_id, [])
    if "VR_EXPERIENCE" in user_preferred_tags and "CREATOR_TALK" in content_tags and len(user_history) > 0:
        base_phase1_score += 40.0
        
    # Standard tag matching alignment
    for tag in content_tags:
        if tag in user_preferred_tags:
            base_phase1_score += 25.0
            
    # --- Part B: Feature Engineering - Content Keyword User Ratings (Phase 2) ---
    keyword_score_boost = 0.0
    for tag in content_tags:
        if tag in user_ratings:
            # Multiply the star rating (1-5) by a weight factor (e.g., 15 points per star)
            keyword_score_boost += user_ratings[tag] * 15.0
            
    # Total hybrid fusion score
    return base_phase1_score + keyword_score_boost

# --- 8. LIVE TESTING THE HYBRID PHASE 2 ENGINE ---
# Select a new random test user from the database
test_user_row = df_users.sample(n=1).iloc[0]
test_user_id = test_user_row['id']
test_user_role = test_user_row['role']

# Simulate this specific user selecting their 1-5 star interests on the app UI
simulated_user_ratings = generate_user_keyword_ratings()

print("\n" + "="*60)
print(f"--- PHASE 2 TEST: ADVANCED HYBRID MATCHING ENGINE ---")
print(f"Target User Role: {test_user_role}")
print(f"User Onboarding Star Ratings (1-5): {simulated_user_ratings}")
print("="*60)

hybrid_recommendations = []
for idx, row in df_real_content.iterrows():
    final_hybrid_score = calculate_advanced_hybrid_score(test_user_id, row, simulated_user_ratings)
    hybrid_recommendations.append({
        "Real Festival Content": row['title'], 
        "Assigned Tags": json.loads(row['tags']),
        "Final Hybrid Score": final_hybrid_score
    })

# Convert results and display sorted recommendation dashboard output
df_hybrid_res = pd.DataFrame(hybrid_recommendations).sort_values(by="Final Hybrid Score", ascending=False)
print(df_hybrid_res.to_string(index=False))


# =====================================================================
# --- PHASE 2: INTERACTIVE LIVE USER TEST (YES/NO FILTERING + 1-5 STARS) ---
# =====================================================================

def ask_yes_no_question(question):
    """Helper function to get yes/no responses from user"""
    while True:
        response = input(f"{question} (yes/no): ").strip().lower()
        if response in ['yes', 'y']:
            return True
        elif response in ['no', 'n']:
            return False
        print("❌ Please enter 'yes' or 'no'")

# Category descriptions for user-friendly questions
category_descriptions = {
    "SENSORY_WELLNESS": "Sensory & Wellness Experiences (relaxation, mindfulness, wellbeing)",
    "ART_CULTURE": "Art & Culture (creative, artistic expressions)",
    "SOCIETY_TECH": "Society & Technology (social impact, tech discovery)",
    "TECH_DISCOVERY": "Technology Discovery (innovation, interactive technology)"
}

# === STEP 1: Welcome Message ===
print("\n" + "="*70)
print("🎉 Welcome to Festival Experience Finder")
print("="*70)
print("\nAI Assistant: Hello! What kinds of experiences are you most interested")
print("in at the festival? This will help me show you personalized recommendations!\n")
print("-"*70 + "\n")

# === STEP 2: Ask Yes/No Questions + Immediate Rating for Each Category ===
print("📋 Let's start with a few quick questions:\n")

interested_categories = {}
live_user_ratings = {}

for category, description in category_descriptions.items():
    is_interested = ask_yes_no_question(f"   Are you interested in: {description}?")
    
    if is_interested:
        # If yes, immediately ask for rating (1-5 stars)
        while True:
            try:
                user_input = input(f"   → Rate this (1-5 stars): ")
                stars = int(user_input)
                if 1 <= stars <= 5:
                    interested_categories[category] = True
                    live_user_ratings[category] = stars
                    break
                else:
                    print("   ❌ Please enter a number between 1 and 5.")
            except ValueError:
                print("   ❌ Invalid input. Please enter a number.")
    else:
        interested_categories[category] = False
        live_user_ratings[category] = 0
    
    print()

# === STEP 3: Summary Before Recommendations ===
print("\n" + "="*70)
print("📊 SUMMARY:")
print("="*70)
print("Selected Categories:")
for category, is_int in interested_categories.items():
    if is_int:
        status = f"✅ {live_user_ratings[category]} ⭐"
        print(f"   {status} - {category_descriptions[category]}")

# Pick a random user profile from the database to apply role/security matrix
live_test_user = df_users.sample(n=1).iloc[0]
live_user_id = live_test_user['id']
live_user_role = live_test_user['role']

print(f"\nUser Role: {live_user_role}")
print("-"*70)

# Calculate the live hybrid scores based on your inputs
live_recommendations = []
for idx, row in df_real_content.iterrows():
    final_hybrid_score = calculate_advanced_hybrid_score(live_user_id, row, live_user_ratings)
    live_recommendations.append({
        "Real Festival Content": row['title'], 
        "Assigned Tags": json.loads(row['tags']),
        "Your Custom Hybrid Score": final_hybrid_score
    })

# Convert results and display sorted recommendation dashboard output
df_live_res = pd.DataFrame(live_recommendations).sort_values(by="Your Custom Hybrid Score", ascending=False)
print("\n🎯 YOUR PERSONALIZED RECOMMENDATIONS:")
print(df_live_res.to_string(index=False))
print("="*70)