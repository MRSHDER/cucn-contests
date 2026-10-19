#!/usr/bin/env python3
"""根据 public/style.css 自动生成夜间模式覆盖样式 public/dark.css。
改了 style.css 的颜色后重新运行：python3 scripts/gen-dark-theme.py
规则：浅色背景→深色，深色文字→浅色，品牌强调色基本保留；左侧深色导航栏原样保留。"""
import re, math, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, OUT = ROOT/'public/style.css', ROOT/'public/dark.css'
PREFIX = ':root[data-theme="dark"]'
# 本来就是深色的区域：不转换
KEEP = re.compile(r'\.(rail|brand|space-label|tiny-lock|nav-item|nav-icon|nav-count|nav-divider|rail-bottom|mini-art|profile|avatar|online-dot|skip)\b')
COLOR = re.compile(r'#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b')

def lin(c): return c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4
def gam(c): return 12.92*c if c <= .0031308 else 1.055*c**(1/2.4)-.055
def to_oklch(r,g,b):
    r,g,b = lin(r),lin(g),lin(b)
    l=(.4122214708*r+.5363325363*g+.0514459929*b)**(1/3); m=(.2119034982*r+.6806995451*g+.1073969566*b)**(1/3); s=(.0883024619*r+.2817188376*g+.6299787005*b)**(1/3)
    L=.2104542553*l+.793617785*m-.0040720468*s; a=1.9779984951*l-2.428592205*m+.4505937099*s; bb=.0259040371*l+.7827717662*m-.808675766*s
    return L, math.hypot(a,bb), math.atan2(bb,a)
def from_oklch(L,C,h):
    a,b=C*math.cos(h),C*math.sin(h)
    l=(L+.3963377774*a+.2158037573*b)**3; m=(L-.1055613458*a-.0638541728*b)**3; s=(L-.0894841775*a-1.291485548*b)**3
    rgb=(4.0767416621*l-3.3077115913*m+.2309699292*s, -1.2684380046*l+2.6097574011*m-.3413193965*s, -.0041960863*l-.7034186147*m+1.707614701*s)
    return [min(255,max(0,round(gam(min(1,max(0,v)))*255))) for v in rgb]
def parse(hexs):
    h=hexs[1:]
    if len(h) in (3,4): h=''.join(c*2 for c in h)
    return [int(h[i:i+2],16)/255 for i in (0,2,4)], (h[6:8] if len(h)==8 else '')

def surface(L,C,h):   # 浅色面 → 深色面
    return from_oklch(.17+.62*(1-L)**.85, C*.75, h)
def ink(L,C,h):       # 深色字 → 浅色字
    return from_oklch(min(.93,1.0-.45*L), min(C,.06), h)

def convert(hexs, prop):
    (r,g,b),alpha = parse(hexs); L,C,h = to_oklch(r,g,b)
    if prop.endswith('shadow'): return hexs              # 阴影保持深色
    if prop.startswith('--') and prop not in ('--paper','--white','--soft','--line','--ink','--muted'): return hexs  # 品牌色变量保留
    vivid = C > .085
    if prop in ('color','fill','stroke','caret-color') or prop.startswith('--ink') or prop.startswith('--muted'):
        if L > .93: return hexs                          # 白字一般压在色块上，保留
        if vivid: out = from_oklch(max(L,.7),C,h)
        else: out = ink(L,C,h)
    elif 'background' in prop or prop in ('--paper','--white','--soft'):
        if prop=='--white': return '#1f1f1b'              # 卡片比底色略亮，形成层次
        if vivid and L < .85: return hexs                # 强调色块保留
        if L < .42: out = from_oklch(max(L,.26),C,h)     # 本来就深的块，稍微提亮以区分底色
        else: out = surface(L,C,h)
    else:                                                # 边框、线条等
        if vivid and L < .85: out = from_oklch(max(L,.62),C,h)
        elif L < .5: out = ink(L,C,h)
        else: out = from_oklch(.3+.25*(1-L),C*.7,h)
    return '#%02x%02x%02x' % tuple(out) + alpha

def rules(css):
    """把压缩的 CSS 拆成 (外层@规则, 选择器, 声明体)。"""
    i,stack,out,buf=0,[],[],''
    while i < len(css):
        c=css[i]
        if c=='{':
            head=buf.strip(); buf=''
            if head.startswith('@media') or head.startswith('@supports'): stack.append(head)
            elif head.startswith('@'):   # @keyframes 等：整体跳过
                depth=1; i+=1
                while depth:
                    depth += css[i]=='{'; depth -= css[i]=='}'; i+=1
                continue
            else:
                j=css.index('}',i); out.append((tuple(stack),head,css[i+1:j])); i=j+1; continue
        elif c=='}':
            if stack: stack.pop()
            buf=''
        else: buf+=c
        i+=1
    return out

def main():
    css=SRC.read_text(encoding='utf-8')
    blocks={}
    for media,sel,body in rules(css):
        sels=[s.strip() for s in sel.split(',') if s.strip() and not KEEP.search(s)]
        if not sels: continue
        decls=[]
        for d in body.split(';'):
            if ':' not in d or not COLOR.search(d): continue
            prop,val=d.split(':',1); prop=prop.strip()
            new=COLOR.sub(lambda m:convert(m.group(0),prop),val)
            if new!=val: decls.append(f'{prop}:{new}')
        if not decls: continue
        full=','.join(PREFIX if s==':root' else (PREFIX+s[5:] if s.startswith(':root') else f'{PREFIX} {s}') for s in sels)
        blocks.setdefault(media,[]).append(full+'{'+';'.join(decls)+'}')
    parts=['/* 由 scripts/gen-dark-theme.py 自动生成，请勿手改；手动微调请写在 scripts/dark-tweaks.css */',
           PREFIX+'{color-scheme:dark}']
    for media,lines in blocks.items():
        body='\n'.join(lines)
        for m in reversed(media): body=m+'{\n'+body+'\n}'
        parts.append(body)
    tweaks=ROOT/'scripts/dark-tweaks.css'               # 手动微调，追加在最后
    if tweaks.exists(): parts.append('/* ---- dark-tweaks ---- */\n'+tweaks.read_text(encoding='utf-8'))
    OUT.write_text('\n'.join(parts)+'\n',encoding='utf-8')
    print('wrote',OUT,sum(len(v) for v in blocks.values()),'rules')
main()
