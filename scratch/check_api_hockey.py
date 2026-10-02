import urllib.request, json
api_key = "143efd2f53472fa998a4484fc6df5c68"
headers = {"x-apisports-key": api_key}

# 1. Check seasons
url_seasons = "https://v1.hockey.api-sports.io/seasons"
req = urllib.request.Request(url_seasons, headers=headers)
with urllib.request.urlopen(req) as r:
    res = json.loads(r.read().decode())
    print("Available seasons:", res.get("response", []))

# 2. Check games for today without season filter or with different season values
for season in ["2026", "2026-2027", "2025", "2025-2026"]:
    url = f"https://v1.hockey.api-sports.io/games?date=2026-10-01&league=57&season={season}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as r:
        res = json.loads(r.read().decode())
        print(f"Season {season} with league 57 -> count: {len(res.get('response', []))}")

# 3. Check games for today with JUST date=2026-10-01
url_all_today = "https://v1.hockey.api-sports.io/games?date=2026-10-01"
req = urllib.request.Request(url_all_today, headers=headers)
with urllib.request.urlopen(req) as r:
    res = json.loads(r.read().decode())
    print(f"All hockey games for 2026-10-01 -> count: {len(res.get('response', []))}")
    for g in res.get("response", [])[:10]:
        print(f"  League: {g.get('league',{}).get('name')} (id: {g.get('league',{}).get('id')}, season: {g.get('league',{}).get('season')}) | {g.get('teams',{}).get('home',{}).get('name')} vs {g.get('teams',{}).get('away',{}).get('name')}")

