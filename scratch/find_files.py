import os
for root, dirs, files in os.walk('.'):
    if 'node_modules' in dirs:
        dirs.remove('node_modules')
    if '.next' in dirs:
        dirs.remove('.next')
    if '.git' in dirs:
        dirs.remove('.git')
    for file in files:
        if 'nhl' in file.lower() or 'hockey' in file.lower() or 'multisport' in file.lower() or 'sports' in file.lower():
            print(os.path.join(root, file))
