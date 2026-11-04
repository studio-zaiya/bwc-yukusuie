import sys
k=open('src/kid.js').read()
for n in ['hero','tree']:
    try: s=open(f'src/{n}.html').read()
    except FileNotFoundError: continue
    open(f'{n}.html','w').write(s.replace('<script src="kid.js"></script>','<script>\n'+k+'\n</script>'))
    print('built',n)
