# 決定版のロックアップ【人間の決定：マークB（区画の菱形）＋E式の文字（丸ゴシック）、横組み・縦組み】。作図：Claude Code
import re
mark = open('../mark-B.svg').read()
inner = re.search(r'<g transform="translate\(0,6\)">(.*)</g></svg>', mark, re.S).group(1)
FR = 'Hiragino Maru Gothic ProN, Zen Maru Gothic, Noto Sans CJK JP, sans-serif'
FS = 'Hiragino Sans, Noto Sans CJK JP, sans-serif'
def recolor(s, ink):
    return s.replace('#1E2B36', ink)
def horiz(ink='#1E2B36', bg=None):
    w, h = 800, 170
    b = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{b}'
            f'<g transform="translate(4,-2) scale(1.42)">{recolor(inner, ink)}</g>'
            f'<text x="196" y="102" font-size="100" font-weight="800" letter-spacing="10" fill="{ink}" font-family="{FR}">ゆくすいえ</text>'
            f'<text x="198" y="150" font-size="24" font-weight="700" letter-spacing="7.7" fill="{ink}" font-family="{FS}">YUKUSUIE<tspan font-weight="400" letter-spacing="1.4" dx="12">16 unbuilt futures</tspan></text></svg>')
def vert(ink='#1E2B36', bg=None):
    w, h = 240, 820
    b = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ''
    chars = ''.join(f'<text x="120" y="{250 + i * 104}" text-anchor="middle" font-size="96" font-weight="800" fill="{ink}" font-family="{FR}">{c}</text>' for i, c in enumerate('ゆくすいえ'))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{b}'
            f'<g transform="translate(36,20) scale(1.4)">{recolor(inner, ink)}</g>{chars}'
            f'<text x="120" y="790" text-anchor="middle" font-size="19" font-weight="700" letter-spacing="5" fill="{ink}" font-family="{FS}">YUKUSUIE</text></svg>')
open('lockup-horizontal.svg', 'w').write(horiz())
open('lockup-horizontal-dark.svg', 'w').write(horiz('#FFFAF0', '#1E2B36'))
open('lockup-vertical.svg', 'w').write(vert())
open('lockup-vertical-dark.svg', 'w').write(vert('#FFFAF0', '#1E2B36'))
open('mark.svg', 'w').write(mark)
print('ok')
