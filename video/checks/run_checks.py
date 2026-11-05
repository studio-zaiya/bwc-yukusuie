# 動画の点検を実際に走らせる（守りの監査の自動の部分＋約束の表の照合）
# 使い方：python3 video/checks/run_checks.py
# 出力：out/checks/audit.json・consistency.json・CHECKS.md と、照合の証拠のコマ out/checks/ev-*.png
# 照合の判定（○△×）は、動画担当が録画のコマを見て付けたもの。コマはここで抜き出し、判定と並べて残す
import json, os, re, subprocess, sys, datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'out', 'checks'); os.makedirs(OUT, exist_ok=True)
EDL = json.load(open(os.path.join(ROOT, 'video', 'edl.json'), encoding='utf-8'))
SRT = os.path.join(ROOT, 'video', EDL['subs'])

def srt(path):
    out = []
    for b in open(path, encoding='utf-8').read().strip().split('\n\n'):
        l = b.split('\n'); a, z = l[1].split(' --> ')
        f = lambda s: (lambda h, m, r: int(h) * 3600 + int(m) * 60 + float(r.replace(',', '.')))(*s.split(':'))
        out.append((f(a), f(z), '\n'.join(l[2:])))
    return out
subs = srt(SRT)

# 動画に出る場面の文字（場面表に入っている HTML）
SCENE_FILES = {'opening': 'opening.html', 'hero': 'hero-title.html', 'intro': 'intro-c.html', 'arch': 'arch.html', 'training-log': 'training-log.html',
               'skills': 'skills.html', 'report': 'report-pages.html', 'ending': 'ending-EA.html', 'credits': 'credits.html'}
texts = {'字幕': '\n'.join(x for _, _, x in subs)}
for k, f in SCENE_FILES.items():
    p = os.path.join(ROOT, 'video', 'scenes', f)
    if os.path.exists(p):
        s = open(p, encoding='utf-8').read()
        s = re.sub(r'<!--.*?-->', '', s, flags=re.S); s = re.sub(r'(?m)//.*$', '', s)
        texts['場面:' + f] = s

audit = []
def check(name, pattern, flags=0, note=''):
    hits = []
    for k, s in texts.items():
        for m in re.finditer(pattern, s, flags):
            ln = s[:m.start()].count('\n') + 1
            hits.append(f'{k}:{ln}「{m.group(0)}」')
    audit.append({'項目': name, '結果': '○' if not hits else '×', '詳細': '; '.join(hits[:6]) or 'ヒットなし', '備考': note})

check('禁止の言い回し（17本目・2択じゃなく・16に納まら・16通りより など）', r'17本目|17番目|17の世界|2択じゃなく|16に納まら|16通りより|未来は、16|正解の家より')
check('ギリシャ文字', r'[Α-Ωα-ω]')
check('赤の色', r'#[Ff]{2}0000\b|#[Ff]00\b|\bred\b')
check('絵文字', r'[\U0001F300-\U0001FAFF☀-➿]')
check('住宅会社の表記（A〜D以外の「〇ハウス／〇工務店／〇デザイン」）', r'(?<![ABCDＡ-Ｄ])(?<!\w)[^\sABCD「（(、。・：:>/"\'0-9]ハウス(?!メーカー)|(?<![ABCD])[^\sABCD「（(、。・>]工務店(?![のでがを、。]|の設計者)')
# 注記の文
NOTE = '本作の制度・手続き・金額・期間などの設定は、体験のために簡略化しています。'
cred = texts.get('場面:credits.html', '')
audit.append({'項目': '注記の文（動画の最後）', '結果': '○' if NOTE[:20] in cred and '架空' in cred else '×', '詳細': 'credits.html に注記の文' + ('あり' if NOTE[:20] in cred else 'なし'), '備考': ''})
# 字幕の長さ
bad = [f'{i+1}「{x}」{z-a:.2f}秒' for i, (a, z, x) in enumerate(subs) if z - a < max(1.8, len(re.sub(r'\s', '', x)) / 4) - 1e-6]
audit.append({'項目': '字幕：最低1.8秒・文字数÷4秒', '結果': '○' if not bad else '×', '詳細': '、'.join(bad) or f'{len(subs)}行すべて満たす', '備考': ''})
ov = [f'{i+1}と{i+2}' for i in range(len(subs) - 1) if subs[i][1] > subs[i + 1][0]]
audit.append({'項目': '字幕：前の行と重ならない', '結果': '○' if not ov else '×', '詳細': '、'.join(ov) or '重なりなし', '備考': ''})
# 人間が指定した使わない語（非公開の一覧）
pw = os.path.join(ROOT, '.claude', 'local', 'private-words.txt')
if os.path.exists(pw):
    words = [w.strip() for w in open(pw, encoding='utf-8') if w.strip()]
    hits = [w for w in words for s in texts.values() if w in s]
    audit.append({'項目': '人間が指定した使わない語', '結果': '○' if not hits else '×', '詳細': f'{len(hits)}件', '備考': '一覧は非公開'})
else:
    audit.append({'項目': '人間が指定した使わない語', '結果': '未確認', '詳細': '一覧（.claude/local/private-words.txt）がこの環境にない', '備考': '人間の環境で確かめる'})
# 仕組みの名前（Claude）が画面に出る場面
cl = [k for k, s in texts.items() if k != '字幕' and 'Claude' in re.sub(r'<[^>]+>', ' ', s)]
audit.append({'項目': '仕組みの名前（Claude）が画面に出る場面', '結果': '△', '詳細': '、'.join(cl), '備考': 'つくり方の裏側（仕組み・研修・点検）と冒頭の一言、黒画面のスタッフ。実機の画面には出していない'})

# 約束の表の照合：字幕・画面のコピー ↔ 録画した実機の画面（証拠のコマ：録画ファイルと秒）
REC = os.path.join(ROOT, 'out', 'rec')
C = [
 ('V12', '来場者アンケートは、選ぶだけ。', '○', 'demo_full.mp4', 15.0, '1画面1問の札を選ぶだけ。「あと〇問」が減る'),
 ('V12', '担当者はAIです。（総括）', '○', 'demo_slow.mp4', 126.5, 'Cデザインの担当者の総括「ご記入ありがとうございます…」が出る'),
 ('S5', '会社ごとに、人柄も見積の見せ方も違います。', '△', 'demo_slow.mp4', 319.0, '2社の案と概算は並ぶが、「見積の見せ方の違い」（本体価格／総額）は、この画面だけでは読み取りにくい'),
 ('V9', '提案を見比べて、建てる会社を選ぶ。第一の分岐点です。', '○', 'demo_slow.mp4', 327.0, '「第一の分岐点　だれと建てる？」の札'),
 ('V7', '選ばなかった道も、別の世界として同時に進みます。', '○', 'demo_slow.mp4', 339.0, '選ばなかった札が「選ばれなかった世界線」の列へ（1）'),
 ('V13', '迷ったら、自分の言葉で答えることもできます。', '○', 'demo_slow.mp4', 396.0, '札の下に「自分の言葉で答える」欄'),
 ('V13', '担当者が受け止め、計算をやり直し、条件と家の変化を見せます。', '○', 'demo_slow.mp4', 415.5, '家の絵と◆、担当者の条件、「いま起きたこと」（見積の差 +58万円・返済負担率・判定）'),
 ('V9', '色を決めると、4つ目の分岐。世界は16に。', '○', 'demo_slow.mp4', 448.5, '色決めのあと第四の札が自動で選ばれ、選ばれなかった世界線が15（＋わが家＝16）'),
 ('V5', '伝えた要望は、左の一覧で確かめます。', '○', 'demo_slow.mp4', 456.0, '左に電気の図面の一覧。前振り⑥「全部伝えたのに」の伝え漏れは、この記録では起きない'),
 ('V14', 'そして、引渡し。', '○', 'demo_slow.mp4', 517.0, '引渡しの切り絵（家族と担当者）'),
 ('V10', '1年後。16の区画で、選ばなかった未来と見比べます。', '○', 'demo_slow.mp4', 543.0, '16区画と、07（あなた）のカード'),
 ('V15', '言葉はClaude、数字はコード。', '△', 'demo_slow.mp4', 415.5, '画面の数字（+58万円・32.7%）はエンジンの値。担当者の言葉の数字は検査で止める作り（devlog）。画面だけでは全数は確かめられない'),
 ('V16', '担当者は、Claude同士で研修させました。', '○', None, None, '研修の記録（devlog 03:40〜11:10、tools/rep_training/）。数字は1回目→5回目の同じ記録'),
 ('—', '点検も、自作のスキルでClaudeに。', '○', None, None, '.claude/skills/ の4つ（audit・review・friendly・consistency、実装担当のブランチ）。この点検もそのうち2つの手順で走らせた'),
 ('V8', '最後に受け取るのは、本物の打ち合わせに持っていく1枚。', '○', 'report-p3.png', None, '印刷レポート3ページ目「切り取って、担当者に渡せます」'),
 ('—', '守れた希望も、守れなかった希望も。', '○', 'report-p2.png', None, '印刷レポート2ページ目「希望と、1年後の結果」（守れた／守れなかった）'),
 ('V11', '16回目の、マイホームへ。（締めのロゴ）', '○', 'report-p4.png', None, '印刷レポートの最後にキャッチ'),
 ('V3', '前振り：土地と建物で約5,007万円、年収の7.5年分', '△', 'demo_slow.mp4', 456.0, '実機の総額は5,687万円（同じ水準だが、この記録は希望の4,500万円を大きく超える）'),
 ('—', '冒頭の一言「現役の建築士が、Claudeとつくった家づくりシミュレーション」', '未確認', None, None, '「現役の建築士」は作り手の事実。人間が確かめる（一言はA／B／Cから人間が決める）'),
]
cons = []
for i, (vid, words, mark, src, t, note) in enumerate(C, 1):
    ev = ''
    if src and src.endswith('.mp4') and t is not None:
        ev = f'ev-{i:02d}.png'
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', str(t), '-i', os.path.join(REC, src), '-frames:v', '1', '-vf', 'scale=960:-1', os.path.join(OUT, ev)], check=True)
    elif src and src.endswith('.png'):
        ev = src
    cons.append({'ID': vid, '約束（動画の言葉）': words, '状態': mark, '証拠': (f'{src} {t}秒' if t is not None else (src or '記録・ファイル')), 'コマ': ev, 'メモ': note})

now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
json.dump({'at': now, 'rows': audit}, open(os.path.join(OUT, 'audit.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump({'at': now, 'rows': cons}, open(os.path.join(OUT, 'consistency.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
md = [f'# 動画の点検の結果（{now}、video/checks/run_checks.py）', '', f'対象：{EDL["subs"]} と、場面表に入っている場面の文字。照合の証拠は out/rec/ の録画（再生のコード cd9cz43g）', '',
      '## 守りの監査（yukusuie-audit の自動の部分）', '| 項目 | 結果 | 詳細 | 備考 |', '|---|---|---|---|'] + [f"| {r['項目']} | {r['結果']} | {r['詳細']} | {r['備考']} |" for r in audit] + [
      '', '## 約束の表の照合（yukusuie-consistency の1）', '| ID | 約束（動画の言葉） | 状態 | 証拠 | メモ |', '|---|---|---|---|---|'] + [f"| {r['ID']} | {r['約束（動画の言葉）']} | {r['状態']} | {r['証拠']} | {r['メモ']} |" for r in cons]
open(os.path.join(OUT, 'CHECKS.md'), 'w', encoding='utf-8').write('\n'.join(md) + '\n')
from collections import Counter
print('audit', Counter(r['結果'] for r in audit)); print('consistency', Counter(r['状態'] for r in cons))
for r in audit:
    if r['結果'] not in ('○',): print(' ', r['結果'], r['項目'], r['詳細'][:150])
# 場面（video/scenes/check-table.html）が読む形でも書き出す
for name, rows in (('audit', audit), ('consistency', cons)):
    open(os.path.join(OUT, name + '.js'), 'w', encoding='utf-8').write(f'window.CHECK_{name.upper()}=' + json.dumps({'at': now, 'rows': rows}, ensure_ascii=False) + ';\n')
