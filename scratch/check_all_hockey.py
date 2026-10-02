import urllib.request, json

api_key = "01de09ba37a81c948be7aebcaf154c61"
headers = {"x-apisports-key": api_key}

# Query all hockey games for today across all leagues
url = "https://v1.hockey.api-sports.io/games?date=2026-10-01&timezone=America/New_York"
req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req) as r:
    data = json.loads(r.read().decode())
    games = data.get("response", [])
    print(f"Total hockey games worldwide for 2026-10-01: {len(games)}")
    
    # Group by league
    by_league = {}
    for g in games:
        lid = g.get("league", {}).get("id")
        lname = g.get("league", {}).get("name")
        key = f"{lname} (ID: {lid})"
        if key not in by_league:
            by_league[key] = []
        by_league[key].append(g)
    
    for lkey, lgames in by_league.items():
        print(f"\n--- {lkey}: {len(lgames)} games ---")
        for g in lgames:
            print(f"  [{g['id']}] {g['teams']['home']['name']} vs {g['teams']['away']['name']} | {g['date']} | Status: {g['status']['short']}")

