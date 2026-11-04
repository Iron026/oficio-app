import math, os, sys
OUT=sys.argv[1]; os.makedirs(OUT, exist_ok=True)
DISC='#d2eded'; INK='#0d4a4c'; Y='#f2b632'; G='#3c9b45'; W='#ffffff'; T='#2a8f86'
def svg(body, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="{title}"><circle cx="128" cy="128" r="128" fill="{DISC}"/>{body}</svg>\n'
def gear(cx, cy, r_out, r_in, teeth, hole):
    pts=[]
    n=teeth*4
    for i in range(n):
        a=2*math.pi*i/n - math.pi/2
        r=r_out if (i%4) in (1,2) else r_in
        pts.append((cx+r*math.cos(a), cy+r*math.sin(a)))
    d='M'+' L'.join(f'{x:.1f} {y:.1f}' for x,y in pts)+'Z'
    return f'<path d="{d}" fill="{INK}" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/><circle cx="{cx}" cy="{cy}" r="{hole}" fill="{DISC}"/><circle cx="{cx}" cy="{cy}" r="{hole-14}" fill="{Y}"/>'
icons={
 'simbolo-06_ciencia': ('Frasco de laboratório',
   f'<path d="M108 58h40M114 58v42L76 170a14 14 0 0 0 12 22h80a14 14 0 0 0 12-22l-38-70V58" fill="{W}" stroke="{INK}" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>'
   f'<path d="M92 148h72l14 26a8 8 0 0 1-7 12H85a8 8 0 0 1-7-12z" fill="{T}"/>'
   f'<circle cx="114" cy="166" r="7" fill="{W}"/><circle cx="140" cy="158" r="5" fill="{W}"/><circle cx="132" cy="176" r="4" fill="{W}"/>'),
 'simbolo-07_agronegocio': ('Broto de planta',
   f'<path d="M64 186c20-16 108-16 128 0z" fill="{INK}"/>'
   f'<path d="M128 182v-66" stroke="{INK}" stroke-width="10" stroke-linecap="round"/>'
   f'<path d="M128 124c-6-30-30-48-62-46 2 32 26 50 62 46z" fill="{G}"/>'
   f'<path d="M128 112c4-32 28-52 64-50-2 34-28 54-64 50z" fill="{G}"/>'
   f'<path d="M128 124c-14-12-28-22-44-28M128 112c14-14 28-26 46-34" stroke="#2c7a35" stroke-width="5" stroke-linecap="round" fill="none"/>'),
 'simbolo-08_educacao': ('Capelo de formatura',
   f'<path d="M128 70 46 108l82 38 82-38z" fill="{INK}" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>'
   f'<path d="M84 126v34c0 14 20 26 44 26s44-12 44-26v-34l-44 20z" fill="{INK}"/>'
   f'<path d="M196 116v46" stroke="{Y}" stroke-width="7" stroke-linecap="round"/><circle cx="196" cy="168" r="9" fill="{Y}"/>'),
 'simbolo-09_engenharia': ('Engrenagem', gear(128,128,70,54,8,26)),
 'simbolo-10_negocios': ('Maleta de negócios',
   f'<path d="M104 86v-8a10 10 0 0 1 10-10h28a10 10 0 0 1 10 10v8" fill="none" stroke="{INK}" stroke-width="10" stroke-linecap="round"/>'
   f'<rect x="56" y="86" width="144" height="100" rx="16" fill="{INK}"/>'
   f'<path d="M56 126h144" stroke="{T}" stroke-width="6"/>'
   f'<rect x="114" y="116" width="28" height="22" rx="5" fill="{Y}"/>'),
 'simbolo-11_beleza': ('Tesoura e brilho',
   f'<g stroke="{INK}" stroke-width="12" stroke-linecap="round" fill="none"><path d="M98 160 172 70"/><path d="M158 160 84 70"/></g>'
   f'<circle cx="90" cy="178" r="20" fill="{W}" stroke="{INK}" stroke-width="10"/><circle cx="166" cy="178" r="20" fill="{W}" stroke="{INK}" stroke-width="10"/>'
   f'<circle cx="128" cy="116" r="7" fill="{Y}"/>'
   f'<path d="M190 72l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" fill="{Y}"/>'),
 'simbolo-12_limpeza': ('Borrifador e brilhos',
   f'<path d="M100 74h40l16 18h-24l-4 14h-28z" fill="{INK}" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>'
   f'<path d="M98 106h44l12 26v50a10 10 0 0 1-10 10H96a10 10 0 0 1-10-10v-50z" fill="{T}" stroke="{INK}" stroke-width="8" stroke-linejoin="round"/>'
   f'<rect x="102" y="140" width="36" height="30" rx="6" fill="{W}"/>'
   f'<path d="M176 74l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="{Y}"/><path d="M196 112l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="{Y}"/><circle cx="170" cy="58" r="5" fill="{Y}"/>'),
}
# Recentraliza pela caixa medida do desenho e aproxima do tamanho dos símbolos do pack.
OFF={'simbolo-06_ciencia':(0,3.5),'simbolo-07_agronegocio':(0,4.5),'simbolo-08_educacao':(0,2),'simbolo-09_engenharia':(0,0),'simbolo-10_negocios':(0,4),'simbolo-11_beleza':(-7.5,-5.5),'simbolo-12_limpeza':(-15,4)}
for name,(title,body) in icons.items():
    dx,dy=OFF[name]
    g=f'<g transform="translate(128 128) scale(1.18) translate({-128+dx} {-128+dy})">{body}</g>'
    open(f'{OUT}/{name}.svg','w').write(svg(g,title))
print('ok', len(icons))
