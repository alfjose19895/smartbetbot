import os, re

matches = []
for root, dirs, files in os.walk('.'):
    if 'node_modules' in dirs: dirs.remove('node_modules')
    if '.next' in dirs: dirs.remove('.next')
    if '.git' in dirs: dirs.remove('.git')
    for f in files:
        if f.endswith('.ts') or f.endswith('.tsx'):
            path = os.path.join(root, f)
            if '/app/api/' in path.replace('\\', '/') or '/lib/' in path.replace('\\', '/'):
                with open(path, 'r', encoding='utf-8', errors='ignore') as file:
                    content = file.read()
                    if 'from "@/components/' in content or "from '@/components/" in content:
                        for line in content.split('\n'):
                            if 'components/' in line and 'import' in line:
                                matches.append((path, line.strip()))

for p, l in matches:
    print(f"{p}: {l}")
