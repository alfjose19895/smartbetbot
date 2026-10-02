import urllib.request, json

api_key = "01de09ba37a81c948be7aebcaf154c61"
headers = {"x-apisports-key": api_key}

# Check games right now for 2026-10-01 in America/New_York
url = "https://v1.hockey.api-sports.io/games?date=2026-10-01&league=57&season=2026&timezone=America/New_York"
req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req) as r:
    data = json.loads(r.read().decode())
    games = data.get("response", [])
    print(f"Games found for 2026-10-01: {len(games)}")
    for g in games:
        st = g.get("status", {})
        sc = g.get("scores", {})
        print(f"  [{g['id']}] {g['teams']['home']['name']} ({sc.get('home')}) vs {g['teams']['away']['name']} ({sc.get('away')}) | Status: {st.get('short')} ({st.get('long')}) | Date: {g['date']}")

# Check games for 2026-10-02
url2 = "https://v1.hockey.api-sports.io/games?date=2026-10-02&league=57&season=2026&timezone=America/New_York"
req2 = urllib.request.Request(url2, headers=headers)
with urllib.request.urlopen(req2) as r:
    data2 = json.loads(r2.read().decode())
    print(f"Games found for 2026-10-02: {len(data2.get('response', []))}")