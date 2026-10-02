with open('.env.local') as f:
    for line in f:
        if 'API' in line or 'HOCKEY' in line or 'NHL' in line or 'KEY' in line:
            print(line.strip())
