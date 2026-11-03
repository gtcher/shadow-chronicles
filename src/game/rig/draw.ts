// @ts-nocheck
/**
 * Squelette animé des combattants (direction artistique v2 : héros en piste A « peint encré »,
 * ennemis et boss en piste B « ombres à contre-jour »).
 * Code de dessin Canvas 2D partagé avec la planche docs/planche-persos-v2 : il est volontairement
 * gardé tel quel (non typé) pour que la planche et le jeu dessinent exactement la même chose.
 * Point d'entrée typé : ./index.ts (cuisson en feuilles de sprites Pixi).
 */
export const RIG = { now: 0, projectiles: false, loop: 0, phase: 0 };
/**
 * Jeu : en cuisson d'une animation en boucle (idle, course), RIG.loop = durée de la boucle (ms) et
 * RIG.phase = avancement 0..1. Les ondulations « au temps » (cape, lueurs, lames en orbite) font
 * alors un nombre entier de cycles par boucle : plus de saut quand l'animation reboucle.
 * Hors boucle, angle = RIG.now / per (comportement de la planche).
 */
const cyc=(per)=>{if(!RIG.loop)return RIG.now/per;const n=Math.max(1,Math.round(RIG.loop/(per*TAU)));return RIG.phase*TAU*n};
const TAU = Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const eo=t=>1-Math.pow(1-t,3), ei=t=>t*t*t, eio=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
function hex2rgb(h){h=h.replace('#','');if(h.length===3)h=h.split('').map(x=>x+x).join('');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]}
function mix(a,b,t){const A=hex2rgb(a),B=hex2rgb(b);return '#'+A.map((v,i)=>Math.round(lerp(v,B[i],t)).toString(16).padStart(2,'0')).join('')}
function rgba(h,a){const [r,g,b]=hex2rgb(h);return `rgba(${r},${g},${b},${a})`}
function rnd(i){const x=Math.sin(i*127.1+311.7)*43758.5453;return x-Math.floor(x)}

/* ===================== CASTING ===================== */
const H=(o)=>Object.assign({kind:'h',scale:1,leg:38,torso:30,sw:19,hw:14,arm:30,aw:7.5,lw:9,headR:12,hunch:0,robe:false,float:false,cape:null,scarf:null,pauldron:false,weapon:'sword',head:'short',horns:false,halo:false,enemy:false},o);
const CAST={
 taro:H({name:'Taro',role:'Lame écarlate',group:'h',sig:'#e0303c',rim:'#ff7a5c',body:'#2a2a33',body2:'#8e1a24',metal:'#5f5c6c',skin:'#efc6a4',hair:'#221a20',weapon:'greatsword',head:'spiky',pauldron:true,cape:'#6e121b',gaunt:true,greaves:true,flapMat:'metal',band:'#d02634',emblem:true,sw:24,hw:16,aw:9,lw:10.5,headR:12.5}),
 mei:H({name:'Mei',role:'Danseuse d\'ombre',group:'h',sig:'#ff3fb4',rim:'#ff9be0',body:'#1f1726',body2:'#b8277f',metal:'#6a5a70',skin:'#f6d2bc',hair:'#1a1020',weapon:'daggers',head:'ponytail',scarf:'#ff3fb4',wraps:true,boots:'#120c16',waist:.8,sw:15,hw:13,aw:6.5,lw:8,leg:41,torso:27,headR:12}),
 sena:H({name:'Sena',role:'Prêtresse lunaire',group:'h',sig:'#4f8dff',rim:'#cfe4ff',body:'#23437f',body2:'#e7ecf8',metal:'#b9c6e0',skin:'#f6dccb',hair:'#e4ebf6',weapon:'staff',head:'long',robe:true,sleeves:true,trim:'#e3c06a',motes:true,waist:.85,sw:16,hw:14,aw:6.5,headR:12}),
 ren:H({name:'Ren',role:'Archer d\'or',group:'h',sig:'#e8b64a',rim:'#7fe0ff',body:'#1e2944',body2:'#d9a640',metal:'#8a7344',skin:'#eec5a2',hair:'#3d2b1e',weapon:'bow',head:'short',coat:true,quiver:true,collar:true,trim:'#e3b54e',sw:18,headR:12}),
 brute:H({name:'Brute',role:'Ennemi lourd',group:'e',enemy:true,sig:'#ff3a2a',rim:'#ff7a4a',body:'#57515c',body2:'#2b2026',metal:'#3a3640',skin:'#5f5964',hair:'#2a2630',weapon:'fists',head:'bald',scale:1.25,sw:36,hw:22,torso:36,leg:30,arm:36,aw:15,lw:15,headR:9.5,hunch:.32}),
 raider:H({name:'Raider',role:'Soldat du Culte',group:'e',enemy:true,sig:'#ff4a3a',rim:'#ff8a5a',body:'#34323b',body2:'#6e1a1a',metal:'#585462',skin:'#585462',hair:'#2a2830',weapon:'sword',head:'helmet',pauldron:true,cape:'#5a1414'}),
 shade:H({name:'Ombre',role:'Lanceuse de sorts',group:'e',enemy:true,sig:'#a86bff',rim:'#d1b3ff',body:'#2a1946',body2:'#3d2468',metal:'#4a3a66',skin:'#0c0814',hair:'#1c1030',weapon:'orb',head:'hood',float:true,robe:true,sw:16,hw:14,aw:6}),
 shadeElite:H({name:'Ombre élite',role:'Faucheuse',group:'e',enemy:true,sig:'#ff2a3a',rim:'#ff7a7a',body:'#5e1018',body2:'#2a0a10',metal:'#8a8478',skin:'#d8cfbf',hair:'#2a0a10',weapon:'scythe',head:'skull',robe:true,horns:true,scale:1.12,sw:20}),
 wolf:{kind:'w',name:'Loup du Néant',role:'Chasseur rapide',group:'e',enemy:true,scale:1,sig:'#ff3a2a',rim:'#ff8a5a',body:'#2d2c36',body2:'#18171e',skin:'#2d2c36'},
 juge:H({name:'Juge Pourpre',role:'Boss',group:'b',enemy:true,sig:'#ff2a3a',rim:'#ff8a8a',body:'#6a0f1a',body2:'#2a0810',metal:'#9a8f7a',skin:'#dcd2c0',hair:'#2a0810',weapon:'greatsword',head:'skull',robe:true,horns:true,cape:'#3a0a12',scale:1.75,sw:22}),
 cendrefer:H({name:'Capitaine Cendrefer',role:'Boss · vague 5',group:'b',enemy:true,sig:'#ff7a2a',rim:'#ffb070',body:'#2f2a28',body2:'#7a3214',metal:'#5c524a',skin:'#5c524a',hair:'#201a18',weapon:'halberd',head:'helmet',horns:true,pauldron:true,cape:'#3a1a10',scale:1.7,sw:25,aw:10,lw:11}),
 matriarche:H({name:'Matriarche lunaire',role:'Boss · vague 10',group:'b',enemy:true,sig:'#9fd8ff',rim:'#e6f6ff',body:'#2a4a6e',body2:'#c8dcef',metal:'#bfe6ff',skin:'#d9e6f2',hair:'#eef6ff',weapon:'staff',head:'icecrown',robe:true,float:true,scale:1.8,sw:17}),
 arbitre:H({name:'Arbitre de l\'Éclipse',role:'Boss · vague 15',group:'b',enemy:true,sig:'#b46bff',rim:'#dcc0ff',body:'#1d1430',body2:'#3a2660',metal:'#cfc6e6',skin:'#e8e2f2',hair:'#120c20',weapon:'blades',head:'mask',robe:true,float:true,halo:true,scale:1.8,sw:17}),
 souverain:H({name:'Souverain des Ruines',role:'Boss · vague 20',group:'b',enemy:true,sig:'#ffc85a',rim:'#fff0b0',body:'#5a4520',body2:'#2a1f3a',metal:'#a8843a',skin:'#a8843a',hair:'#2a1f3a',weapon:'greatsword',head:'crown',pauldron:true,cape:'#3a1f4a',scale:1.95,sw:27,aw:10,lw:11})
};
const ORDER={h:['taro','mei','sena','ren'],e:['brute','raider','shade','shadeElite','wolf'],b:['juge','cendrefer','matriarche','arbitre','souverain']};

/* ===================== POSES ===================== */
const ANIMS=[['idle','Idle',1.0],['course','Course',0.62],['attaque','Attaque',0.9],['touche','Touché',0.55],['mort','Mort',2.0]];
const ANIM_LEN=Object.fromEntries(ANIMS.map(a=>[a[0],a[2]]));
const FRAMES={idle:8,course:8,attaque:7,touche:3,mort:10};

function basePose(){return{x:0,y:0,lean:0,head:0,sx:1,sy:1,flash:0,dis:0,
  legs:[{t:-.18,s:-.1},{t:.22,s:.05}],arms:[{u:-.12,f:.25},{u:.35,f:1.1}],fx:[],hold:1,capeFlow:4,hairLag:0,charge:0,alpha:1}}

function idleArms(c,P,k,s){
  const w=c.weapon;
  if(w==='bow'){P.arms[1]={u:.5,f:.8};P.arms[0]={u:-.05,f:.3}}
  else if(w==='staff'){P.arms[1]={u:.25+.04*s,f:1.0};P.arms[0]={u:-.1,f:.2}}
  else if(w==='daggers'){P.arms[1]={u:.55+.05*s,f:1.5};P.arms[0]={u:.35-.05*s,f:1.3}}
  else if(w==='greatsword'||w==='halberd'||w==='scythe'){P.arms[1]={u:.45+.04*s,f:1.25};P.arms[0]={u:.3,f:1.15}}
  else if(w==='fists'){P.arms[1]={u:.25+.06*s,f:.6};P.arms[0]={u:-.15-.05*s,f:.3}}
  else if(w==='orb'){P.arms[1]={u:.7+.05*s,f:1.4};P.arms[0]={u:-.1,f:.2}}
  else if(w==='blades'){P.arms[1]={u:.3,f:.6};P.arms[0]={u:-.3,f:.3}}
  else {P.arms[1]={u:.4+.04*s,f:1.2};P.arms[0]={u:-.12,f:.3}}
}

function pose(c,anim,p,k){
  const P=basePose(); const s=Math.sin(p*TAU);
  if(anim==='idle'){
    P.y=s*1.1*k; P.sy=1+.012*s; P.lean=.05+.02*s; idleArms(c,P,k,s);
    if(c.float) P.y=-6+s*3*k;
    P.hairLag=s*.15; P.capeFlow=4+s*2;
  }
  else if(anim==='course'){
    const a=p*TAU;
    for(let i=0;i<2;i++){const ph=a+(i?0:Math.PI);const th=.75*k*Math.sin(ph);const bend=.2+.95*k*Math.max(0,Math.cos(ph+.35));P.legs[i]={t:th,s:th-bend}}
    P.y=2.2*k*Math.abs(Math.sin(a))-1.5*k; P.lean=.22*k; P.head=-.08;
    idleArms(c,P,k,0);
    const sw=Math.sin(a);
    P.arms[0]={u:-.75*k*sw,f:-.75*k*sw+.95};
    if(c.weapon==='fists') P.arms[1]={u:.75*k*sw,f:.75*k*sw+.9};
    else if(c.weapon==='daggers') P.arms[1]={u:.45*k*sw-.3,f:.6};
    else P.arms[1].u+= .18*k*sw;
    if(c.float){P.y=-8+Math.sin(a)*2;P.lean=.3*k}
    P.capeFlow=18*k+Math.sin(a*2)*4; P.hairLag=.5*k+.12*Math.sin(a*2);
  }
  else if(anim==='attaque') attackPose(c,P,p,k);
  else if(anim==='touche'){
    idleArms(c,P,k,0);
    const q=1-p; P.flash=p<.34?1:0;
    P.lean=-.42*k*q*q; P.x=-9*k*Math.sin(Math.min(1,p/.35)*Math.PI/2)*q*1.4; P.head=-.35*k*q;
    P.sx=1+.07*k*q; P.sy=1-.07*k*q; P.arms[0].u-=.6*k*q; P.arms[1].u-=.5*k*q;
    P.legs=[{t:-.35*k*q-.1,s:-.2},{t:.35*k*q+.15,s:.1}];
    if(c.float) P.y=-6;
    P.capeFlow=4-6*q; P.hairLag=-.4*q;
  }
  else if(anim==='mort'){
    idleArms(c,P,k,0);
    const q=eo(clamp(p/.42,0,1));
    P.flash=p<.08?1:0;
    P.lean=-.55*q*k; P.head=-.5*q;
    P.legs=[{t:-.2+.9*q,s:-.1-.7*q},{t:.22+1.1*q,s:.05-.9*q}];
    P.y=15*q; if(c.float) P.y=-6+20*q;
    P.arms[0]={u:-.5*q-.1,f:.2}; P.arms[1]={u:lerp(P.arms[1].u,-.7,q),f:lerp(P.arms[1].f,.3,q)};
    P.dis=clamp((p-.34)/.5,0,1); P.hold=q>.6?0:1;
    if(p>.34){const d=(p-.34)/.66;P.fx.push({t:'embers',d})}
    if(p>.88) P.alpha=0;
  }
  P.expr=anim==='attaque'?'angry':anim==='touche'?'hurt':anim==='mort'?'ko':'n';
  if(c.motes&&anim!=='mort') P.fx.push({t:'motes'});
  return P;
}

function attackPose(c,P,p,k){
  idleArms(c,P,k,0);
  const w=c.weapon;
  if(w==='bow'){
    const draw=eo(clamp(p/.42,0,1)), rel=clamp((p-.42)/.1,0,1), back=clamp((p-.6)/.4,0,1);
    P.arms[1]={u:1.5,f:1.52};
    const pull=draw*(1-rel);
    P.arms[0]={u:lerp(.3,1.3,draw),f:lerp(1.1,2.9,pull)+ (rel>0?-.6*rel:0)};
    P.lean=-.06*pull*k; P.x=-2*pull*k;
    if(p>=.42&&p<.62){P.lean=-.14*k*(1-rel*.5);P.x=-4*k}
    if(back>0){const e=eio(back);P.arms[1]={u:lerp(1.5,.5,e),f:lerp(1.52,.8,e)};P.arms[0]={u:lerp(1.3,-.05,e),f:lerp(2.3,.3,e)}}
    P.drawPull=pull; P.legs=[{t:-.35,s:-.25},{t:.35,s:.15}];
    if(p>=.42&&p<.8) P.fx.push({t:'arrow',d:(p-.42)/.38});
    return;
  }
  if(w==='staff'||w==='orb'){
    const up=eo(clamp(p/.38,0,1)), th=eo(clamp((p-.38)/.12,0,1)), back=eio(clamp((p-.65)/.35,0,1));
    let u=lerp(P.arms[1].u,-2.7,up), f=lerp(P.arms[1].f,-2.6,up);
    u=lerp(u,1.45,th); f=lerp(f,1.5,th);
    u=lerp(u,w==='orb'?.7:.25,back); f=lerp(f,w==='orb'?1.4:1.0,back);
    P.arms[1]={u,f}; P.lean=lerp(-.12*k*up,.22*k,th)*(1-back); P.x=(lerp(-2*up,6,th))*k*(1-back);
    P.charge=up*(1-th*.7)*(1-back); P.sy=1+.04*k*up*(1-th);
    P.capeFlow=4+10*th*(1-back); P.hairLag=-.3*up+.6*th*(1-back);
    if(p>.4&&p<.85) P.fx.push({t:'orb',d:(p-.4)/.45});
    if(p>.38&&p<.6) P.fx.push({t:'ring',d:(p-.38)/.22});
    return;
  }
  if(w==='daggers'){
    const crouch=eo(clamp(p/.14,0,1)), s1=eo(clamp((p-.14)/.12,0,1)), s2=eo(clamp((p-.3)/.12,0,1)), back=eio(clamp((p-.62)/.38,0,1));
    P.arms[1]={u:lerp(lerp(.55,-1.4,crouch),1.6,s1),f:lerp(lerp(1.5,-.6,crouch),1.9,s1)};
    P.arms[0]={u:lerp(lerp(.35,-1.6,s1),1.8,s2),f:lerp(lerp(1.3,-.8,s1),2.1,s2)};
    const ret=(a,b)=>lerp(a,b,back);
    P.arms[1]={u:ret(P.arms[1].u,.55),f:ret(P.arms[1].f,1.5)}; P.arms[0]={u:ret(P.arms[0].u,.35),f:ret(P.arms[0].f,1.3)};
    P.x=(lerp(-3*crouch,16,(s1+s2)/2))*k*(1-back); P.lean=(-.08*crouch+.35*(s1+s2)/2)*k*(1-back);
    P.sy=1-.06*k*crouch*(1-s1); P.legs=[{t:-.6*(1-back)-.1,s:-.4},{t:.6*(1-back)+.1,s:.2}];
    if(p>.14&&p<.5) P.fx.push({t:'smear',arm:1,a0:-1.4,a1:P.arms[1].u+.6,al:1-clamp((p-.3)/.2,0,1)});
    if(p>.3&&p<.66) P.fx.push({t:'smear',arm:0,a0:-1.6,a1:P.arms[0].u+.7,al:1-clamp((p-.46)/.2,0,1)});
    P.capeFlow=4+14*(s1+s2)/2*(1-back); P.hairLag=.6*(s1+s2)/2*(1-back);
    return;
  }
  // mêlée lourde : épée, espadon, faux, hallebarde, poings, lames
  const wind=eo(clamp(p/.36,0,1)), hit=ei(clamp((p-.36)/.12,0,1)), back=eio(clamp((p-.7)/.3,0,1));
  const a0=w==='fists'?-2.7:-2.5;
  let u=lerp(P.arms[1].u,a0,wind), f=lerp(P.arms[1].f,a0+.3,wind);
  const end=w==='fists'?.9:1.55;
  u=lerp(u,end,hit); f=lerp(f,end+.25,hit);
  const r=idleRef(c); u=lerp(u,r.u,back); f=lerp(f,r.f,back);
  P.arms[1]={u,f};
  if(w==='fists'||w==='greatsword'||w==='halberd'||w==='scythe'){const b=P.arms[0];P.arms[0]={u:lerp(lerp(b.u,a0+.2,wind),end-.1,hit)*(1-back)+b.u*back,f:lerp(lerp(b.f,a0+.4,wind),end+.2,hit)*(1-back)+b.f*back}}
  P.lean=(lerp(-.2*k*wind,.38*k,hit))*(1-back); P.x=(lerp(-4*wind,11,hit))*k*(1-back);
  P.sy=1-.07*k*wind*(1-hit)+.05*k*hit*(1-clamp((p-.48)/.1,0,1)); P.sx=2-P.sy;
  P.legs=[{t:lerp(-.18,-.55,Math.max(wind,hit))*(1-back)-.18*back,s:-.25},{t:lerp(.22,.6,hit)*(1-back)+.22*back,s:.1}];
  if(p>.36&&p<.7) P.fx.push({t:'smear',arm:1,a0:a0,a1:u+.25,al:1-clamp((p-.5)/.2,0,1)});
  if(p>.47&&p<.75) P.fx.push({t:'impact',d:(p-.47)/.28,ground:w==='fists'||w==='greatsword'||w==='halberd'});
  P.capeFlow=4+14*hit*(1-back)-4*wind*(1-hit); P.hairLag=-.3*wind+.7*hit*(1-back);
}
function idleRef(c){const P=basePose();idleArms(c,P,1,0);return P.arms[1]}

/* ===================== DESSIN ===================== */
// Matières par piste : A peint, B ombre, C pixel
function mat(c,key,style,shade){
  let col={body:c.body,body2:c.body2,metal:c.metal,skin:c.skin,hair:c.hair,cape:c.cape||c.body2,scarf:c.scarf||c.sig,band:c.band||c.sig,boots:c.boots||c.body,trim:c.trim||c.sig,ink:'#0b0a10',bone:c.skin}[key]||key;
  if(shade) col=mix(col,'#05070d',.35);
  if(style==='B') col=mix(col,'#06070c',.84);
  return col;
}
function glowCol(c,style){return style==='B'?c.rim:c.sig}

function capsule(g,L,w0,w1){g.beginPath();g.moveTo(-w0/2,0);g.lineTo(-w1/2,L);g.arc(0,L,w1/2,Math.PI,0,true);g.lineTo(w0/2,0);g.arc(0,0,w0/2,0,Math.PI,true);g.closePath()}

function fillShape(g,col,style,line=true){g.fillStyle=col;g.fill();if(line&&style!=='B'){g.lineWidth=style==='C'?1.2:1.1;g.strokeStyle='rgba(8,7,12,.85)';g.stroke()}else if(style==='B'){g.lineWidth=.8;g.strokeStyle='rgba(255,255,255,.05)';g.stroke()}
  if(style==='A'&&CEL.on) cel(g);}
const CEL={on:false};
function cel(g){ // ombre propre en aplat (bas-droite) + reflet (haut-gauche), décalages en pixels écran = lumière fixe
  const t=g.getTransform(), k=Math.hypot(t.a,t.b)||1;
  g.save(); g.clip(); g.rect(-5000,-5000,10000,10000); g.fillStyle='#000';
  g.shadowBlur=0; g.shadowColor='rgba(18,8,40,.42)'; g.shadowOffsetX=-3.2*k; g.shadowOffsetY=-3.4*k; g.fill('evenodd');
  g.shadowColor='rgba(255,238,215,.20)'; g.shadowOffsetX=1.3*k; g.shadowOffsetY=1.3*k; g.fill('evenodd');
  g.restore(); g.beginPath();}

function glow(g,col,blur,style){if(style==='C'){g.shadowBlur=0;return}g.shadowColor=col;g.shadowBlur=blur}
function noGlow(g){g.shadowBlur=0}

function drawWeapon(g,c,P,style,which){
  const w=c.weapon, gc=glowCol(c,style), metal=mat(c,'metal',style), dark=mat(c,'ink',style);
  g.save();
  if(w==='greatsword'||w==='sword'){
    const L=w==='greatsword'?56:36, W=w==='greatsword'?8:5;
    g.rotate(-.35);
    g.fillStyle=mat(c,'body2',style);g.fillRect(-2,-3,-9,6); // poignée
    g.beginPath();g.rect(-2,-W*.9,4,W*1.8);fillShape(g,metal,style);
    g.beginPath();g.moveTo(2,-W/2);g.lineTo(2+L*.85,-W/2);g.lineTo(2+L,0);g.lineTo(2+L*.85,W/2);g.lineTo(2,W/2);g.closePath();
    fillShape(g,style==='B'?mix('#9aa0ad','#06070c',.75):'#c8ccd8',style);
    glow(g,gc,8+(c.group==='h'?6*Math.sin(cyc(260)):0),style);g.strokeStyle=gc;g.lineWidth=1.6;g.beginPath();g.moveTo(5,-W/2+.8);g.lineTo(2+L*.85,-W/2+.8);g.lineTo(2+L-1,0);g.stroke();noGlow(g);
  } else if(w==='daggers'){
    g.rotate(-.2);
    g.beginPath();g.moveTo(1,-2.4);g.lineTo(17,-1);g.lineTo(20,0);g.lineTo(17,1.4);g.lineTo(1,2.4);g.closePath();
    fillShape(g,style==='B'?mix('#9aa0ad','#06070c',.75):'#d6d0dc',style);
    glow(g,gc,8,style);g.strokeStyle=gc;g.lineWidth=1.2;g.beginPath();g.moveTo(3,-1.8);g.lineTo(18,-.6);g.stroke();noGlow(g);
  } else if(w==='staff'){
    g.rotate(-1.45);
    g.beginPath();g.rect(-26,-1.6,66,3.2);fillShape(g,style==='B'?mix('#6b5a3a','#06070c',.8):'#7a6440',style);
    g.translate(42,0);
    glow(g,gc,14+10*P.charge,style);
    g.beginPath();g.arc(0,0,7,Math.PI*.35,Math.PI*1.65);g.arc(-3,0,5.4,Math.PI*1.6,Math.PI*.4,true);g.closePath();g.fillStyle=style==='B'?c.rim:mix(c.sig,'#ffffff',.35);g.fill();
    g.beginPath();g.arc(1,0,2.6+3*P.charge,0,TAU);g.fillStyle='#ffffff';g.fill();noGlow(g);
  } else if(w==='orb'){
    glow(g,gc,16+10*P.charge,style);
    g.beginPath();g.arc(2,6,5+2*P.charge,0,TAU);g.fillStyle=style==='B'?c.rim:mix(c.sig,'#ffffff',.25);g.fill();
    g.beginPath();g.arc(2,6,2,0,TAU);g.fillStyle='#fff';g.fill();noGlow(g);
  } else if(w==='bow'){
    g.rotate(-Math.PI/2+.0);
    const pull=P.drawPull||0;
    g.strokeStyle=style==='B'?mix('#c9a24a','#06070c',.7):'#b8892e';g.lineWidth=3.2;g.lineCap='round';
    g.beginPath();g.moveTo(-24,-2);g.quadraticCurveTo(0,-14,24,-2);g.stroke();
    glow(g,gc,8,style);g.strokeStyle=gc;g.lineWidth=1.2;g.beginPath();g.moveTo(-20,-5);g.quadraticCurveTo(0,-14.5,20,-5);g.stroke();noGlow(g);
    g.strokeStyle='rgba(230,230,240,.7)';g.lineWidth=.8;g.beginPath();g.moveTo(-24,-2);g.lineTo(0,2+pull*20);g.lineTo(24,-2);g.stroke();
    if(pull>.05){g.strokeStyle=style==='B'?'#555':'#ddd';g.lineWidth=1.3;g.beginPath();g.moveTo(0,2+pull*20);g.lineTo(0,-16);g.stroke();
      glow(g,gc,10,style);g.fillStyle=gc;g.beginPath();g.moveTo(-2.5,-14);g.lineTo(0,-20);g.lineTo(2.5,-14);g.fill();noGlow(g)}
  } else if(w==='scythe'||w==='halberd'){
    g.rotate(-1.35);
    g.beginPath();g.rect(-30,-1.8,82,3.6);fillShape(g,style==='B'?mix('#3a2a20','#06070c',.6):'#3e2c22',style);
    g.translate(50,0);
    g.beginPath();
    if(w==='scythe'){g.moveTo(0,-2);g.quadraticCurveTo(10,18,-14,34);g.quadraticCurveTo(2,16,-4,0);g.closePath()}
    else{g.moveTo(-6,-2);g.lineTo(6,-2);g.quadraticCurveTo(16,6,10,18);g.quadraticCurveTo(2,10,-6,10);g.closePath();g.moveTo(2,-2);g.lineTo(10,-6);g.lineTo(2,-10);}
    fillShape(g,style==='B'?mix('#9aa0ad','#06070c',.75):'#bfc2cc',style);
    glow(g,gc,10,style);g.strokeStyle=gc;g.lineWidth=1.4;g.beginPath();
    if(w==='scythe'){g.moveTo(-1,0);g.quadraticCurveTo(8,18,-13,33)}else{g.moveTo(8,0);g.quadraticCurveTo(15,6,10,17)}
    g.stroke();noGlow(g);
  } else if(w==='fists'){
    g.beginPath();g.arc(0,2,c.aw*.72,0,TAU);fillShape(g,mat(c,'metal',style),style);
    glow(g,gc,8,style);g.strokeStyle=gc;g.lineWidth=1.3;g.beginPath();g.moveTo(-3,0);g.lineTo(3,3);g.stroke();noGlow(g);
  }
  g.restore();
}

function drawHead(g,c,P,style){
  if(c.group==='h'){drawHeroHead(g,c,P,style);return}
  const r=c.headR, gc=glowCol(c,style), skin=mat(c,'skin',style), hair=mat(c,'hair',style), metal=mat(c,'metal',style);
  const lag=P.hairLag||0;
  // cheveux arrière
  if(c.head==='ponytail'){g.save();g.translate(-r*.6,-r*.5);g.rotate(1.2+lag*.8);g.beginPath();g.moveTo(-3,0);g.quadraticCurveTo(-6,14,-1,26);g.quadraticCurveTo(3,14,4,0);g.closePath();fillShape(g,hair,style);g.restore()}
  if(c.head==='long'||c.head==='icecrown'){g.beginPath();g.moveTo(-r*.2,-r*.9);g.quadraticCurveTo(-r*1.6-lag*6,r*.6,-r*1.1-lag*10,r*2.6);g.lineTo(-r*.2-lag*6,r*2.3);g.quadraticCurveTo(-r*.1,r*.8,r*.5,-r*.2);g.closePath();fillShape(g,hair,style)}
  if(c.halo){glow(g,gc,16,style);g.strokeStyle=gc;g.lineWidth=2.4;g.beginPath();g.ellipse(-r*.4,-r*.4,r*1.9,r*1.9,0,0,TAU);g.stroke();g.lineWidth=1;g.beginPath();g.ellipse(-r*.4,-r*.4,r*2.4,r*2.4,0,0,TAU);g.stroke();noGlow(g)}
  // tête
  if(c.head==='hood'){
    g.beginPath();g.moveTo(-r*1.2,r*.9);g.quadraticCurveTo(-r*1.4,-r*1.2,r*.2,-r*1.5);g.quadraticCurveTo(r*1.4,-r*.6,r*1.1,r*1);g.closePath();fillShape(g,mat(c,'body2',style),style);
    g.beginPath();g.ellipse(r*.35,r*.1,r*.6,r*.75,0,0,TAU);g.fillStyle='#050308';g.fill();
    glow(g,gc,10,style);g.fillStyle=style==='B'?c.rim:mix(c.sig,'#fff',.4);g.fillRect(r*.25,-r*.05,r*.28,r*.14);g.fillRect(r*.62,-r*.02,r*.22,r*.12);noGlow(g);return;
  }
  if(c.head==='skull'){
    g.beginPath();g.ellipse(0,0,r*.95,r,0,0,TAU);fillShape(g,mat(c,'bone',style),style);
    g.beginPath();g.rect(r*.05,r*.55,r*.75,r*.45);fillShape(g,mat(c,'bone',style,true),style);
    g.fillStyle='#0a0406';g.beginPath();g.ellipse(r*.45,-r*.05,r*.26,r*.3,0,0,TAU);g.fill();
    glow(g,gc,12,style);g.fillStyle=gc;g.beginPath();g.arc(r*.47,-r*.02,r*.11,0,TAU);g.fill();noGlow(g);
    if(c.horns){g.beginPath();g.moveTo(-r*.3,-r*.8);g.quadraticCurveTo(-r*1.6,-r*1.8,-r*1.1,-r*2.6);g.quadraticCurveTo(-r*.6,-r*1.6,r*.2,-r*.95);g.closePath();fillShape(g,mat(c,'body2',style),style);
      g.beginPath();g.moveTo(r*.2,-r*.9);g.quadraticCurveTo(r*.6,-r*2,r*1.3,-r*2.3);g.quadraticCurveTo(r*.9,-r*1.3,r*.8,-r*.6);g.closePath();fillShape(g,mat(c,'body2',style),style)}
    if(c.group==='b'){glow(g,gc,8,style);g.fillStyle=style==='B'?c.rim:'#c9a24a';for(let i=0;i<5;i++){g.beginPath();g.moveTo(-r*.8+i*r*.38,-r*.85);g.lineTo(-r*.62+i*r*.38,-r*1.5);g.lineTo(-r*.44+i*r*.38,-r*.85);g.fill()}noGlow(g)}
    return;
  }
  if(c.head==='mask'){
    g.beginPath();g.ellipse(0,0,r*.9,r*1.15,0,0,TAU);fillShape(g,style==='B'?mix('#e8e2f2','#06070c',.55):'#ece6f4',style);
    glow(g,gc,12,style);g.fillStyle=gc;g.beginPath();g.ellipse(r*.4,-r*.15,r*.32,r*.08,0,0,TAU);g.fill();g.beginPath();g.ellipse(-r*.2,-r*.15,r*.22,r*.07,0,0,TAU);g.fill();
    g.strokeStyle=gc;g.lineWidth=1;g.beginPath();g.moveTo(r*.1,-r*1);g.lineTo(r*.1,r*1);g.stroke();noGlow(g);return;
  }
  if(c.head==='helmet'||c.head==='crown'){
    g.beginPath();g.ellipse(0,0,r,r*1.05,0,0,TAU);fillShape(g,metal,style);
    g.beginPath();g.moveTo(-r*.2,-r*.25);g.lineTo(r*1.05,-r*.25);g.lineTo(r*1.05,r*.05);g.lineTo(-r*.2,r*.05);g.fillStyle='#050406';g.fill();
    glow(g,gc,10,style);g.fillStyle=gc;g.fillRect(r*.35,-r*.2,r*.55,r*.18);noGlow(g);
    if(c.horns){g.beginPath();g.moveTo(-r*.5,-r*.6);g.quadraticCurveTo(-r*1.8,-r*.9,-r*1.7,-r*2.1);g.quadraticCurveTo(-r*1.1,-r*1.2,-r*.1,-r*.95);g.closePath();fillShape(g,mat(c,'bone',style==='B'?'B':style),style)}
    if(c.head==='crown'){glow(g,gc,10,style);g.beginPath();g.moveTo(-r*.9,-r*.7);for(let i=0;i<=4;i++){g.lineTo(-r*.9+i*r*.45,-r*(i%2?1.25:1.7));g.lineTo(-r*.9+i*r*.45+r*.22,-r*.8)}g.lineTo(r*.95,-r*.65);g.closePath();g.fillStyle=style==='B'?c.rim:'#e3b450';g.fill();noGlow(g)}
    return;
  }
  // visage (héros, brute, matriarche)
  g.beginPath();g.ellipse(0,0,r*.92,r,0,0,TAU);fillShape(g,skin,style);
  // oeil
  if(style==='B'||c.enemy){glow(g,gc,10,style);g.fillStyle=style==='B'?c.rim:mix(c.sig,'#ffffff',.3);g.beginPath();g.ellipse(r*.48,r*.02,r*.18,r*.09,-.1,0,TAU);g.fill();noGlow(g)}
  else{g.fillStyle='#160c12';g.beginPath();g.ellipse(r*.5,r*.02,r*.14,r*.22,0,0,TAU);g.fill();g.fillStyle=c.sig;g.beginPath();g.ellipse(r*.52,r*.08,r*.08,r*.12,0,0,TAU);g.fill();g.fillStyle='#fff';g.fillRect(r*.46,-r*.12,r*.07,r*.07)}
  // coiffures
  g.beginPath();
  if(c.head==='spiky'){g.moveTo(-r*1,r*.3);g.lineTo(-r*1.5,-r*.2);g.lineTo(-r*1.05,-r*.55);g.lineTo(-r*1.45,-r*1.05);g.lineTo(-r*.6,-r*1.05);g.lineTo(-r*.5,-r*1.6);g.lineTo(0,-r*1.15);g.lineTo(r*.6,-r*1.5);g.lineTo(r*.6,-r*.95);g.lineTo(r*1.2,-r*.85);g.lineTo(r*.85,-r*.45);g.lineTo(r*.3,-r*.55);g.lineTo(r*.15,-r*.2);g.lineTo(-r*.3,-r*.1);g.closePath()}
  else if(c.head==='ponytail'||c.head==='short'){g.moveTo(-r*.95,r*.35);g.quadraticCurveTo(-r*1.2,-r*1.25,r*.2,-r*1.12);g.quadraticCurveTo(r*1.1,-r*.95,r*.95,-r*.2);g.lineTo(r*.55,-r*.45);g.lineTo(r*.4,-r*.1);g.lineTo(r*.1,-r*.5);g.lineTo(-r*.2,-r*.05);g.closePath()}
  else if(c.head==='long'||c.head==='icecrown'){g.moveTo(-r*.95,r*.5);g.quadraticCurveTo(-r*1.2,-r*1.25,r*.2,-r*1.12);g.quadraticCurveTo(r*1.1,-r*.95,r*.95,-r*.1);g.lineTo(r*.6,-r*.5);g.quadraticCurveTo(r*.1,-r*.3,-r*.2,r*.2);g.closePath()}
  else if(c.head==='bald'){g.moveTo(0,0)}
  fillShape(g,hair,style);
  if(c.head==='long'){glow(g,gc,10,style);g.fillStyle=style==='B'?c.rim:mix(c.sig,'#fff',.5);g.beginPath();g.arc(-r*.2,-r*.95,r*.32,Math.PI*.3,Math.PI*1.7);g.arc(-r*.32,-r*.95,r*.24,Math.PI*1.6,Math.PI*.4,true);g.fill();noGlow(g)}
  if(c.head==='icecrown'){glow(g,gc,14,style);g.fillStyle=style==='B'?c.rim:'#dff4ff';for(let i=0;i<5;i++){const x=-r*.9+i*r*.42,h=r*(1.2+((i+1)%3)*.5);g.beginPath();g.moveTo(x,-r*.8);g.lineTo(x+r*.14,-r*.8-h);g.lineTo(x+r*.3,-r*.8);g.fill()}noGlow(g)}
  if(c.head==='bald'){glow(g,gc,8,style);g.strokeStyle=gc;g.lineWidth=1;g.beginPath();g.moveTo(-r*.6,-r*.5);g.lineTo(-r*.1,-r*.2);g.lineTo(-r*.3,r*.3);g.stroke();noGlow(g)}
}

function drawHumanoid(g,c,P,style){
  const T=c.torso, L=c.leg, th=L/2;
  const hipY=-L+P.y+(c.float?-4:0);
  g.save(); g.translate(P.x,hipY);
  g.scale(P.sx,P.sy);
  const lean=P.lean+c.hunch;
  // pieds-hanche: jambes
  const drawLeg=(i,shade)=>{
    if(c.float) return;
    const l=P.legs[i]; g.save(); g.translate((i?1:-1)*c.hw*.28,0);
    g.rotate(-l.t); capsule(g,th,c.lw*1.1,c.lw*.9); fillShape(g,mat(c,c.robe?'body2':'body',style,shade),style);
    g.translate(0,th); g.rotate(-(l.s-l.t)); capsule(g,th,c.lw*.9,c.lw*.8); fillShape(g,mat(c,'body',style,shade),style);
    if(c.greaves){g.save();g.translate(0,th*.12);capsule(g,th*.8,c.lw*1.08,c.lw*.95);fillShape(g,mat(c,'metal',style,shade),style);g.beginPath();g.ellipse(0,0,c.lw*.62,c.lw*.5,0,0,TAU);fillShape(g,mat(c,'metal',style,shade),style);g.restore()}
    if(c.boots){g.save();g.translate(0,th*.3);capsule(g,th*.7,c.lw*.98,c.lw*.88);fillShape(g,mat(c,'boots',style,shade),style);if(style!=='B'){g.strokeStyle=c.sig;g.lineWidth=1.2;g.beginPath();g.moveTo(-c.lw*.48,0);g.lineTo(c.lw*.48,0);g.stroke()}g.restore()}
    g.translate(0,th); g.beginPath(); g.ellipse(c.lw*.55,0,c.lw*1.1,c.lw*.55,0,0,TAU); fillShape(g,mat(c,c.enemy||c.greaves?'metal':(c.boots?'boots':'ink'),style,shade),style);
    g.restore();
  };
  const shX=c.sw*.5;
  const arm=(i,shade)=>{
    const a=P.arms[i]; g.save(); g.translate(i?shX*.55:-shX*.45,-T+c.aw*.4);
    g.rotate(-a.u); capsule(g,c.arm/2,c.aw*1.05,c.aw*.9); fillShape(g,mat(c,c.weapon==='fists'?'skin':'body',style,shade),style);
    g.translate(0,c.arm/2); g.rotate(-(a.f-a.u)); capsule(g,c.arm/2,c.aw*.9,c.aw*.75); fillShape(g,mat(c,c.weapon==='fists'?'skin':(c.robe?'body2':(c.group==='h'&&!c.wraps?'body':'skin')),style,shade),style);
    if(c.gaunt){capsule(g,c.arm/2,c.aw*1.08,c.aw*.95);g.save();g.translate(0,c.arm*.12);capsule(g,c.arm*.38,c.aw*1.12,c.aw*1.02);fillShape(g,mat(c,'metal',style,shade),style);g.restore()}
    else if(c.wraps&&style!=='B'){g.strokeStyle='rgba(236,226,232,.75)';g.lineWidth=1;for(let j=0;j<4;j++){g.beginPath();g.moveTo(-c.aw*.45,c.arm*.22+j*3.2);g.lineTo(c.aw*.45,c.arm*.22+j*3.2+1.4);g.stroke()}}
    else if(c.group==='h'&&!c.robe){g.save();g.translate(0,c.arm*.3);g.beginPath();g.rect(-c.aw*.5,0,c.aw,c.arm*.14);fillShape(g,mat(c,'body2',style,shade),style);g.restore()}
    if(c.weapon==='fists'){g.save();g.rotate(.0);glow(g,glowCol(c,style),6,style);g.strokeStyle=glowCol(c,style);g.lineWidth=1;g.beginPath();g.moveTo(-2,4);g.lineTo(1,9);g.lineTo(-1,13);g.stroke();noGlow(g);g.restore()}
    g.translate(0,c.arm/2);
    if(P.hold&&(i===1||c.weapon==='daggers')) drawWeapon(g,c,P,style,i);
    else if(i===0&&P.hold&&(c.weapon==='greatsword'||c.weapon==='scythe'||c.weapon==='halberd')){}
    if(i===0&&c.weapon==='fists') drawWeapon(g,c,P,style,0);
    else if(i===1&&!P.hold&&c.weapon==='fists') drawWeapon(g,c,P,style,1);
    else if(c.weapon!=='blades'&&c.weapon!=='fists'){g.beginPath();g.arc(0,0,c.aw*.55,0,TAU);fillShape(g,mat(c,c.gaunt?'metal':'skin',style,shade),style)}
    g.restore();
    if(c.sleeves){ g.save(); g.translate(i?shX*.55:-shX*.45,-T+c.aw*.4); g.rotate(-a.u*.85); const L2=c.arm/2, sw2=(P.capeFlow-4)*.15;
      g.beginPath(); g.moveTo(-c.aw*.6,-1); g.lineTo(c.aw*.6,-1); g.quadraticCurveTo(c.aw*1.6,L2*.8,c.aw*1.5-sw2,L2+9); g.lineTo(-c.aw*.2-sw2,L2+13); g.quadraticCurveTo(-c.aw*1.3,L2+6,-c.aw*.6,-1); g.closePath();
      fillShape(g,mat(c,'body',style,shade),style);
      if(style!=='B'){g.strokeStyle=c.trim;g.lineWidth=1.6;g.beginPath();g.moveTo(c.aw*1.5-sw2,L2+9);g.lineTo(-c.aw*.2-sw2,L2+13);g.stroke()}
      g.restore(); }
  };
  g.save(); g.rotate(lean*.25);
  // cape
  if(c.cape){
    g.save(); g.rotate(lean*.75);
    const fl=P.capeFlow, Lc=T+L*.75, wv=Math.sin(RIG.now/180)*0;
    g.beginPath(); g.moveTo(-shX*.7,-T+2); g.lineTo(shX*.4,-T+1);
    g.quadraticCurveTo(-4-fl*.3,-T*.3,-fl*.9+2,-T+Lc*.98-fl*.35);
    for(let i=0;i<4;i++){const xx=-fl*.9+2-i*4-fl*.08*i, yy=-T+Lc-fl*.35+(i%2?-5:0)-i*fl*.06; g.lineTo(xx,yy)}
    g.quadraticCurveTo(-shX*1.1-fl*.5,-T*.4,-shX*.7,-T+2); g.closePath(); fillShape(g,mat(c,'cape',style),style);
    g.restore();
  }
  if(c.weapon==='blades'){ // lames en orbite derrière
    for(let i=0;i<3;i++){const a=cyc(1000/1.2)+i*TAU/3; g.save(); g.translate(Math.cos(a)*24-6,-T-6+Math.sin(a)*8); g.rotate(a*.5+Math.PI/2);
      g.beginPath();g.moveTo(0,-14);g.lineTo(3,0);g.lineTo(0,14);g.lineTo(-3,0);g.closePath();fillShape(g,style==='B'?mix('#cfc6e6','#06070c',.7):'#d7d0ea',style);
      glow(g,glowCol(c,style),10,style);g.strokeStyle=glowCol(c,style);g.lineWidth=1;g.beginPath();g.moveTo(0,-13);g.lineTo(0,13);g.stroke();noGlow(g);g.restore()}
  }
  g.restore();
  g.save();g.rotate(lean);arm(0,true);g.restore();
  drawLeg(0,true);
  const robeLegs=c.robe&&!c.float; if(robeLegs) drawLeg(1,false);
  // robe / traîne flottante
  if(c.robe||c.float){
    g.save(); g.rotate(lean*.3);
    const hem=c.float?L*.85:L-1, fw=c.hw*(c.float?2:1.9), sway=Math.sin(cyc(300))*2-(P.capeFlow-4)*.25;
    g.beginPath(); g.moveTo(-c.hw*.6,-2); g.lineTo(c.hw*.6,-2);
    if(c.float){ g.quadraticCurveTo(fw*.8,hem*.5,sway+4,hem); g.quadraticCurveTo(-fw*.2,hem*.6,-fw*.9+sway,hem*.75); g.quadraticCurveTo(-fw*.7,hem*.3,-c.hw*.6,-2);}
    else { g.lineTo(fw*.55+sway*.5,hem); for(let i=0;i<5;i++){g.lineTo(fw*.55-(i+1)*fw*.22+sway*.5,hem+(i%2?-3:0))} g.closePath(); }
    fillShape(g,mat(c,c.float?'body':'body',style),style);
    if(c.trim&&!c.float&&style!=='B'){g.strokeStyle=c.trim;g.lineWidth=2;g.beginPath();g.moveTo(fw*.55+sway*.5,hem);for(let i=0;i<5;i++){g.lineTo(fw*.55-(i+1)*fw*.22+sway*.5,hem+(i%2?-3:0))}g.stroke();g.lineWidth=1.2;g.beginPath();g.moveTo(c.hw*.15,0);g.lineTo(c.hw*.45+sway*.3,hem-2);g.stroke()}
    if(style!=='C'){glow(g,glowCol(c,style),6,style);g.strokeStyle=rgba(glowCol(c,style),.55);g.lineWidth=1;g.beginPath();g.moveTo(-c.hw*.5,6);g.lineTo(c.hw*.5,6);g.stroke();noGlow(g)}
    g.restore();
  }
  if(!robeLegs) drawLeg(1,false);
  if(!c.robe&&!c.float){ // pans de tunique / pagne qui suivent le mouvement
    g.save(); g.rotate(lean*.4); const fl=(P.capeFlow-4)*(c.coat?.05:.04); const Lf=c.weapon==='fists'?16:c.coat?27:13;
    for(const [x0,sh] of [[-c.hw*.55,true],[c.hw*.05,false]]){ g.save(); g.translate(x0+c.hw*.25,-3); g.rotate(fl+(sh?.12:-.05));
      g.beginPath(); g.moveTo(-c.hw*.3,0); g.lineTo(c.hw*.3,0); g.lineTo(c.hw*.24,Lf); g.lineTo(0,Lf+3); g.lineTo(-c.hw*.26,Lf-1); g.closePath(); fillShape(g,mat(c,c.coat?'body':(c.flapMat||'body2'),style,sh),style);
      if(c.trim&&style!=='B'){g.strokeStyle=c.trim;g.lineWidth=1.3;g.beginPath();g.moveTo(c.hw*.24,Lf);g.lineTo(0,Lf+3);g.lineTo(-c.hw*.26,Lf-1);g.stroke()} g.restore(); }
    g.restore();
  }
  if(c.robe&&!c.float){ // re-couvrir le haut des jambes
    g.save();g.rotate(lean*.3);g.beginPath();g.moveTo(-c.hw*.6,-2);g.lineTo(c.hw*.6,-2);g.lineTo(c.hw*1.05,L*.45);g.lineTo(-c.hw*1.05,L*.45);g.closePath();fillShape(g,mat(c,'body',style),style,false);g.restore();
  }
  // torse
  g.save(); g.rotate(lean);
  if(c.quiver){ g.save(); g.translate(-c.sw*.42,-T*.5); g.rotate(-.45);
    g.beginPath(); g.rect(-4,-20,8,30); fillShape(g,style==='B'?mat(c,'body',style):'#5a3a22',style);
    glow(g,glowCol(c,style),8,style); g.fillStyle=style==='B'?c.rim:'#7fe0ff';
    for(let j=0;j<3;j++){g.beginPath();g.moveTo(-3+j*3,-20);g.lineTo(-4.5+j*3,-28);g.lineTo(-1.5+j*3,-27);g.closePath();g.fill()} noGlow(g);
    if(style!=='B'){g.strokeStyle=c.trim;g.lineWidth=1.4;g.beginPath();g.moveTo(-4,-14);g.lineTo(4,-14);g.moveTo(-4,4);g.lineTo(4,4);g.stroke()}
    g.restore(); }
  g.beginPath(); g.moveTo(-c.hw*.55,2); g.lineTo(c.hw*.55,2);
  const wq=c.waist||1; g.quadraticCurveTo(c.sw*.62*wq,-T*.5,c.sw*.55,-T); g.quadraticCurveTo(0,-T-4,-c.sw*.55,-T); g.quadraticCurveTo(-c.sw*.6*wq,-T*.5,-c.hw*.55,2); g.closePath();
  fillShape(g,mat(c,'body',style),style);
  if(c.pauldron||c.group==='h'){g.beginPath();g.moveTo(-c.sw*.32,-T+3);g.quadraticCurveTo(c.sw*.5,-T+2,c.sw*.45,-T*.45);g.quadraticCurveTo(c.sw*.1,-T*.25,-c.sw*.25,-T*.4);g.closePath();fillShape(g,mat(c,c.pauldron?'metal':'body2',style),style)}
  // ceinture + détail signature
  g.beginPath(); g.rect(-c.hw*.6,-5,c.hw*1.2,4); fillShape(g,mat(c,'body2',style),style);
  glow(g,glowCol(c,style),8,style); g.fillStyle=glowCol(c,style);
  if(c.enemy&&c.group!=='b'&&c.weapon==='fists'){g.strokeStyle=glowCol(c,style);g.lineWidth=1.2;g.beginPath();g.moveTo(-6,-T+6);g.lineTo(0,-T*.6);g.lineTo(-3,-T*.35);g.lineTo(4,-T*.15);g.stroke()}
  else if(c.emblem){g.beginPath();g.moveTo(c.sw*.18,-T*.78);g.lineTo(c.sw*.18+3.4,-T*.62);g.lineTo(c.sw*.18,-T*.46);g.lineTo(c.sw*.18-3.4,-T*.62);g.closePath();g.fill()}
  else if(c.group==='h'){g.fillRect(-c.hw*.1,-5,c.hw*.25,4)}
  else {g.beginPath();g.arc(c.sw*.18,-T*.62,1.8,0,TAU);g.fill()}
  noGlow(g);
  if(c.collar){g.beginPath();g.moveTo(-c.sw*.42,-T+2);g.lineTo(-c.sw*.38,-T-7);g.quadraticCurveTo(0,-T-3,c.sw*.3,-T-5);g.lineTo(c.sw*.38,-T+2);g.closePath();fillShape(g,mat(c,'body',style),style);if(style!=='B'){g.strokeStyle=c.trim;g.lineWidth=1.3;g.beginPath();g.moveTo(-c.sw*.38,-T-7);g.quadraticCurveTo(0,-T-3,c.sw*.3,-T-5);g.stroke()}}
  if(c.trim&&!c.robe&&style!=='B'){g.strokeStyle=c.trim;g.lineWidth=1.2;g.beginPath();g.moveTo(c.sw*.3,-T+1);g.quadraticCurveTo(c.sw*.05,-T*.5,c.hw*.2,0);g.stroke()}
  if(c.scarf){ g.save(); g.translate(0,-T+2); const fl=P.capeFlow;
    g.beginPath(); g.moveTo(-c.sw*.45,0); g.lineTo(c.sw*.45,0); g.lineTo(c.sw*.3,4); g.lineTo(-c.sw*.3,4); g.closePath(); fillShape(g,mat(c,'scarf',style),style);
    g.beginPath(); g.moveTo(-c.sw*.3,1); g.quadraticCurveTo(-10-fl*.6,4+fl*.1,-14-fl*1.1,10-fl*.25); g.lineTo(-12-fl*1.05,14-fl*.2); g.quadraticCurveTo(-8-fl*.5,9,-c.sw*.2,4); g.closePath(); fillShape(g,mat(c,'scarf',style),style);
    g.restore(); }
  // tête
  g.save(); g.translate(2,-T-3-c.headR*.95); g.rotate(P.head*.8); drawHead(g,c,P,style); g.restore();
  if(c.pauldron){g.beginPath();g.ellipse(shX*.55,-T+3,c.aw*1.3,c.aw*.95,-.3,0,TAU);fillShape(g,mat(c,'metal',style),style)}
  arm(1,false);
  g.restore();
  g.restore();
}

function drawWolf(g,c,P,style,anim,p,k){
  const gc=glowCol(c,style), fur=mat(c,'body',style), dark=mat(c,'body2',style), shadeF=mat(c,'body',style,true);
  let bodyY=-26, x=P.x, tilt=0, headA=0, jaw=0, legA=[0,0,0,0], legB=[0,0,0,0], tail=Math.sin(p*TAU)*.2;
  if(anim==='idle'){bodyY+=Math.sin(p*TAU)*.8;headA=Math.sin(p*TAU)*.05;jaw=.05}
  if(anim==='course'){const a=p*TAU;for(let i=0;i<4;i++){const ph=a+(i<2?0:Math.PI*.9)+(i%2?.5:0);legA[i]=.8*k*Math.sin(ph);legB[i]=-.6*k*Math.max(0,Math.cos(ph))}bodyY+=-3*k*Math.abs(Math.sin(a));tilt=.08*Math.sin(a)*k;tail=.5+.2*Math.sin(a*2)}
  if(anim==='attaque'){const w=eo(clamp(p/.35,0,1)),h=eo(clamp((p-.35)/.15,0,1)),b=eio(clamp((p-.65)/.35,0,1));
    bodyY+=6*w*(1-h)-6*h*(1-b);tilt=(.25*w-.4*h)*(1-b)*k;x+=(-6*w+22*h)*k*(1-b);jaw=(.2*w+.6*h)*(1-b);headA=(-.2*w+.25*h)*(1-b);
    legA=[(.5*h-.3*w)*(1-b),(.7*h-.2*w)*(1-b),(-.6*h+.4*w)*(1-b),(-.4*h+.3*w)*(1-b)];
    if(p>.35&&p<.7)P.fx.push({t:'bite',d:(p-.35)/.35,x:x})}
  if(anim==='touche'){const q=1-p;x-=10*k*q;tilt=.25*k*q;headA=-.4*q}
  if(anim==='mort'){const q=eo(clamp(p/.42,0,1));bodyY+=16*q;tilt=-.2*q;headA=.5*q;legA=[1.1*q,.9*q,-1*q,-1.2*q]}
  g.save(); g.translate(x,0); g.scale(P.sx,P.sy);
  const leg=(lx,i,sh)=>{g.save();g.translate(lx,bodyY+4);g.rotate(-legA[i]);capsule(g,12,7,5);fillShape(g,sh?shadeF:fur,style);g.translate(0,12);g.rotate(-legB[i]+(i<2?.2:-.3));capsule(g,12,5,4);fillShape(g,sh?shadeF:fur,style);g.translate(0,12);g.beginPath();g.ellipse(2,0,4,2.2,0,0,TAU);fillShape(g,dark,style);g.restore()};
  leg(-18,2,true);leg(14,0,true);
  g.save(); g.translate(0,bodyY); g.rotate(tilt);
  // queue
  g.save();g.translate(-24,-4);g.rotate(-1.1-tail);g.beginPath();g.moveTo(-3,0);g.quadraticCurveTo(-6,14,2,24);g.quadraticCurveTo(4,12,4,0);g.closePath();fillShape(g,dark,style);g.restore();
  // corps
  g.beginPath();g.moveTo(-26,-2);g.quadraticCurveTo(-24,-14,-6,-13);g.quadraticCurveTo(12,-20,22,-12);g.quadraticCurveTo(26,0,18,8);g.quadraticCurveTo(0,10,-18,8);g.quadraticCurveTo(-28,6,-26,-2);g.closePath();fillShape(g,fur,style);
  // crinière en pointes
  g.beginPath();g.moveTo(-6,-13);for(let i=0;i<6;i++){g.lineTo(-4+i*5,-20-(i%2?2:7));g.lineTo(-1+i*5,-14)}g.lineTo(24,-8);g.lineTo(10,-10);g.closePath();fillShape(g,dark,style);
  glow(g,gc,8,style);g.strokeStyle=gc;g.lineWidth=1.1;g.beginPath();g.moveTo(-14,-6);g.lineTo(-6,-2);g.lineTo(2,-7);g.lineTo(8,0);g.stroke();noGlow(g);
  // tête
  g.save();g.translate(22,-12);g.rotate(headA);
  g.beginPath();g.moveTo(-4,-6);g.quadraticCurveTo(4,-11,10,-6);g.lineTo(22,-2);g.lineTo(22,2);g.lineTo(8,4);g.quadraticCurveTo(-2,8,-6,2);g.closePath();fillShape(g,fur,style);
  g.save();g.translate(8,3);g.rotate(jaw);g.beginPath();g.moveTo(0,0);g.lineTo(13,0);g.lineTo(11,3);g.lineTo(0,4);g.closePath();fillShape(g,dark,style);
  if(jaw>.15){g.fillStyle='#eee';for(let i=0;i<3;i++){g.beginPath();g.moveTo(3+i*3.5,0);g.lineTo(4.5+i*3.5,-2.2);g.lineTo(6+i*3.5,0);g.fill()}}g.restore();
  g.beginPath();g.moveTo(-2,-7);g.lineTo(0,-17);g.lineTo(5,-8);g.closePath();fillShape(g,dark,style);
  glow(g,gc,10,style);g.fillStyle=style==='B'?c.rim:mix(c.sig,'#fff',.3);g.beginPath();g.ellipse(10,-4,2.2,1.1,-.2,0,TAU);g.fill();noGlow(g);
  g.restore();
  g.restore();
  leg(-12,3,false);leg(20,1,false);
  g.restore();
}


function drawHeroHead(g,c,P,style){
  const r=c.headR, hair=mat(c,'hair',style), skin=mat(c,'skin',style), lag=P.hairLag||0, ink='#1c1016', ex=.5*r, ey=.16*r;
  const hairHi=style==='A'?mix(c.hair,'#ffffff',c.head==='long'?.6:.3):(style==='C'?mix(c.hair,'#ffffff',.2):hair);
  const expr=P.expr||'n';
  // --- cheveux arrière
  if(c.head==='spiky'){
    g.beginPath();
    for(let i=0;i<=12;i++){const a=-Math.PI*.38-i*(Math.PI*.95/12);const sp=i%2===0;const rr=sp?r*(1.55+(i%4?0:.15)):r*1.0;const lx=sp?-lag*4*(i/12):0;g.lineTo(Math.cos(a)*rr+lx-r*.08,Math.sin(a)*rr-r*.02+(sp?lag*2*(i/12):0))}
    g.closePath(); fillShape(g,hair,style);
    if(c.band){ // pans du bandeau
      g.beginPath();g.moveTo(-r*.85,-r*.35);g.quadraticCurveTo(-r*1.6-lag*5,-r*.2,-r*2.1-lag*10,r*.25+lag*2);g.lineTo(-r*2-lag*9,r*.55+lag*2);g.quadraticCurveTo(-r*1.4-lag*4,r*.05,-r*.8,-r*.1);g.closePath();fillShape(g,mat(c,'band',style),style);
      g.beginPath();g.moveTo(-r*.85,-r*.25);g.quadraticCurveTo(-r*1.4-lag*4,r*.2,-r*1.7-lag*7,r*.85);g.lineTo(-r*1.5-lag*6,r*.95);g.quadraticCurveTo(-r*1.2,r*.3,-r*.8,-r*.05);g.closePath();fillShape(g,mat(c,'band',style,true),style);
    }
  } else if(c.head==='ponytail'){
    g.save(); g.translate(-r*.7,-r*.85); g.rotate(-.5+lag*.9);
    g.beginPath(); g.moveTo(0,-r*.25); g.bezierCurveTo(-r*1.3,-r*.1,-r*1.6,r*1.2,-r*1.1,r*2.5); g.quadraticCurveTo(-r*.9,r*1.6,-r*.3,r*2.1); g.bezierCurveTo(-r*.6,r*1.1,-r*.3,r*.4,r*.2,r*.2); g.closePath(); fillShape(g,hair,style);
    if(style==='A'){g.strokeStyle=hairHi;g.lineWidth=1.2;g.beginPath();g.moveTo(-r*.3,0);g.bezierCurveTo(-r*1,r*.2,-r*1.2,r*1,-r*1.05,r*1.9);g.stroke()}
    // ruban
    glow(g,glowCol(c,style),6,style);
    g.beginPath();g.moveTo(0,0);g.lineTo(-r*.55,-r*.55);g.lineTo(-r*.35,r*.05);g.closePath();g.moveTo(0,0);g.lineTo(-r*.6,r*.5);g.lineTo(-r*.1,r*.35);g.closePath();
    g.fillStyle=style==='B'?c.rim:c.sig;g.fill();noGlow(g);
    g.restore();
    g.beginPath(); g.ellipse(-r*.1,-r*.12,r*1.05,r*1.05,0,0,TAU); fillShape(g,hair,style);
  } else if(c.head==='long'){
    g.beginPath(); g.moveTo(r*.1,-r*1.12); g.bezierCurveTo(-r*1.3,-r*1.1,-r*1.4-lag*4,r*.5,-r*1.3-lag*8,r*2.2);
    g.quadraticCurveTo(-r*1.5-lag*10,r*2.9,-r*1.0-lag*11,r*3.4); g.quadraticCurveTo(-r*.9-lag*8,r*2.9,-r*.6-lag*8,r*3.0); g.quadraticCurveTo(-r*.3-lag*5,r*2.2,-r*.1-lag*4,r*2.5);
    g.quadraticCurveTo(-r*.1,r*1.2,r*.3,r*.3); g.closePath(); fillShape(g,hair,style);
    if(style==='A'){g.strokeStyle=hairHi;g.lineWidth=1.2;for(const o of [0,.35]){g.beginPath();g.moveTo(-r*(.7+o),-r*.6);g.bezierCurveTo(-r*(1.1+o)-lag*3,r*.4,-r*(1+o)-lag*6,r*1.6,-r*(1.05+o*.5)-lag*9,r*2.8);g.stroke()}}
  } else {
    g.beginPath(); g.ellipse(-r*.12,-r*.1,r*1.06,r*1.04,0,0,TAU); fillShape(g,hair,style);
    g.beginPath();g.moveTo(-r*.9,-r*.3);g.lineTo(-r*1.35-lag*3,-r*.05);g.lineTo(-r*1.0,r*.15);g.lineTo(-r*1.3-lag*3,r*.45);g.lineTo(-r*.8,r*.5);g.closePath();fillShape(g,hair,style);
  }
  // --- visage
  g.beginPath(); g.moveTo(-r*.2,-r*.95); g.bezierCurveTo(-r*1.05,-r*.9,-r*1.0,r*.45,-r*.55,r*.62);
  g.quadraticCurveTo(-r*.1,r*.95,r*.36,r*1.0); g.quadraticCurveTo(r*.7,r*.78,r*.86,r*.34); g.lineTo(r*.92,r*.06); g.quadraticCurveTo(r*.98,-r*.78,-r*.2,-r*.95);
  fillShape(g,skin,style);
  if(style!=='B'){g.beginPath(); g.ellipse(-r*.3,r*.22,r*.11,r*.17,.2,0,TAU); g.fillStyle=mix(c.skin,'#c08070',.25); g.fill(); g.strokeStyle='rgba(90,40,40,.6)'; g.lineWidth=.8; g.stroke();}
  if(style==='A'){g.fillStyle='rgba(255,110,120,.22)';g.beginPath();g.ellipse(r*.52,r*.55,r*.17,r*.08,0,0,TAU);g.fill()}
  // --- oeil
  if(style==='B'){ glow(g,c.rim,10,style); g.fillStyle=c.rim; g.beginPath(); g.ellipse(ex,ey,r*.16,r*.07,-.1,0,TAU); g.fill(); noGlow(g); }
  else if(expr==='hurt'||expr==='ko'){ g.strokeStyle=ink; g.lineWidth=1.4; g.lineCap='round'; g.beginPath();
    if(expr==='hurt'){g.moveTo(ex-r*.2,ey-r*.14);g.lineTo(ex+r*.12,ey);g.lineTo(ex-r*.2,ey+r*.14)} else {g.moveTo(ex-r*.2,ey+r*.02);g.quadraticCurveTo(ex,ey+r*.14,ex+r*.2,ey+r*.02)} g.stroke(); }
  else {
    g.beginPath(); g.ellipse(ex,ey,r*.2,r*.27,0,0,TAU); g.fillStyle='#fbf6f2'; g.fill();
    const ir=g.createLinearGradient(0,ey-r*.25,0,ey+r*.25); ir.addColorStop(0,mix(c.sig,'#000000',.55)); ir.addColorStop(1,mix(c.sig,'#ffffff',.35));
    g.beginPath(); g.ellipse(ex+r*.05,ey+r*.03,r*.14,r*.23,0,0,TAU); g.fillStyle=style==='C'?c.sig:ir; g.fill();
    g.beginPath(); g.ellipse(ex+r*.06,ey+r*.04,r*.06,r*.11,0,0,TAU); g.fillStyle=ink; g.fill();
    g.fillStyle='#fff'; g.beginPath(); g.arc(ex-r*.01,ey-r*.09,r*.055,0,TAU); g.fill(); g.beginPath(); g.arc(ex+r*.1,ey+r*.13,r*.03,0,TAU); g.fill();
    g.strokeStyle=ink; g.lineWidth=1.9; g.lineCap='round'; g.beginPath(); g.moveTo(ex-r*.28,ey-r*.12); g.quadraticCurveTo(ex,ey-r*.36,ex+r*.27,ey-r*.2); g.stroke();
    g.lineWidth=1.1; g.beginPath(); g.moveTo(r*.9,ey-r*.18); g.lineTo(r*.95,ey+r*.12); g.stroke();
  }
  // sourcils, bouche
  if(style!=='B'){
    g.strokeStyle=mix(c.hair,'#000000',.2); g.lineWidth=1.3; g.lineCap='round'; g.beginPath();
    if(expr==='angry'){g.moveTo(ex-r*.26,ey-r*.5);g.lineTo(ex+r*.24,ey-r*.33)} else if(expr==='hurt'){g.moveTo(ex-r*.26,ey-r*.36);g.lineTo(ex+r*.24,ey-r*.5)} else {g.moveTo(ex-r*.26,ey-r*.44);g.quadraticCurveTo(ex,ey-r*.54,ex+r*.26,ey-r*.46)}
    g.stroke();
    if(expr==='angry'||expr==='hurt'){g.fillStyle='#5a1a22';g.beginPath();g.moveTo(r*.5,r*.62);g.lineTo(r*.74,r*.6);g.lineTo(r*.66,r*.76);g.closePath();g.fill()}
    else {g.strokeStyle='#7a3a3a';g.lineWidth=1;g.beginPath();g.moveTo(r*.56,r*.66);g.lineTo(r*.7,r*.64);g.stroke()}
  }
  // --- frange
  g.beginPath();
  if(c.head==='spiky'){ g.moveTo(-r*.8,-r*.3); g.quadraticCurveTo(-r*.7,-r*1.3,r*.3,-r*1.15); g.lineTo(r*1.35,-r*.85); g.lineTo(r*.95,-r*.5); g.lineTo(r*1.15,-r*.1); g.lineTo(r*.72,-r*.22); g.lineTo(r*.62,r*.12); g.lineTo(r*.45,-r*.32); g.lineTo(r*.22,-r*.05); g.lineTo(r*.12,-r*.45); g.lineTo(-r*.2,-r*.2); g.lineTo(-r*.3,-r*.55); g.lineTo(-r*.55,-r*.15); g.closePath(); }
  else { g.moveTo(-r*.8,-r*.25); g.quadraticCurveTo(-r*.7,-r*1.28,r*.3,-r*1.14); g.quadraticCurveTo(r*1.05,-r*.98,r*1.0,-r*.12); g.lineTo(r*.8,-r*.32); g.lineTo(r*.7,r*.02); g.lineTo(r*.52,-r*.36); g.lineTo(r*.32,-r*.06); g.lineTo(r*.2,-r*.46); g.lineTo(-r*.05,-r*.16); g.lineTo(-r*.18,-r*.52); g.lineTo(-r*.5,-r*.18); g.closePath(); }
  fillShape(g,hair,style);
  if(c.head==='long'){ g.beginPath(); g.moveTo(-r*.05,-r*.45); g.quadraticCurveTo(-r*.05,r*.6,r*.12,r*1.45); g.lineTo(-r*.12,r*1.25); g.quadraticCurveTo(-r*.35,r*.5,-r*.3,-r*.4); g.closePath(); fillShape(g,hair,style); }
  if(style!=='B'){ g.strokeStyle=hairHi; g.lineWidth=style==='C'?1.4:1.8; g.lineCap='round'; g.beginPath(); g.arc(-r*.08,-r*.12,r*.84,-Math.PI*.86,-Math.PI*.56); g.stroke(); g.lineWidth=1.1; g.beginPath(); g.arc(-r*.08,-r*.12,r*.84,-Math.PI*.5,-Math.PI*.4); g.stroke(); }
  // --- accessoires
  if(c.band){ g.beginPath(); g.moveTo(-r*.92,-r*.5); g.quadraticCurveTo(0,-r*.85,r*.98,-r*.6); g.lineTo(r*.98,-r*.4); g.quadraticCurveTo(0,-r*.62,-r*.92,-r*.28); g.closePath(); fillShape(g,mat(c,'band',style),style);
    glow(g,glowCol(c,style),6,style); g.fillStyle=style==='B'?c.rim:'#c9ccd8'; g.fillRect(r*.35,-r*.66,r*.36,r*.2); noGlow(g); }
  if(c.head==='long'){ glow(g,glowCol(c,style),12,style); g.fillStyle=style==='B'?c.rim:mix(c.sig,'#ffffff',.55);
    g.beginPath(); g.arc(-r*.45,-r*.82,r*.34,Math.PI*.25,Math.PI*1.75); g.arc(-r*.58,-r*.82,r*.27,Math.PI*1.65,Math.PI*.35,true); g.fill();
    g.strokeStyle=style==='B'?c.rim:c.trim; g.lineWidth=1; g.beginPath(); g.moveTo(-r*.6,-r*.62); g.quadraticCurveTo(r*.2,-r*.78,r*.94,-r*.5); g.stroke();
    g.fillStyle=style==='B'?c.rim:mix(c.sig,'#ffffff',.3); g.beginPath(); g.arc(r*.92,-r*.5,r*.09,0,TAU); g.fill(); noGlow(g); }
  if(c.head==='short'&&c.quiver){ glow(g,glowCol(c,style),6,style); g.strokeStyle=style==='B'?c.rim:'#e8c25a'; g.lineWidth=1.3; g.beginPath(); g.arc(-r*.24,r*.2,r*.2,-.8,1.6); g.stroke();
    g.fillStyle=style==='B'?c.rim:'#7fe0ff'; g.beginPath(); g.moveTo(-r*.9,-r*.55); g.quadraticCurveTo(-r*1.7-lag*4,-r*1.1,-r*1.9-lag*6,-r*.6); g.quadraticCurveTo(-r*1.4,-r*.6,-r*.85,-r*.4); g.fill(); noGlow(g); }
}

/* ===================== RENDU COMPLET (liseré, flash, dissolution, effets) ===================== */
const pool={};
function oc(id,w,h){let c=pool[id];if(!c){c=pool[id]=typeof document!=='undefined'?document.createElement('canvas'):new OffscreenCanvas(w,h)}if(c.width!==w||c.height!==h){c.width=w;c.height=h}return c}

function renderSprite(id,c,anim,p,style,s,k){
  // s = pixels par unité ; retourne {cv, ox, oy} avec ox,oy = position des pieds dans cv
  const sc=s*c.scale, W=Math.ceil(240*sc), Hh=Math.ceil(195*sc), ox=W*.4, oy=Hh*.86;
  const P=c.kind==='w'?Object.assign(basePose(),pose(c,anim==='attaque'?'idle':anim,p,k)):pose(c,anim,p,k);
  if(c.kind==='w'){P.x=0;P.lean=0;P.sx=anim==='touche'?1+.07*(1-p):1;P.sy=2-P.sx}
  const body=oc(id+'b',W,Hh), bg=body.getContext('2d');
  bg.setTransform(1,0,0,1,0,0); bg.clearRect(0,0,W,Hh);
  bg.setTransform(sc,0,0,sc,ox,oy); bg.lineJoin='round';
  CEL.on=(style==='A'&&c.group==='h'&&s*c.scale>.55);
  if(c.kind==='w') drawWolf(bg,c,P,style,anim,p,k); else drawHumanoid(bg,c,P,style);
  CEL.on=false;
  bg.setTransform(1,0,0,1,0,0);
  // ombrage peint (A) : lumière haut-gauche
  if(style==='A'){bg.globalCompositeOperation='source-atop';const gr=bg.createLinearGradient(ox-50*sc,oy-120*sc,ox+40*sc,oy);gr.addColorStop(0,'rgba(255,236,210,.12)');gr.addColorStop(.55,'rgba(0,0,0,0)');gr.addColorStop(1,'rgba(4,4,14,.3)');bg.fillStyle=gr;bg.fillRect(0,0,W,Hh);bg.globalCompositeOperation='source-over'}
  if(style==='C'){bg.globalCompositeOperation='source-atop';const gr=bg.createLinearGradient(ox-50*sc,0,ox+40*sc,0);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(.62,'rgba(255,255,255,0)');gr.addColorStop(.63,'rgba(0,0,10,.28)');bg.fillStyle=gr;bg.fillRect(0,0,W,Hh);bg.globalCompositeOperation='source-over'}
  if(P.flash){bg.globalCompositeOperation='source-atop';bg.fillStyle='rgba(255,255,255,.92)';bg.fillRect(0,0,W,Hh);bg.globalCompositeOperation='source-over'}
  if(P.dis>0){bg.globalCompositeOperation='destination-out';const n=Math.floor(220*P.dis);for(let i=0;i<n;i++){const rx=rnd(i*3+1)*W,ry=Hh*.15+rnd(i*7+2)*Hh*.75;const rr=(2+rnd(i)*6)*sc*(.4+P.dis);bg.beginPath();bg.arc(rx,ry,rr,0,TAU);bg.fill()}
    bg.fillStyle=`rgba(0,0,0,${P.dis*P.dis})`;bg.fillRect(0,0,W,Hh);bg.globalCompositeOperation='source-over'}
  // silhouette teintée -> liseré / contour
  const sil=oc(id+'s',W,Hh), sg=sil.getContext('2d');
  const out=oc(id+'o',W,Hh), og=out.getContext('2d');
  og.setTransform(1,0,0,1,0,0); og.clearRect(0,0,W,Hh);
  const tint=(col)=>{sg.setTransform(1,0,0,1,0,0);sg.globalCompositeOperation='source-over';sg.clearRect(0,0,W,Hh);sg.drawImage(body,0,0);sg.globalCompositeOperation='source-in';sg.fillStyle=col;sg.fillRect(0,0,W,Hh);sg.globalCompositeOperation='source-over'};
  if(P.alpha>0){
  if(style==='A'){
    tint('#07060c'); for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) og.drawImage(sil,dx*1.6*s,dy*1.6*s);
    tint(c.rim); og.drawImage(sil,1.6*s,-1.6*s);
    og.drawImage(body,0,0);
    og.globalCompositeOperation='source-atop';
  } else if(style==='B'){
    tint(c.rim); og.shadowColor=c.rim; og.shadowBlur=10*s; og.drawImage(sil,2.2*s,-1.8*s); og.shadowBlur=0;
    og.globalAlpha=.55; og.drawImage(sil,-1*s,-.6*s); og.globalAlpha=1;
    og.drawImage(body,0,0);
  } else {
    tint('#06050a'); for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) og.drawImage(sil,dx,dy);
    tint(c.rim); og.drawImage(sil,1,-1);
    og.drawImage(body,0,0);
  }
  og.globalCompositeOperation='source-over';
  }
  // effets (traînées, projectiles, braises)
  og.setTransform(sc,0,0,sc,ox,oy);
  drawFx(og,c,P,style,s);
  og.setTransform(1,0,0,1,0,0);
  return {cv:out,ox,oy,W,H:Hh};
}

function shoulderPos(c,P,i){ // approximatif, en unités monde
  const T=c.torso, L=c.leg; const hipY=-L+P.y; const lean=P.lean+c.hunch;
  const sx=(i?c.sw*.5*.55:-c.sw*.5*.45), sy=-T+c.aw*.4;
  const ca=Math.cos(lean), sa=Math.sin(lean);
  return [P.x+sx*ca-sy*sa, hipY+sx*sa+sy*ca];
}

function drawFx(g,c,P,style,s){
  const col=style==='B'?c.rim:c.sig, core='#ffffff';
  for(const f of P.fx){
    if(f.t==='smear'&&style!=='Cx'){
      const [sx,sy]=shoulderPos(c,P,f.arm); const wl=c.weapon==='greatsword'?56:c.weapon==='scythe'||c.weapon==='halberd'?60:c.weapon==='fists'?6:c.weapon==='daggers'?18:36;
      const R=c.arm+wl*.85, a0=f.a0, a1=Math.max(f.a0+.1,f.a1);
      const N=18; g.save(); g.globalAlpha=clamp(f.al,0,1)*.9;
      glow(g,col,14,style);
      g.beginPath();
      for(let i=0;i<=N;i++){const a=lerp(a0,a1,i/N);g.lineTo(sx+Math.sin(a)*R,sy+Math.cos(a)*R)}
      for(let i=N;i>=0;i--){const a=lerp(a0,a1,i/N);const r=R-(wl*.55+4)*(i/N);g.lineTo(sx+Math.sin(a)*r,sy+Math.cos(a)*r)}
      g.closePath();
      const gr=g.createRadialGradient(sx,sy,R*.3,sx,sy,R);gr.addColorStop(0,rgba(col,0));gr.addColorStop(.7,rgba(col,.55));gr.addColorStop(1,rgba(mix(col,'#ffffff',.6),.95));
      g.fillStyle=gr; g.fill(); noGlow(g); g.restore();
    }
    if(f.t==='impact'){
      const d=f.d, x=P.x+c.arm+30, y=f.ground?0:-c.leg-10;
      g.save(); glow(g,col,14,style);
      g.globalAlpha=1-d; g.strokeStyle=col; g.lineWidth=3*(1-d)+.5;
      g.beginPath(); if(f.ground) g.ellipse(x,y,10+50*eo(d),3+12*eo(d),0,0,TAU); else g.arc(x,y,6+24*eo(d),0,TAU); g.stroke();
      for(let i=0;i<7;i++){const a=-Math.PI*.1-rnd(i+3)*Math.PI*.8, r=8+40*eo(d)*(.5+rnd(i)); g.fillStyle=i%2?core:col; g.fillRect(x+Math.cos(a)*r,y+Math.sin(a)*r*.8,2.2,2.2)}
      noGlow(g); g.restore();
    }
    if(f.t==='arrow'&&RIG.projectiles){
      const d=eo(f.d), [sx,sy]=shoulderPos(c,P,1); const x0=sx+c.arm, x=x0+d*170, y=sy+2;
      g.save(); glow(g,col,12,style); g.globalAlpha=1-clamp((f.d-.8)/.2,0,1);
      const gr=g.createLinearGradient(x-60,0,x,0); gr.addColorStop(0,rgba(col,0)); gr.addColorStop(1,rgba(mix(col,'#fff',.5),1));
      g.strokeStyle=gr; g.lineWidth=2.4; g.beginPath(); g.moveTo(Math.max(x0,x-60),y); g.lineTo(x,y); g.stroke();
      g.fillStyle='#fff'; g.beginPath(); g.moveTo(x+6,y); g.lineTo(x-2,y-3); g.lineTo(x-2,y+3); g.fill(); noGlow(g); g.restore();
    }
    if(f.t==='orb'&&RIG.projectiles){
      const d=eo(f.d), [sx,sy]=shoulderPos(c,P,1); const x=sx+c.arm+10+d*150, y=sy+4-Math.sin(d*Math.PI)*6;
      g.save(); glow(g,col,20,style); g.globalAlpha=1-clamp((f.d-.85)/.15,0,1);
      for(let i=1;i<6;i++){g.fillStyle=rgba(col,.18*(6-i)/6);g.beginPath();g.arc(x-i*7,y+Math.sin(i+f.d*10)*1.5,6-i*.7,0,TAU);g.fill()}
      g.fillStyle=col; g.beginPath(); g.arc(x,y,7,0,TAU); g.fill(); g.fillStyle='#fff'; g.beginPath(); g.arc(x,y,3.4,0,TAU); g.fill(); noGlow(g); g.restore();
    }
    if(f.t==='ring'){
      const [sx,sy]=shoulderPos(c,P,1); g.save(); glow(g,col,12,style); g.globalAlpha=1-f.d; g.strokeStyle=col; g.lineWidth=2;
      g.beginPath(); g.ellipse(sx+c.arm*.6,sy-20,6+26*eo(f.d),6+26*eo(f.d),0,0,TAU); g.stroke(); noGlow(g); g.restore();
    }
    if(f.t==='bite'){
      g.save(); glow(g,col,12,style); g.globalAlpha=(1-f.d)*.9; g.strokeStyle=col; g.lineWidth=2.2;
      for(let i=0;i<3;i++){g.beginPath();g.moveTo(f.x+40+i*4,-40+i*6);g.quadraticCurveTo(f.x+56+i*4,-26+i*6,f.x+48+i*4,-8+i*6);g.stroke()} noGlow(g); g.restore();
    }
    if(f.t==='motes'){ g.save(); glow(g,col,10,style);
      for(let i=0;i<4;i++){const a=cyc(1000/(1+i*.15))+i*1.7; const x=Math.cos(a)*(26+i*3), y=-62+Math.sin(RIG.loop?a+i:a*1.3)*16-i*4; g.globalAlpha=.55+.45*Math.sin(a*2); g.fillStyle=i%2?'#ffffff':col; g.beginPath(); g.arc(x,y,1.3+(i%2),0,TAU); g.fill()}
      noGlow(g); g.restore(); }
    if(f.t==='embers'){
      g.save(); glow(g,col,8,style);
      for(let i=0;i<34;i++){const st=rnd(i*5)*.4; const d=clamp((f.d-st)/(1-st),0,1); if(d<=0||d>=1) continue;
        const x=P.x+(rnd(i*11)-.5)*40+Math.sin(d*6+i)*6, y=-10-rnd(i*13)*50-d*70*(.6+rnd(i));
        g.globalAlpha=(1-d); g.fillStyle=i%3?col:'#fff'; const r=1.2+rnd(i*17)*2; g.fillRect(x-r/2,y-r/2,r,r)}
      noGlow(g); g.restore();
    }
  }
  if(P.charge>0.02&&c.weapon!=='staff'&&c.weapon!=='orb'){}
}


export { CAST, ANIM_LEN, FRAMES, renderSprite, mix };
