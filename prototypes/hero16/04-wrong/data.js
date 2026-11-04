// 16の世界のデータ（架空）。金額は万円。
window.WORLDS = [
  {id:1,  co:'Aハウス',   path:['A','間取り先行','月末契約','外構あと'], total:4650, base:4270, st:'増額', line:'打ち合わせは19回。14回目のあと、車の中で泣いた。', detail:true},
  {id:2,  co:'Aハウス',   path:['A','間取り先行','全社比較','外構あと'], total:4380, base:4270, st:'完成', line:'展示場の吹き抜けは、うちにも来た。冬は少し寒い。'},
  {id:3,  co:'B工務店',   path:['B','全部入り','着工金50%','外構あと'], total:2600, base:2600, st:'中止', line:'上棟の2か月後、職人が来なくなった。', detail:true},
  {id:4,  co:'B工務店',   path:['B','全部入り','出来高払い','外構あと'], total:2950, base:2600, st:'引継ぎ', line:'別の会社が引き継いで、半年遅れで建った。'},
  {id:5,  co:'Cデザイン', path:['C','絞り込み','窓を上げる','キッチン'], total:4130, base:3950, st:'完成', line:'キッチンは毎日使うから。外構はこれから。', detail:true, me:true},
  {id:6,  co:'Cデザイン', path:['C','絞り込み','標準の窓','キッチン'], total:4070, base:3950, st:'完成', line:'2月の朝、暖房をつけても足元が冷たい。', detail:true},
  {id:7,  co:'Cデザイン', path:['C','絞り込み','標準の窓','外構'],     total:4070, base:3950, st:'完成', line:'帰ってきたとき、家の顔がいいと思える。'},
  {id:8,  co:'Cデザイン', path:['C','待ちきれず','期限切れ','—'],      total:0,    base:3950, st:'白紙', line:'見積が届く前に、土地の期限が来た。'},
  {id:9,  co:'Dホーム',   path:['D','規格','太陽光無料','外構あと'],   total:2480, base:1980, st:'完成', line:'速かった。オプションが積み上がった。'},
  {id:10, co:'Dホーム',   path:['D','規格','変更2回','外構'],          total:2710, base:1980, st:'完成', line:'プランの変更は、2回目から有料だった。'},
  {id:11, co:'Aハウス',   path:['A','性能優先','全館空調','外構あと'], total:4720, base:4270, st:'完成', line:'家じゅう同じ温度。電気代の明細を見るのが怖い。'},
  {id:12, co:'B工務店',   path:['B','和室あり','父の意見','外構あと'], total:2890, base:2600, st:'中止', line:'父が選んだ和室は、壁のないまま止まった。'},
  {id:13, co:'Cデザイン', path:['C','絞り込み','平屋寄り','カーポート1台'], total:4210, base:3950, st:'完成', line:'カーポートは1台。もう1台は縦に停める。'},
  {id:14, co:'Dホーム',   path:['D','規格','鬼門で変更','外構あと'],   total:2620, base:1980, st:'完成', line:'契約の1週間前に、玄関が反対側へ移った。'},
  {id:15, co:'Aハウス',   path:['A','間取り先行','担当交代','外構'],   total:4510, base:4270, st:'増額', line:'頼んだはずの棚が、図面になかった。'},
  {id:16, co:'Cデザイン', path:['C','絞り込み','箱型＋南の庇','エアコン位置'], total:4130, base:3950, st:'完成', line:'テレビの壁に、下地が入っていなかった。'}
];
window.ITEMS = ['本体工事','付帯工事','地盤改良','外構工事','設計料','諸費用','追加・変更'];
// 世界ごとの内訳（合計に合うように配分）
window.breakdown = function(w){
  if(!w.total) return [0,0,0,0,0,0,0];
  const s = w.id*9301 % 233;
  const r = (k)=> ((s*(k+3)*49297) % 1000)/1000;
  const extra = w.total - w.base;
  const body = Math.round(w.base*0.72), fu = Math.round(w.base*0.1);
  const ground = (w.id%3===0)?0:120, ext = Math.round(w.base*0.06 + r(2)*40);
  const des = w.co==='Cデザイン'? 180 : (w.co==='Aハウス'? 90:0);
  const misc = w.base - body - fu - ground - ext - des;
  return [body,fu,ground,ext,des,misc,Math.max(0,extra)];
};
