import urllib.request, json
api_key = "143efd2f53472fa998a4484fc6df5c68"
headers = {"x-apisports-key": api_key}
for tz in ["America/New_York", "UTC", "America/Bogota", "America/Lima"]:
    url = f"https://v1.hockey.api-sports.io/games?date=2026-10-01&league=57&season=2026&timezone={tz}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as r:
        res = json.loads(r.read().decode())
        print(tz, "count:", len(res.get("response", [])))
        for g in res.get("response", []):
            print("  ", g["id"], g["teams"]["home"]["name"], "vs", g["teams"]["away"]["name"], g["date"])
