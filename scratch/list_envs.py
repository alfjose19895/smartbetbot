import os
for f in os.listdir('.'):
    if 'env' in f:
        print(f)
