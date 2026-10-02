import urllib.request, json

api_key = "01de09ba37a81c948be7aebcaf154c61"
headers = {"x-apisports-key": api_key}

url = "https://v1.hockey.api-sports.io/odds?game=444611"
req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req) as r:
    data = json.loads(r.read().decode())
    bms = data.get("response", [{}])[0].get("bookmakers", [])
    print(f"Bookmakers count for Calgary vs Seattle (444611): {len(bms)}")
    for bm in bms:
        print(f"\n=== Bookmaker: {bm.get('name')} ===")
        for bet in bm.get("bets", []):
            print(f"  Bet: {bet.get('name')}")
            for v in bet.get("values", []):
                print(f"    Value: {v.get('value')} | Odd: {v.get('odd')}")