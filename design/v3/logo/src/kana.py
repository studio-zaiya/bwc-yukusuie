# 手で起こした単線のかな（中心線）。100×100の箱、丸い線端
KANA = {
 'ゆ': ["M24,30 C21,46 21,62 27,76 C29,70 31,64 33,58",
        "M27,52 C38,34 68,30 76,48 C84,66 66,78 48,72",
        "M52,16 C55,38 55,62 48,90"],
 'く': ["M64,16 C52,30 42,40 32,50 C42,60 52,70 64,84"],
 'す': ["M14,34 L86,34",
        "M54,14 L54,52 C54,68 36,68 36,55 C36,42 55,42 56,58 C57,72 52,82 42,92"],
 'い': ["M26,24 C21,44 22,64 33,78 C36,72 38,66 39,60",
        "M68,34 C76,46 80,56 80,68"],
 'え': ["M42,14 C48,16 54,19 59,23",
        "M28,42 L70,42 C56,56 42,70 26,86 C38,74 48,68 54,74 C58,80 62,86 84,84"],
}
def word(chars, x0=0, y0=0, size=100, track=0.0, sw=9, color='#1E2B36', extra=''):
    out=[]; x=x0
    for ch in chars:
        k=size/100
        for d in KANA[ch]:
            out.append(f'<path d="{d}" transform="translate({x:.1f},{y0:.1f}) scale({k:.4f})" fill="none" stroke="{color}" stroke-width="{sw/k:.2f}" stroke-linecap="round" stroke-linejoin="round" {extra}/>')
        x+=size*(1+track)
    return '\n'.join(out), x-size*track
