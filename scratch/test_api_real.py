import urllib.request, json

api_key = "01de09ba37a81c948be7aebcaf154c61"
headers = {"x-apisports-key": api_key}

# Check status
req = urllib.request.Request("https://v1.hockey.api-sports.io/status", headers=headers)
with urllib.request.urlopen(req) as r:
    print("Status:", json.loads(r.read().decode()))

# Check games on 2026-10-01 with timezone America/New_York
for tz in ["America/New_York", "UTC"]:
    url = f"https://v1.hockey.api-sports.io/games?date=2026-10-01&league=57&season=2026&timezone={tz}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as r:
        res = json.loads(r.read().decode())
        print(f"Timezone {tz} games count: {len(res.get('response', []))}")
        for g in res.get("response", []):
            print(f"  [{g['id']}] {g['teams']['home']['name']} vs {g['teams']['away']['name']} | date: {g['date']} | status: {g['status']['short']}")

