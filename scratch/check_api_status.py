import urllib.request, json
api_key = "143efd2f53472fa998a4484fc6df5c68"
headers = {"x-apisports-key": api_key}

# Check leagues
url_leagues = "https://v1.hockey.api-sports.io/leagues?name=NHL"
req = urllib.request.Request(url_leagues, headers=headers)
with urllib.request.urlopen(req) as r:
    res = json.loads(r.read().decode())
    print("NHL league query:", json.dumps(res, indent=2))

url_status = "https://v1.hockey.api-sports.io/status"
req_st = urllib.request.Request(url_status, headers=headers)
with urllib.request.urlopen(req_st) as r:
    res_st = json.loads(r.read().decode())
    print("API status:", json.dumps(res_st, indent=2))
