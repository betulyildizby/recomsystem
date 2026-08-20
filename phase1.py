import pandas as pd
import numpy as np
import json
import uuid  
import random  
import sys
import os
from datetime import datetime, timedelta
from pathlib import Path

# Ensure UTF-8 output encoding for Windows terminal
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parent


def load_csv(filename):
    candidates = [BASE_DIR / filename, Path.cwd() / filename]
    for path in candidates:
        if path.exists():
            return pd.read_csv(path)
    raise FileNotFoundError(f"Could not find {filename}. Checked: {', '.join(str(p) for p in candidates)}")


DATA_FILE_MAP = {
    'users': ['users_rows_mock.csv', 'users_rows.csv'],
    'content': ['content_rows_mock.csv', 'content_rows.csv'],
    'notif': ['notifications_rows_mock.csv', 'notifications_rows.csv'],
    'wish': ['wishlist_rows_mock.csv', 'wishlist_rows.csv'],
}


def load_dataset(key):
    for filename in DATA_FILE_MAP[key]:
        try:
            return load_csv(filename)
        except FileNotFoundError:
            continue
    raise FileNotFoundError(
        f"Could not find any file for '{key}'. Checked: {', '.join(DATA_FILE_MAP[key])}"
    )


def extract_title(json_str):
    try:
        if pd.isna(json_str):
            return None
        obj = json.loads(json_str)
        return obj.get('content_title') or obj.get('title')
    except Exception:
        return None


def parse_notification_json(row):
    try:
        if pd.isna(row.get('data')):
            return None, None
        obj = json.loads(row['data'])
        return obj.get('content_title') or obj.get('title'), obj.get('time')
    except Exception:
        return None, None


def ensure_event_titles(df_notif, df_content=None):
    df_notif = df_notif.copy()
    if 'event_title' not in df_notif.columns or df_notif['event_title'].isna().all():
        df_notif['event_title'] = df_notif['data'].apply(extract_title)
    return df_notif


def ensure_wishlist_titles(df_wish, df_content):
    df_wish = df_wish.copy()
    if 'event_title' not in df_wish.columns or df_wish['event_title'].isna().all():
        content_map = dict(zip(df_content['id'].astype(str).str.strip(), df_content['title']))
        df_wish['event_title'] = df_wish['content_id'].astype(str).str.strip().map(content_map)
    return df_wish


# --- V1 Analysis ---
def prepare_noshows(df_notif):
    df_noshows = df_notif[df_notif['type'].astype(str).str.contains('no_show', na=False)].copy()
    parsed = df_noshows.apply(parse_notification_json, axis=1)
    df_noshows[['event_title', 'event_time']] = pd.DataFrame(parsed.tolist(), index=df_noshows.index)
    df_noshows['created_at'] = pd.to_datetime(df_noshows['created_at'], errors='coerce')
    return df_noshows


def get_dubious_noshow_packets(df_noshows, count_threshold=10):
    df = df_noshows.copy()
    df['minute'] = df['created_at'].dt.floor('min')
    return (
        df.groupby(['minute', 'event_title'])
          .size()
          .reset_index(name='count')
          .query('count > @count_threshold')
          .sort_values(by='count', ascending=False)
    )


def get_noshow_distributions(df_noshows):
    df = df_noshows.copy()
    df['day_name'] = df['created_at'].dt.day_name()
    df['hour'] = df['created_at'].dt.hour
    return df['day_name'].value_counts(), df['hour'].value_counts().sort_index()


def build_aw_report(df_wish, df_content, df_noshows):
    wish_stats = df_wish.groupby('content_id').size().reset_index(name='wish_count')
    aw_analysis = pd.merge(
        wish_stats,
        df_content[['id', 'title', 'capacity']],
        left_on='content_id',
        right_on='id',
        how='left'
    )
    aw_analysis['aw_ratio'] = aw_analysis['wish_count'] / aw_analysis['capacity']
    event_noshow_counts = df_noshows['event_title'].value_counts().reset_index()
    event_noshow_counts.columns = ['title', 'noshow_count']
    return pd.merge(aw_analysis, event_noshow_counts, on='title', how='left').fillna(0)


def build_user_risk_report(df_noshows, df_users):
    user_noshow_stats = df_noshows.groupby('user_id').size().reset_index(name='notif_noshow_count')
    user_risk_report = pd.merge(
        user_noshow_stats,
        df_users[['id', 'full_name', 'role', 'strike_count']],
        left_on='user_id',
        right_on='id',
        how='left'
    )
    return user_risk_report.sort_values(by=['notif_noshow_count', 'strike_count'], ascending=False)


# --- V2 Analysis ---
def categorize_group(role):
    if pd.isna(role):
        return 'UNKNOWN'
    role_str = str(role).upper()
    if any(keyword in role_str for keyword in ['PRO', 'INSIDER', 'JURY', 'STAFF', 'SPEAKER']):
        return 'PRO'
    return 'GP'


def build_user_segmentation(df_notif, df_users):
    df_users_v2 = df_users[['id', 'role']].copy()
    df_users_v2['user_group'] = df_users_v2['role'].apply(categorize_group)
    df_full_v2 = pd.merge(df_notif, df_users_v2, left_on='user_id', right_on='id', how='left')
    df_full_v2['date'] = pd.to_datetime(df_full_v2['created_at'], errors='coerce').dt.date
    df_full_v2['event_title'] = df_full_v2['data'].apply(extract_title)
    return df_full_v2


def get_daily_metrics(df_subset):
    return df_subset.groupby('date').agg(
        nb_tickets=('id_x', 'count'),
        nb_events=('event_title', 'nunique'),
        nb_noshows=('type', lambda x: x.str.contains('no_show', na=False).sum()),
        nb_users=('user_id', 'nunique')
    )


# --- V3 Analysis ---
def build_behavioral_user_analysis(df_notif, df_users, df_wish, df_content):
    df_wish = ensure_wishlist_titles(df_wish, df_content)
    wishlist_by_user = (
        df_wish[['user_id', 'event_title']]
        .dropna(subset=['event_title'])
        .astype(str)
        .groupby('user_id')['event_title']
        .apply(lambda titles: set(titles.str.strip()))
        .to_dict()
    )

    behavioral_results = []
    for _, user in df_users.iterrows():
        u_id = str(user['id']).strip()
        all_wishlist_events = wishlist_by_user.get(u_id, set())
        actual_visits = set(
            df_notif[
                (df_notif['user_id'].astype(str).str.strip() == u_id) &
                (~df_notif['type'].astype(str).str.contains('no_show', na=False))
            ]['event_title']
            .dropna()
            .astype(str)
            .str.strip()
            .tolist()
        )

        if all_wishlist_events or actual_visits:
            matched = all_wishlist_events.intersection(actual_visits)
            missed = all_wishlist_events - actual_visits
            spontaneous = actual_visits - all_wishlist_events
            behavioral_results.append({
                'User ID': u_id,
                'Role': user.get('role', 'Unknown'),
                'Wishlist Count': len(all_wishlist_events),
                'Actual Visits': len(actual_visits),
                'Matched (Goal Achieved)': len(matched),
                'Missed (Planned but skipped)': len(missed),
                'Spontaneous (Surprise Visit)': len(spontaneous),
                'Plan Adherence (%)': round((len(matched) / len(all_wishlist_events) * 100), 1) if len(all_wishlist_events) > 0 else 0
            })
    return pd.DataFrame(behavioral_results)


def build_event_master_report(df_notif, df_wish, df_content):
    df_wish = ensure_wishlist_titles(df_wish, df_content)
    all_events = sorted(list(set(df_notif['event_title'].dropna().unique()) | set(df_wish['event_title'].dropna().unique())))
    master_data = []
    for event in all_events:
        if event == 'Unknown Event' or pd.isna(event):
            continue
        wish_u = set(df_wish[df_wish['event_title'] == event]['user_id'].astype(str))
        event_logs = df_notif[df_notif['event_title'] == event]
        visited_u = set(event_logs[~event_logs['type'].astype(str).str.contains('no_show', na=False)]['user_id'].astype(str))
        noshow_u = set(event_logs[event_logs['type'].astype(str).str.contains('no_show', na=False)]['user_id'].astype(str))
        master_data.append({
            'Event Title': event,
            'Wishlist Count': len(wish_u),
            'Consistent Visitors': len(wish_u.intersection(visited_u)),
            'Total No-Shows': len(noshow_u),
            'Toxic No-Shows (Wish + NoShow)': len(wish_u.intersection(noshow_u))
        })
    return pd.DataFrame(master_data).set_index('Event Title').sort_values(by='Wishlist Count', ascending=False)


def build_event_user_segments(df_notif, df_wish, df_content):
    df_wish = ensure_wishlist_titles(df_wish, df_content)
    all_events = sorted(list(set(df_notif['event_title'].dropna().unique()) | set(df_wish['event_title'].dropna().unique())))
    event_user_details = []
    for event in all_events:
        if event == 'Unknown Event' or pd.isna(event):
            continue
        wish_u = set(df_wish[df_wish['event_title'] == event]['user_id'].astype(str))
        event_logs = df_notif[df_notif['event_title'] == event]
        visited_u = set(event_logs[~event_logs['type'].astype(str).str.contains('no_show', na=False)]['user_id'].astype(str))
        noshow_u = set(event_logs[event_logs['type'].astype(str).str.contains('no_show', na=False)]['user_id'].astype(str))
        event_user_details.append({
            'Event Title': event,
            'Consistent IDs': ", ".join(sorted(wish_u.intersection(visited_u))) or 'None',
            'Toxic No-Show IDs': ", ".join(sorted(wish_u.intersection(noshow_u))) or 'None',
            'Spontaneous IDs': ", ".join(sorted(visited_u - wish_u)) or 'None',
            'Random No-Show IDs': ", ".join(sorted(noshow_u - wish_u)) or 'None'
        })
    return pd.DataFrame(event_user_details).set_index('Event Title')


def calculate_risk_score(df_notif, df_users):
    df_notif = df_notif.copy()
    df_notif['user_id'] = df_notif['user_id'].astype(str).str.strip()
    df_users = df_users.copy()
    df_users['id'] = df_users['id'].astype(str).str.strip()
    
    df_noshows = df_notif[df_notif['type'].astype(str).str.contains('no_show', na=False)]
    notif_counts = df_noshows.groupby('user_id').size().rename('current_noshows')
    user_risk_base = df_users[['id', 'strike_count']].set_index('id')
    df_risk = user_risk_base.join(notif_counts, how='left').fillna(0)
    df_risk['RiskScore'] = (df_risk['current_noshows'] * 2) + df_risk['strike_count']
    df_risk = df_risk.reset_index().rename(columns={'id': 'user_id'})
    return df_risk


# --- Data Loading & Initialization ---
def get_event_title(json_str):
    try:
        return json.loads(json_str).get('content_title')
    except Exception:
        return None


def load_all_data():
    df_users = load_dataset('users')
    df_content = load_dataset('content')
    df_notif = load_dataset('notif')
    df_wish = load_dataset('wish')
    return df_users, df_content, df_notif, df_wish


def init_data():
    df_users, df_content, df_notif, df_wish = load_all_data()
    df_users['id'] = df_users['id'].astype(str).str.strip()
    df_content['id'] = df_content['id'].astype(str).str.strip()
    df_notif['user_id'] = df_notif['user_id'].astype(str).str.strip()
    df_wish['user_id'] = df_wish['user_id'].astype(str).str.strip()
    df_wish['content_id'] = df_wish['content_id'].astype(str).str.strip()
    
    df_notif = ensure_event_titles(df_notif, df_content)
    df_wish = ensure_wishlist_titles(df_wish, df_content)
    return df_users, df_content, df_notif, df_wish


def build_user_booking_history(df_notif):
    df_bookings = df_notif[df_notif['type'] == 'booking'].copy()
    df_bookings['booked_event_title'] = df_bookings['data'].apply(get_event_title)
    return df_bookings.groupby('user_id')['booked_event_title'].apply(list).to_dict()


def analyze_user_history(user_id, df_notif, df_wish, df_users, df_content):
    user_id = str(user_id).strip()
    df_notif = ensure_event_titles(df_notif, df_content)
    df_wish = ensure_wishlist_titles(df_wish, df_content)

    df_user_noshows = prepare_noshows(df_notif)
    df_user_noshows = df_user_noshows[df_user_noshows['user_id'].astype(str).str.strip() == user_id]
    noshow_titles = (
        df_user_noshows['event_title']
        .dropna()
        .astype(str)
        .str.strip()
        .tolist()
    )

    df_user_wishlist = df_wish[df_wish['user_id'].astype(str).str.strip() == user_id]
    wishlist_titles = (
        df_user_wishlist['event_title']
        .dropna()
        .astype(str)
        .str.strip()
        .tolist()
    )
    wishlist_ids = (
        df_user_wishlist['content_id']
        .dropna()
        .astype(str)
        .str.strip()
        .tolist()
    )

    df_user_visits = df_notif[
        (df_notif['user_id'].astype(str).str.strip() == user_id) &
        (~df_notif['type'].astype(str).str.contains('no_show', na=False))
    ]
    visited_titles = (
        df_user_visits['event_title']
        .dropna()
        .astype(str)
        .str.strip()
        .tolist()
    )

    wishlist_set = set(wishlist_titles)
    visited_set = set(visited_titles)
    noshow_set = set(noshow_titles)
    matched_count = len(wishlist_set & visited_set)
    toxic_noshows = wishlist_set & noshow_set
    plan_adherence = round((matched_count / len(wishlist_set) * 100), 1) if len(wishlist_set) > 0 else 0

    df_risk = calculate_risk_score(df_notif, df_users)
    risk_row = df_risk[df_risk['user_id'].astype(str).str.strip() == user_id]
    risk_score = int(risk_row['RiskScore'].iloc[0]) if not risk_row.empty else 0

    content_tag_map = {}
    for _, row in df_content.iterrows():
        title = row.get('title')
        if pd.isna(title):
            continue
        tags_raw = row.get('tags')
        try:
            tags = json.loads(tags_raw) if isinstance(tags_raw, str) else tags_raw
        except Exception:
            tags = []
        content_tag_map[str(title).strip()] = tags

    def top_tags_for_titles(titles):
        tag_counts = {}
        for title in titles:
            for tag in content_tag_map.get(title, []):
                tag_counts[tag] = tag_counts.get(tag, 0) + 1
        return [tag for tag, _ in sorted(tag_counts.items(), key=lambda item: (-item[1], item[0]))][:5]

    return {
        'user_id': user_id,
        'noshow_titles': noshow_titles,
        'wishlist_titles': wishlist_titles,
        'wishlist_ids': wishlist_ids,
        'visited_titles': visited_titles,
        'wishlist_count': len(wishlist_titles),
        'visited_count': len(visited_titles),
        'matched_count': matched_count,
        'toxic_noshows': toxic_noshows,
        'plan_adherence': plan_adherence,
        'risk_score': risk_score,
        'top_wishlist_tags': top_tags_for_titles(wishlist_titles),
        'top_noshow_tags': top_tags_for_titles(noshow_titles)
    }


# Real festival experiences mock pool
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

df_real_content = pd.DataFrame(real_festival_contents)
df_real_content['id'] = [str(uuid.uuid4()) for _ in range(len(df_real_content))]
df_real_content['capacity'] = [random.choice([5, 10, 20]) for _ in range(len(df_real_content))]
LOCAL_FESTIVAL_ID = "9d27df3c-60b3-4efe-98ef-c035a3d63c9b"
df_real_content['festival_id'] = LOCAL_FESTIVAL_ID

global_keywords = ["SENSORY_WELLNESS", "ART_CULTURE", "SOCIETY_TECH", "TECH_DISCOVERY"]


def generate_user_keyword_ratings():
    """Simulates the 1-5 star preference matrix filled by the user on the app"""
    return {keyword: random.randint(1, 5) for keyword in global_keywords}


# --- HYBRID SCORING ENGINE (V1 + V2 + V3 + Onboarding) ---
def calculate_advanced_hybrid_score(user_id, content_row, user_ratings, user_profile=None):
    """Calculate hybrid recommendation score based on user role, preferences, wishlist, and risk signals."""
    user_id = str(user_id).strip()
    user_row_matches = df_users[df_users['id'].astype(str).str.strip() == user_id]
    if user_row_matches.empty:
        return 0.0
    user_row = user_row_matches.iloc[0]
    user_role = user_row['role']
    
    tags_raw = content_row['tags']
    try:
        content_tags = json.loads(tags_raw) if isinstance(tags_raw, str) else tags_raw
    except Exception:
        content_tags = []
        
    content_title = str(content_row['title']).strip()
    content_id = str(content_row.get('id', '')).strip()
    
    pref_tags_raw = user_row['preferred_tags']
    try:
        user_preferred_tags = json.loads(pref_tags_raw) if isinstance(pref_tags_raw, str) else pref_tags_raw
    except Exception:
        user_preferred_tags = []
    
    # Rule A: Security Matrix - Block GRAND_PUBLIC from B2B events
    if user_role == "GRAND_PUBLIC" and "B2B_NETWORKING" in content_tags:
        return 0.0
        
    score = 0.0
    
    # Rule B: Priority Boost - +150 for unbooked B2B/Talks for PRO and Decision Makers
    if user_role in ["PRO", "DECISION_MAKER"] and ("B2B_NETWORKING" in content_tags or "CREATOR_TALK" in content_tags):
        user_history = user_booking_history.get(user_id, [])
        if content_title not in user_history:
            score += 150.0
 
    # Rule C: Chained Event Boost - +40 for VR preference leading to Creator Talk
    user_history = user_booking_history.get(user_id, [])
    if "VR_EXPERIENCE" in user_preferred_tags and "CREATOR_TALK" in content_tags and len(user_history) > 0:
        score += 40.0
        
    # Rule D: Tag Alignment - +25 per matching tag with user preferences
    for tag in content_tags:
        if tag in user_preferred_tags:
            score += 25.0

    # Rule E: Wishlist Boost - +35 for title match, +15 per wishlist tag match
    if user_profile:
        u_wish_ids = user_profile.get('wishlist_ids', [])
        u_wish_titles = user_profile.get('wishlist_titles', [])
        top_wish_tags = user_profile.get('top_wishlist_tags', [])
        
        if content_id in u_wish_ids or content_title in u_wish_titles:
            score += 35.0
            
        for tag in content_tags:
            if tag in top_wish_tags:
                score += 15.0

    # Rule F: Risk Score & No-Show Penalties
    if user_profile:
        risk_score = user_profile.get('risk_score', 0)
        if risk_score > 0:
            score -= (risk_score * 5.0)
            
        toxic_noshows = user_profile.get('toxic_noshows', set())
        if content_title in toxic_noshows:
            score -= 50.0
            
        top_noshow_tags = user_profile.get('top_noshow_tags', [])
        for tag in content_tags:
            if tag in top_noshow_tags:
                score -= 15.0

    # Rule G: Onboarding Rating Multiplier (1-5 stars x 15 pts)
    for tag in content_tags:
        if tag in user_ratings and user_ratings[tag] > 0:
            score += user_ratings[tag] * 15.0
            
    return max(0.0, score)


def ask_yes_no_question(question):
    """Helper function to get yes/no responses from user"""
    while True:
        response = input(f"{question} (yes/no): ").strip().lower()
        if response in ['yes', 'y']:
            return True
        elif response in ['no', 'n']:
            return False
        print("❌ Please enter 'yes' or 'no'")


category_descriptions = {
    "SENSORY_WELLNESS": "Sensory & Wellness Experiences (relaxation, mindfulness, wellbeing)",
    "ART_CULTURE": "Art & Culture (creative, artistic expressions)",
    "SOCIETY_TECH": "Society & Technology (social impact, tech discovery)",
    "TECH_DISCOVERY": "Technology Discovery (innovation, interactive technology)"
}


# --- LOAD DATA AND INITIALIZE ---
try:
    df_users, df_content, df_notif, df_wish = init_data()
except FileNotFoundError as e:
    print(f"Error: {e}. Please verify that the CSV files are present.")
    sys.exit(1)

user_booking_history = build_user_booking_history(df_notif)

if __name__ == "__main__":
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

    print("\n📌 Test User Selection:")
    print("Enter a user ID to test a specific profile, or press Enter to use a random user.")
    user_ids = df_users['id'].astype(str).str.strip().tolist()
    while True:
        selected_user_input = input("User ID: ").strip()
        if selected_user_input == "":
            live_test_user = df_users.sample(n=1).iloc[0]
            break
        if selected_user_input in user_ids:
            live_test_user = df_users[df_users['id'].astype(str).str.strip() == selected_user_input].iloc[0]
            break
        print("   ❌ User ID not found. Please enter a valid ID or leave blank for a random profile.")

    live_user_id = str(live_test_user['id']).strip()
    live_user_role = live_test_user['role']
    live_user_name = live_test_user.get('full_name', 'Unknown')
    live_user_group = categorize_group(live_user_role)
    selected_user_profile = analyze_user_history(live_user_id, df_notif, df_wish, df_users, df_content)

    print("\n" + "="*70)
    print("👤 SELECTED USER PROFILE SUMMARY (V1, V2, V3 Insights)")
    print("="*70)
    print(f"User ID: {live_user_id}")
    print(f"Name: {live_user_name}")
    print(f"Role: {live_user_role} ({live_user_group})")
    print(f"Strike Count: {int(live_test_user.get('strike_count', 0))}")
    print(f"No-show count: {len(selected_user_profile['noshow_titles'])}")
    print(f"Risk score: {selected_user_profile['risk_score']}")
    print(f"Wishlist count: {selected_user_profile['wishlist_count']}")
    print(f"Visited count: {selected_user_profile['visited_count']}")
    print(f"Matched goals: {selected_user_profile['matched_count']}")
    print(f"Plan adherence: {selected_user_profile['plan_adherence']}%")
    print(f"Top wishlist tags: {selected_user_profile['top_wishlist_tags']}")
    print(f"Top no-show tags: {selected_user_profile['top_noshow_tags']}")
    if live_user_role in ["PRO", "DECISION_MAKER"]:
        print("Role-specific signal: PRO/DECISION_MAKER must-book priority active for B2B_NETWORKING and CREATOR_TALK content.")
    print("-"*70)

    # Combine full CSV content pool and real festival content pool
    content_pool = []
    seen_titles = set()

    # First add items from full df_content CSV dataset
    for idx, row in df_content.iterrows():
        title = str(row['title']).strip()
        if title not in seen_titles:
            seen_titles.add(title)
            content_pool.append(row)

    # Also add real_festival_contents items if not present
    for idx, row in df_real_content.iterrows():
        title = str(row['title']).strip()
        if title not in seen_titles:
            seen_titles.add(title)
            content_pool.append(row)

    live_recommendations = []
    for row in content_pool:
        final_hybrid_score = calculate_advanced_hybrid_score(live_user_id, row, live_user_ratings, selected_user_profile)
        title = str(row['title']).strip()
        tags_raw = row['tags']
        try:
            tags = json.loads(tags_raw) if isinstance(tags_raw, str) else tags_raw
        except Exception:
            tags = []
            
        in_wishlist = "Yes" if title in selected_user_profile['wishlist_titles'] else "No"
        is_noshow = "Yes" if title in selected_user_profile['noshow_titles'] else "No"
        
        live_recommendations.append({
            "Festival Content": title,
            "Assigned Tags": tags,
            "In Wishlist?": in_wishlist,
            "No-Show?": is_noshow,
            "Hybrid Score": round(final_hybrid_score, 1)
        })

    df_live_res = pd.DataFrame(live_recommendations).sort_values(by="Hybrid Score", ascending=False)
    print("\n🎯 YOUR PERSONALIZED RECOMMENDATIONS (FULL DATASET RANKED):")
    print(df_live_res.head(15).to_string(index=False))
    print("="*70)