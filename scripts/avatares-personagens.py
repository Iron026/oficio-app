"""Personagens do Ofício (rodada 3): uma mulher e um homem por área, em SVG vetorial.
Gera src/assets/avatars/personagem-<area>-<f|m>.svg. Uso: python3 scripts/avatares-personagens.py src/assets/avatars
Mesmo disco e paleta dos símbolos (scripts/avatares-svg.py). Revisão visual: docs/AVATARES.md."""
import os, sys
OUT=sys.argv[1]; os.makedirs(OUT, exist_ok=True)
DISC='#d2eded'
SKIN={'s1':('#f6d3b3','#e3b48f'),'s2':('#eec19a','#d39c74'),'s3':('#d9a074','#bb7f55'),'s4':('#b97a50','#9a5f3a'),'s5':('#8d5a3b','#72452b'),'s6':('#6a4230','#533223')}
INK='#2b2420'

def head(sk, jaw='oval'):
    f,s=SKIN[sk]
    ear=f'<ellipse cx="84" cy="122" rx="9" ry="13" fill="{f}"/><ellipse cx="172" cy="122" rx="9" ry="13" fill="{f}"/><ellipse cx="85" cy="123" rx="4" ry="7" fill="{s}" opacity=".5"/><ellipse cx="171" cy="123" rx="4" ry="7" fill="{s}" opacity=".5"/>'
    shapes={'oval':'M128 62c27 0 45 20 45 52v10c0 30-20 52-45 52s-45-22-45-52v-10c0-32 18-52 45-52z',
            'square':'M128 62c28 0 46 19 46 50v14c0 28-21 50-46 50s-46-22-46-50v-14c0-31 18-50 46-50z',
            'round':'M128 64c27 0 44 20 44 50v8c0 30-19 52-44 52s-44-22-44-52v-8c0-30 17-50 44-50z',
            'long':'M128 60c26 0 43 21 43 54v12c0 30-19 54-43 54s-43-24-43-54v-12c0-33 17-54 43-54z'}
    return ear+f'<path d="{shapes[jaw]}" fill="{f}"/>'
def neck(sk):
    f,s=SKIN[sk]
    return f'<path d="M112 160h32v26c0 8-32 8-32 0z" fill="{s}"/>'
def face(sk, eyes='round', brow='#3b2a20', lips='#c46a5a', lash=False, beard=None, freckles=False, smile='soft'):
    f,s=SKIN[sk]
    out=f'<path d="M100 103q9-6 18-1" stroke="{brow}" stroke-width="4.2" fill="none" stroke-linecap="round"/><path d="M138 102q9-5 18 1" stroke="{brow}" stroke-width="4.2" fill="none" stroke-linecap="round"/>'
    # Olhos sempre abertos: pupila escura + brilho branco (nada de traço curvo, que parece olho fechado).
    # Peles mais escuras (s5, s6): pupila mais escura e brilho um pouco maior, para o olho não sumir em 40 px.
    ink = '#0f0a08' if sk in ('s5', 's6') else INK
    k = 1.35 if sk in ('s5', 's6') else 1
    hl = lambda x, y, r: f'<circle cx="{x}" cy="{y}" r="{round(r * k, 2)}" fill="#fff"/>'
    if eyes=='round':
        out+=f'<ellipse cx="109" cy="118" rx="5" ry="6" fill="{ink}"/><ellipse cx="147" cy="118" rx="5" ry="6" fill="{ink}"/>'+hl(111,116,1.7)+hl(149,116,1.7)
    elif eyes=='big':
        out+=f'<ellipse cx="109" cy="118" rx="6.2" ry="7.4" fill="{ink}"/><ellipse cx="147" cy="118" rx="6.2" ry="7.4" fill="{ink}"/>'+hl(111.5,115.5,2.2)+hl(149.5,115.5,2.2)
    elif eyes=='calm':
        out+=f'<ellipse cx="109" cy="119" rx="5.2" ry="5.6" fill="{ink}"/><ellipse cx="147" cy="119" rx="5.2" ry="5.6" fill="{ink}"/>'+hl(111,117,1.7)+hl(149,117,1.7)+f'<path d="M101 115q8-6 16 0M139 115q8-6 16 0" stroke="{ink}" stroke-width="2.6" fill="none" stroke-linecap="round"/>'
    else:
        # "smile" (traço curvo) e "almond" foram abolidos: pareciam olhos fechados.
        raise ValueError(f'tipo de olho não permitido: {eyes}')
    if lash: out+=f'<path d="M101 115l-3-3M155 115l3-3" stroke="{INK}" stroke-width="2.4" stroke-linecap="round"/>'
    out+=f'<path d="M127 124q-4 12 2 14" stroke="{s}" stroke-width="3.2" fill="none" stroke-linecap="round"/>'
    out+=f'<ellipse cx="99" cy="136" rx="8" ry="5" fill="#ef8f7d" opacity=".28"/><ellipse cx="157" cy="136" rx="8" ry="5" fill="#ef8f7d" opacity=".28"/>'
    if freckles: out+=''.join(f'<circle cx="{x}" cy="{y}" r="1.2" fill="{s}"/>' for x,y in [(96,130),(101,133),(104,129),(152,129),(155,133),(160,130)])
    if beard:
        out+=f'<path d="M88 128c2 34 20 50 40 50s38-16 40-50c-6 10-14 14-20 14h-40c-6 0-14-4-20-14z" fill="{beard}"/><path d="M114 147q14 7 28 0q-3 9-14 9t-14-9z" fill="{SKIN[sk][0]}"/><path d="M108 143q20-8 40 0" stroke="{beard}" stroke-width="7" fill="none" stroke-linecap="round"/>'
        out+=f'<path d="M118 151q10 6 20 0" stroke="#7d3b32" stroke-width="3.6" fill="none" stroke-linecap="round"/>'
    else:
        out+= f'<path d="M115 148q13 10 26 0" stroke="{lips}" stroke-width="4.4" fill="none" stroke-linecap="round"/>' if smile=='soft' else f'<path d="M114 147q14 13 28 0z" fill="#fff" stroke="{lips}" stroke-width="3.6" stroke-linejoin="round"/>'
    return out
def body(color, collar=None, extra=''):
    b=f'<path d="M36 256c4-40 28-64 64-70l28 16 28-16c36 6 60 30 64 70z" fill="{color}"/>'
    if collar=='v': b+=f'<path d="M108 186l20 30 20-30" fill="none" stroke="#fff" stroke-width="0"/><path d="M108 184l20 32 20-32-8-2-12 18-12-18z" fill="#ffffff" opacity=".9"/>'
    if collar=='shirt': b+='<path d="M106 184l22 22-12 18-16-34zM150 184l-22 22 12 18 16-34z" fill="#ffffff"/>'
    if collar=='round': b+=f'<path d="M108 186q20 18 40 0" stroke="#00000022" stroke-width="5" fill="none"/>'
    return b+extra
HAIR={
 'm_short':lambda c:f'<path d="M83 110c-3-34 18-54 46-54 30 0 48 20 44 54-4-14-10-22-20-26-18 6-40 6-58 0-8 6-10 14-12 26z" fill="{c}"/>',
 'm_quiff':lambda c:f'<path d="M84 112c-4-30 10-48 30-54 6-10 30-12 44-2 14 8 18 30 14 56-3-12-8-20-16-24-14-2-26-8-34-16-6 8-20 14-32 16-4 6-5 14-6 24z" fill="{c}"/>',
 'm_curly':lambda c:''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{c}"/>' for x,y,r in [(92,90,16),(108,74,17),(128,68,18),(148,74,17),(164,90,16),(86,108,10),(170,108,10),(118,82,12),(140,82,12)]),
 'm_buzz':lambda c:f'<path d="M84 108c0-30 18-48 44-48s44 18 44 48c-6-12-12-18-20-20h-48c-8 2-14 8-20 20z" fill="{c}" opacity=".85"/>',
 'f_long_back':lambda c:f'<path d="M78 112c-4-40 20-60 50-60s54 20 50 60c4 40 8 70 0 100h-100c-8-30-4-60 0-100z" fill="{c}"/>',
 'f_long_front':lambda c:f'<path d="M83 116c-2-36 18-56 45-56s48 20 45 56c-6-20-18-32-36-36-10 14-30 22-54 36z" fill="{c}"/>',
 'f_bun':lambda c:f'<circle cx="128" cy="50" r="20" fill="{c}"/><path d="M83 112c-3-34 17-52 45-52s48 18 45 52c-5-16-14-24-25-28-14 6-26 6-40 0-11 4-20 12-25 28z" fill="{c}"/>',
 'f_bob_back':lambda c:f'<path d="M78 114c-2-38 20-58 50-58s52 20 50 58c2 26 0 44-6 54h-88c-6-10-8-28-6-54z" fill="{c}"/>',
 'f_bob_front':lambda c:f'<path d="M82 120c-2-38 18-58 46-58s48 20 46 58c-10-22-26-34-46-36-20 2-36 14-46 36z" fill="{c}"/>',
 'f_curly_back':lambda c:''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{c}"/>' for x,y,r in [(80,100,24),(92,72,24),(118,58,24),(146,60,24),(168,76,24),(178,104,22),(76,130,20),(182,132,20),(84,156,16),(174,158,16)]),
 'f_pony_back':lambda c:f'<path d="M150 86c30 6 40 40 30 78-6-20-16-36-30-46z" fill="{c}"/>',
 'f_bandana':lambda c:f'<path d="M84 112c-2-34 18-54 44-54s46 20 44 54c-4-12-12-20-22-24h-44c-10 4-18 12-22 24z" fill="#1b1412"/><path d="M82 96c6-26 24-40 46-40s40 14 46 40c-28-10-64-10-92 0z" fill="#f2b632"/><path d="M128 54c-8-10-20-10-20 0 0 8 12 8 20 2 8 6 20 6 20-2 0-10-12-10-20 0z" fill="#f2b632"/><circle cx="104" cy="80" r="3" fill="#fff" opacity=".8"/><circle cx="150" cy="78" r="3" fill="#fff" opacity=".8"/><circle cx="128" cy="72" r="3" fill="#fff" opacity=".8"/>',
}
def glasses(c='#2b2420'): return f'<g fill="none" stroke="{c}" stroke-width="3.4"><rect x="95" y="108" width="28" height="21" rx="9"/><rect x="133" y="108" width="28" height="21" rx="9"/><path d="M123 116h10M95 114l-10-3M161 114l10-3"/></g>'
def hoops(c='#e0b23a'): return f'<circle cx="84" cy="140" r="7" fill="none" stroke="{c}" stroke-width="3"/><circle cx="172" cy="140" r="7" fill="none" stroke="{c}" stroke-width="3"/>'
def studs(c='#e0b23a'): return f'<circle cx="84" cy="136" r="3.4" fill="{c}"/><circle cx="172" cy="136" r="3.4" fill="{c}"/>'
def steth(): return '<path d="M104 190c-4 22 6 36 24 36s28-14 24-36" fill="none" stroke="#2f4e5a" stroke-width="5" stroke-linecap="round"/><circle cx="128" cy="230" r="8" fill="#9fb3bb" stroke="#2f4e5a" stroke-width="4"/>'
def headset(): return '<path d="M80 118c0-40 22-62 48-62s48 22 48 62" fill="none" stroke="#2c3e50" stroke-width="7"/><rect x="72" y="110" width="14" height="26" rx="6" fill="#2c3e50"/><rect x="170" y="110" width="14" height="26" rx="6" fill="#2c3e50"/><path d="M78 136c0 14 12 20 28 18" fill="none" stroke="#2c3e50" stroke-width="4" stroke-linecap="round"/><circle cx="108" cy="154" r="4" fill="#2c3e50"/>'
def apron(c, pocket='#fff'): return f'<path d="M92 196h72l8 60H84z" fill="{c}"/><path d="M110 196v-10M146 196v-10" stroke="{c}" stroke-width="6"/><rect x="114" y="216" width="28" height="18" rx="4" fill="{pocket}" opacity=".35"/>'
def scissors_pocket(): return '<g transform="translate(120 206) rotate(20)"><circle cx="0" cy="18" r="4" fill="none" stroke="#2b2420" stroke-width="2.4"/><circle cx="9" cy="18" r="4" fill="none" stroke="#2b2420" stroke-width="2.4"/><path d="M2 14l8-16M7 14l-6-16" stroke="#9aa3a8" stroke-width="2.6" stroke-linecap="round"/></g>'
def badge(c='#f2b632'): return f'<rect x="150" y="210" width="20" height="14" rx="3" fill="{c}"/>'
def cap(c): return f'<path d="M80 98c4-30 24-44 48-44s44 14 48 44c-30-8-66-8-96 0z" fill="{c}"/><path d="M76 98c34-10 70-10 104 0l18 6c-40-6-98-6-122-6z" fill="{c}"/>'
def hood(c): return f'<path d="M92 190q36 26 72 0" fill="none" stroke="#2c3740" stroke-width="10" stroke-linecap="round"/><path d="M116 204v26M140 204v26" stroke="#e9eef0" stroke-width="3.4" stroke-linecap="round"/><circle cx="116" cy="232" r="3" fill="#e9eef0"/><circle cx="140" cy="232" r="3" fill="#e9eef0"/>'

def char(spec):
    sk=spec['skin']; parts=[]
    if spec.get('back'): parts.append(HAIR[spec['back']](spec['hair']))
    parts.append(neck(sk))
    parts.append(body(spec['top'], spec.get('collar'), spec.get('body_extra','')))
    parts.append(head(sk, spec.get('jaw','oval')))
    parts.append(face(sk, spec.get('eyes','round'), spec.get('brow', spec['hair']), spec.get('lips','#c46a5a'), spec.get('lash',False), spec.get('beard'), spec.get('freckles',False), spec.get('smile','soft')))
    if spec.get('front'): parts.append(HAIR[spec['front']](spec['hair']))
    parts.append(spec.get('acc',''))
    inner=''.join(parts)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="{spec["label"]}"><defs><clipPath id="c"><circle cx="128" cy="128" r="128"/></clipPath></defs><circle cx="128" cy="128" r="128" fill="{DISC}"/><g clip-path="url(#c)">{inner}</g></svg>'


# ---------------------------------------------------------------- acessórios da rodada 3
def shade(hexc, k=0.78):
    h=hexc.lstrip('#'); r,g,b=(int(h[i:i+2],16) for i in (0,2,4))
    return '#%02x%02x%02x' % tuple(max(0,min(255,int(c*k))) for c in (r,g,b))
def blazer(c, shirt='#ffffff'):
    d=shade(c,0.72)
    return (f'<path d="M108 186l20 36 20-36z" fill="{shirt}"/>'
            f'<path d="M104 186l24 40-14 30h-30l-4-50zM152 186l-24 40 14 30h30l4-50z" fill="{c}"/>'
            f'<path d="M104 186l24 40-10 6-22-40zM152 186l-24 40 10 6 22-40z" fill="{d}"/>')
def tie(c): return f'<path d="M122 198h12l-2 8 6 34-10 10-10-10 6-34z" fill="{c}"/>'
def pearls(): return '<circle cx="84" cy="137" r="4" fill="#f6f1e7" stroke="#d9cfbf" stroke-width="1"/><circle cx="172" cy="137" r="4" fill="#f6f1e7" stroke="#d9cfbf" stroke-width="1"/>'
def beret(c): return f'<path d="M78 84c4-26 30-38 56-36 26 2 46 16 44 34-20-10-66-14-100 2z" fill="{c}"/><circle cx="132" cy="46" r="5" fill="{c}"/>'
def smudge(): return '<circle cx="158" cy="140" r="3.2" fill="#e85d75" opacity=".9"/><circle cx="163" cy="135" r="2.2" fill="#3a8fd8" opacity=".9"/>'
def scarf(c): return f'<path d="M98 184q30 20 60 0l4 14q-34 22-68 0z" fill="{c}"/><path d="M140 196l10 44h-14l-4-40z" fill="{shade(c,0.85)}"/>'
def hardhat(c='#f2b632'): return (f'<path d="M80 100c0-34 22-54 48-54s48 20 48 54z" fill="{c}"/>'
            f'<rect x="70" y="96" width="116" height="13" rx="6.5" fill="{shade(c,0.86)}"/><path d="M120 50h16v46h-16z" fill="{shade(c,0.9)}"/>')
def vest(c='#f07c2a'): return (f'<path d="M66 256l14-60 26-10 22 32 22-32 26 10 14 60z" fill="{c}"/>'
            '<path d="M70 232h40v8H68zM146 232h40l2 8h-42z" fill="#eef3f4"/>')
def toque(): return ('<g transform="translate(0 6)"><path d="M90 86V74c-14 0-22-10-22-22 0-14 12-24 26-20 4-12 16-18 34-18s30 6 34 18c14-4 26 6 26 20 0 12-8 22-22 22v12z" fill="#ffffff" stroke="#d5dee1" stroke-width="2.5"/>'
            '<rect x="88" y="78" width="80" height="14" rx="4" fill="#f1f5f6" stroke="#d5dee1" stroke-width="2"/></g>')
def chefcoat(scarf='#d94f3d'): return (f'<path d="M110 186l18 16 18-16-4 14-14 8-14-8z" fill="{scarf}"/>'
            + ''.join(f'<circle cx="{x}" cy="{y}" r="3.4" fill="#9fb0b6"/>' for x in (114,142) for y in (220,240)))
def strawhat(): return ('<ellipse cx="128" cy="90" rx="78" ry="16" fill="#dcae55"/>'
            '<path d="M92 90c0-28 16-42 36-42s36 14 36 42z" fill="#e7c06a"/><rect x="92" y="76" width="72" height="10" fill="#8f5428"/>')
def plaid(c, line):
    body='M36 256c4-40 28-64 64-70l28 16 28-16c36 6 60 30 64 70z'
    lines=''.join(f'<path d="M{x} 180v80" stroke="{line}" stroke-width="5" opacity=".55"/>' for x in (64,96,160,192))
    lines+=''.join(f'<path d="M30 {y}h200" stroke="{line}" stroke-width="5" opacity=".55"/>' for y in (212,240))
    return f'<clipPath id="pb"><path d="{body}"/></clipPath><g clip-path="url(#pb)">{lines}</g>'
def guard(): return ('<path d="M150 206h20v10c0 9-10 13-10 13s-10-4-10-13z" fill="#f2b632"/>'
            '<path d="M64 200l26-10 4 10-26 10zM192 200l-26-10-4 10 26 10z" fill="#2c3e57"/>'
            '<path d="M174 124c7 3 7 14 0 18" stroke="#121a22" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M174 142c2 14-2 30-8 42" stroke="#121a22" stroke-width="2" fill="none"/>')
def cardigan(c):
    d=shade(c,0.8)
    return (f'<path d="M110 186l18 22 18-22z" fill="#ffffff"/><path d="M104 186l24 30v40h-28l-6-62zM152 186l-24 30v40h28l6-62z" fill="{c}"/>'
            f'<path d="M128 216v40" stroke="{d}" stroke-width="3"/>' + ''.join(f'<circle cx="122" cy="{y}" r="2.8" fill="{d}"/>' for y in (226,242)))
def mustache(c): return f'<path d="M108 144q10-8 20-2q10-6 20 2q-10 8-20 3q-10 5-20-3z" fill="{c}"/>'
HAIR.update({
 'f_braid_back': lambda c: f'<path d="M80 112c-4-40 20-58 48-58s52 18 48 58v10c-10-8-22-12-36-12z" fill="{c}"/>' + ''.join(f'<ellipse cx="{170+i*3}" cy="{150+i*20}" rx="11" ry="12" fill="{c}"/>' for i in range(4)),
 'f_side_part': lambda c: f'<path d="M82 108c-2-32 18-52 46-52s50 22 46 60c-4-18-14-30-28-36-16 6-40 10-64 28z" fill="{c}"/>',
 'f_short_back': lambda c: f'<path d="M80 116c-2-36 18-56 48-56s50 20 48 56c0 14-2 24-6 30H86c-4-6-6-16-6-30z" fill="{c}"/>',
 'm_side': lambda c: f'<path d="M84 112c-4-32 16-54 44-54 30 0 48 20 44 54-4-14-10-22-18-26-22 2-40-2-54-10-8 8-14 20-16 36z" fill="{c}"/>',
 'm_bald_sides': lambda c: f'<path d="M84 118c-2-10 0-18 4-24 2 10 4 18 8 22zM172 118c2-10 0-18-4-24-2 10-4 18-8 22z" fill="{c}"/>',
})

SPECS={
 # Geral
 'geral-f':dict(label='Geral, mulher',skin='s2',hair='#4a2c1c',back='f_bob_back',front='f_bob_front',top='#2a8f86',collar='round',lash=True,eyes='big',acc=studs()),
 'geral-m':dict(label='Geral, homem',skin='s4',hair='#1c1512',front='m_side',top='#3d6fa8',collar='shirt',jaw='square',smile='open'),
 # Beleza e Estética
 'beleza-f':dict(eyes='calm',label='Beleza e Estética, mulher',skin='s3',hair='#3a2418',back='f_long_back',front='f_long_front',top='#2b2b33',lash=True,lips='#b3474f',acc=hoops(),body_extra=apron('#e9d7c6')+scissors_pocket()),
 'beleza-m':dict(smile='open',label='Beleza e Estética, homem',eyes='round',skin='s1',hair='#1f1a17',front='m_quiff',top='#2b2b33',jaw='square',beard='#2a211c',body_extra=apron('#cfd8d6')+scissors_pocket(),collar='round'),
 # Limpeza
 'limpeza-f':dict(label='Limpeza, mulher',skin='s5',hair='#1b1412',back='f_pony_back',front='f_bandana',top='#2a8f86',collar='v',lash=True,eyes='big',lips='#9c3b45',acc=hoops('#f2b632'),body_extra=badge('#ffffff'),smile='open'),
 'limpeza-m':dict(eyes='big',label='Limpeza, homem',smile='open',skin='s2',hair='#5a3a26',front='m_short',top='#3d6fa8',collar='v',jaw='round',acc=cap('#2a8f86'),body_extra=badge('#ffffff')),
 # Saúde
 'saude-f':dict(label='Saúde e ciência, mulher',eyes='big',skin='s2',hair='#6b3e26',front='f_bun',top='#ffffff',collar='v',lash=True,acc=glasses('#5b3b2a'),body_extra=steth()+'<path d="M84 190q-10 30-6 66h14zM172 190q10 30 6 66h-14z" fill="#e8eef0"/>'),
 'saude-m':dict(eyes='calm',label='Saúde e ciência, homem',skin='s6',hair='#151110',front='m_buzz',top='#ffffff',collar='shirt',jaw='square',beard='#1a1412',body_extra=steth()),
 # Negócios, direito e finanças
 'direito-financas-f':dict(eyes='round',label='Negócios, direito e finanças, mulher',skin='s5',hair='#17110f',back='f_long_back',front='f_side_part',top='#2c3a5c',lash=True,lips='#8e3440',acc=pearls(),body_extra=blazer('#2c3a5c')),
 'direito-financas-m':dict(label='Negócios, direito e finanças, homem',skin='s1',hair='#3b2a20',front='m_side',top='#30363d',jaw='square',smile='open',body_extra=blazer('#30363d')+tie('#a5343f')),
 # Criatividade
 'criatividade-f':dict(label='Criatividade, mulher',skin='s1',hair='#b8502a',back='f_bob_back',front='f_bob_front',top='#f2b632',collar='round',lash=True,eyes='big',freckles=True,acc=beret('#c2384f')+smudge()),
 'criatividade-m':dict(label='Criatividade, homem',skin='s3',hair='#2b1d15',front='m_curly',top='#3f5d7a',collar='round',jaw='long',beard='#2b1d15',body_extra=scarf('#e0703c')),
 # Obras e engenharia
 'obras-f':dict(label='Obras e engenharia, mulher',skin='s3',hair='#2a1a12',back='f_pony_back',top='#3d6fa8',collar='shirt',lash=True,eyes='round',smile='open',acc=hardhat('#f2b632'),body_extra=vest('#f07c2a')),
 'obras-m':dict(label='Obras e engenharia, homem',skin='s4',hair='#151110',top='#4d5b66',collar='shirt',jaw='square',smile='open',acc=hardhat('#f2b632')+mustache('#1a1412'),body_extra=vest('#f07c2a')),
 # Alimentação
 'alimentacao-f':dict(eyes='round',label='Alimentação, mulher',skin='s4',hair='#24160f',back='f_short_back',top='#ffffff',lash=True,smile='open',acc=toque()+studs(),body_extra=chefcoat('#2a8f86')),
 'alimentacao-m':dict(smile='open',label='Alimentação, homem',skin='s2',hair='#3b2a20',top='#ffffff',jaw='round',eyes='big',acc=toque()+mustache('#3b2a20'),body_extra=chefcoat()),
 # Campo e agronegócio
 'campo-f':dict(label='Campo e agronegócio, mulher',skin='s2',hair='#7a4a26',back='f_braid_back',top='#b8443a',collar='shirt',lash=True,eyes='big',freckles=True,smile='open',acc=strawhat(),body_extra=plaid('#b8443a','#5c1f1a')),
 'campo-m':dict(eyes='calm',label='Campo e agronegócio, homem',skin='s3',hair='#9a948e',front='m_bald_sides',top='#2f6b4a',collar='shirt',jaw='square',acc=strawhat()+mustache('#a8a29c'),body_extra=plaid('#2f6b4a','#173a27')),
 # Segurança
 'seguranca-f':dict(eyes='round',label='Segurança, mulher',skin='s6',hair='#120d0b',back='f_pony_back',top='#22324a',collar='shirt',lash=True,acc=cap('#22324a'),body_extra=guard()),
 'seguranca-m':dict(label='Segurança, homem',skin='s3',hair='#2a1f18',front='m_buzz',top='#22324a',collar='shirt',jaw='long',eyes='calm',acc=cap('#22324a'),body_extra=guard()),
 # Tecnologia
 'tecnologia-f':dict(eyes='calm',label='Tecnologia, mulher',skin='s4',hair='#2a1a12',back='f_curly_back',top='#4b3f8f',collar='round',freckles=True,acc=headset()),
 'tecnologia-m':dict(label='Tecnologia, homem',skin='s1',hair='#c8823e',front='m_curly',top='#3a4750',jaw='long',acc=glasses(),body_extra=hood('#3a4750'),freckles=True),
 # Educação
 'educacao-f':dict(label='Educação, mulher',skin='s1',hair='#b7b2ad',back='f_bob_back',front='f_bob_front',top='#7a4b8f',lash=True,eyes='round',acc=glasses('#5b4a5f')+studs('#c9c3bd'),body_extra=cardigan('#7a4b8f')),
 'educacao-m':dict(eyes='round',label='Educação, homem',skin='s5',hair='#1b1412',front='m_short',top='#4a6d58',collar='shirt',jaw='oval',beard='#5a5550',acc=glasses('#2b2420'),body_extra=cardigan('#4a6d58')),
}
for k,v in SPECS.items(): open(f'{OUT}/personagem-{k}.svg','w').write(char(v))
print(len(SPECS))
