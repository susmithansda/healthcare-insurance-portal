"""Rebuild original CareClaim media. Requires Pillow and imageio-ffmpeg.
Run from any directory; generated files are written next to this script.
All illustrations, animation, and synthesized music are original project assets.
"""
from pathlib import Path
import math
import struct
import subprocess
import sys
import wave

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / '.build'))
from PIL import Image, ImageDraw, ImageFont
from imageio_ffmpeg import get_ffmpeg_exe

W, H, FPS, DURATION = 960, 540, 24, 16
INK = '#183d39'
TEAL = '#137d69'
MUTED = '#6d807a'
FONT_ROOT = Path('C:/Windows/Fonts')


def font(size, bold=False):
    path = FONT_ROOT / ('segoeuib.ttf' if bold else 'segoeui.ttf')
    if not path.exists():
        path = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans' + ('-Bold' if bold else '') + '.ttf')
    return ImageFont.truetype(str(path), size)


FONTS = {size: font(size) for size in [12, 14, 16, 18, 22, 24, 28, 36, 42]}
BOLD = {size: font(size, True) for size in [14, 16, 18, 22, 24, 28, 36, 42]}


def text(draw, xy, value, size=18, color=INK, bold=False):
    draw.text(xy, value, font=(BOLD if bold else FONTS)[size], fill=color)


def rr(draw, box, fill='white', radius=18, outline=None, width=1):
    draw.rounded_rectangle(box, radius, fill=fill, outline=outline, width=width)


def check(draw, x, y, scale=1, color=TEAL):
    draw.line([(x, y+7*scale), (x+6*scale, y+13*scale), (x+18*scale, y)], fill=color, width=max(2, int(3*scale)), joint='curve')


def shield(draw, x, y, size=32, color=TEAL):
    pts = [(x+size*.5,y), (x+size*.9,y+size*.17), (x+size*.87,y+size*.65), (x+size*.5,y+size), (x+size*.13,y+size*.65), (x+size*.1,y+size*.17)]
    draw.polygon(pts, fill=color)
    check(draw, x+size*.29,y+size*.35,size/43,'white')


SCENES = [
    ('01 / SUBMIT', 'Your care journey,', 'in one place.', 'Add treatment details and attach your bills.', 'A few clear steps. One organized claim.'),
    ('02 / STAY INFORMED', 'Clarity at', 'every step.', 'Follow your claim from submission to decision.', 'Your timeline keeps the next step in view.'),
    ('03 / MANAGE PAYMENTS', 'Less paperwork.', 'More peace of mind.', 'Keep premiums and receipts together.', 'Explore payments safely in sandbox mode.'),
    ('04 / UNDERSTAND', 'See the', 'bigger picture.', 'Turn claim records into useful visual insights.', 'Filter, compare, and export your reports.'),
]


def frame(t):
    im = Image.new('RGB', (W,H), '#f3f7f2')
    d = ImageDraw.Draw(im)
    d.ellipse((650+8*math.sin(t*.6),-180,1070,240), fill='#e0eee1')
    d.ellipse((-120,390,230,740),fill='#e8eee0')
    shield(d,40,30,30)
    text(d,(82,30),'CareClaim',22,bold=True)
    text(d,(720,39),'A LITTLE MORE CLARITY',12,MUTED)
    scene = min(3,int(t/4))
    p = (t%4)/4
    ease = min(1,p*5)
    ease = 1-(1-ease)**3
    offset = int((1-ease)*16)
    eyebrow,line1,line2,desc,desc2 = SCENES[scene]
    text(d,(48,144+offset),eyebrow,14,TEAL,True)
    text(d,(46,181+offset),line1,42,bold=True)
    text(d,(46,232+offset),line2,42,bold=True)
    text(d,(48,306+offset),desc,16,MUTED)
    text(d,(48,332+offset),desc2,14,MUTED)
    rr(d,(48,387,238,428),TEAL,20)
    text(d,(68,396),'Care, without the chaos',14,'white',True)
    x,y=535,112+offset
    rr(d,(x+4,y+8,x+380,y+327),'#dce8df',24)
    rr(d,(x,y,x+376,y+319),'white',24)
    if scene==0:
        text(d,(x+25,y+24),'New reimbursement claim',18,bold=True)
        text(d,(x+25,y+59),'TREATMENT DETAILS',12,MUTED)
        for i,(label,value) in enumerate([('Patient','Aarav Sharma'),('Hospital','Greenview Medical Centre'),('Claim amount','INR 24,500')]):
            yy=y+88+i*51
            text(d,(x+25,yy),label,12,MUTED)
            rr(d,(x+128,yy-4,x+349,yy+29),'#f5f8f4',8)
            text(d,(x+140,yy+1),value,14)
        rr(d,(x+25,y+247,x+349,y+290),'#e8f3e9',10)
        check(d,x+40,y+261,.8)
        text(d,(x+67,y+259),'Medical bill attached',14,TEAL,True)
    elif scene==1:
        text(d,(x+25,y+24),'Claim CC-2026-1042',18,bold=True)
        text(d,(x+25,y+57),'Every update, in one timeline',14,MUTED)
        steps=[('Submitted','Your claim is ready for review'),('Under review','Documents are being checked'),('Decision recorded','See the outcome and remarks')]
        for i,(label,sub) in enumerate(steps):
            yy=y+105+i*67
            active = (p*3.8)>=i
            if i<2: d.line([(x+41,yy+10),(x+41,yy+68)],fill='#dfe9df',width=2)
            d.ellipse((x+28,yy-2,x+54,yy+24),fill=TEAL if active else '#e3ebe1')
            if active: check(d,x+34,yy+4,.65,'white')
            text(d,(x+72,yy-4),label,16,INK if active else MUTED,True)
            text(d,(x+72,yy+20),sub,12,MUTED)
    elif scene==2:
        text(d,(x+25,y+24),'Payments, kept simple',18,bold=True)
        rr(d,(x+25,y+66,x+349,y+180),'#153f38',14)
        text(d,(x+45,y+84),'FAMILY HEALTH PLUS',12,'#cbe6d6')
        text(d,(x+45,y+111),'INR 2,450',28,'white',True)
        text(d,(x+45,y+149),'Monthly premium  /  Sandbox',12,'#cbe6d6')
        rr(d,(x+25,y+201,x+349,y+251),'#f3f7f1',10)
        check(d,x+42,y+220,.8)
        text(d,(x+72,y+211),'Receipt ready to download',16,TEAL,True)
        text(d,(x+25,y+273),'Demo transaction. No funds are moved.',12,MUTED)
    else:
        text(d,(x+25,y+24),'Your claims at a glance',18,bold=True)
        text(d,(x+25,y+58),'CLAIM VOLUME',12,MUTED)
        for i,height in enumerate([62,91,75,121,103,143]):
            xx=x+33+i*51
            h=int(height*min(1,p*2.5))
            rr(d,(xx,y+240-h,xx+29,y+240),TEAL if i==5 else '#b6d7bf',5)
            text(d,(xx-1,y+254),['Jun','Jul','Aug','Sep','Oct','Nov'][i],12,MUTED)
        d.line((x+26,y+241,x+350,y+241),fill='#e0e9df',width=1)
        text(d,(x+25,y+286),'SAMPLE DATA  /  FOR DEMONSTRATION',12,MUTED)
    for i,label in enumerate(['Submit','Track','Pay','Understand']):
        xx=48+i*222
        d.line((xx,477,xx+198,477),fill='#d5e1d3',width=3)
        progress=1 if i<scene else p if i==scene else 0
        if progress: d.line((xx,477,xx+198*progress,477),fill=TEAL,width=3)
        text(d,(xx,490),f'0{i+1}  {label}',14,TEAL if i==scene else MUTED,i==scene)
    return im


def music():
    rate=22050
    length=24
    # A slow original Cmaj7 / Am7 / Fmaj7 / Gadd9 progression.
    chords=[(130.8128,164.8138,195.9977,246.9417),(110,130.8128,164.8138,195.9977),(87.3071,130.8128,164.8138,174.6141),(97.9989,146.8324,195.9977,220)]
    data=bytearray()
    for n in range(rate*length):
        t=n/rate
        ci=min(3,int(t/6))
        ct=t-ci*6
        envelope=min(1,ct/.9)*min(1,(6-ct)/1.3)
        globalenv=min(1,t/2,(length-t)/2)
        l=r=0
        for j,freq in enumerate(chords[ci]):
            tone=math.sin(2*math.pi*freq*t)+.18*math.sin(2*math.pi*freq*2*t)
            l+=tone*(.58+.1*math.sin(j+1))*envelope
            r+=tone*(.58+.1*math.cos(j+1))*envelope
        # Delicate slow upper notes, with a short plucked attack and long decay.
        beat=int(t/1.5)
        bt=t%1.5
        f=chords[ci][beat%4]*4
        bell=math.sin(2*math.pi*f*bt)*math.exp(-bt*3)*min(1,bt/.025)
        l=(l*.025+bell*.018)*globalenv
        r=(r*.025+bell*.016)*globalenv
        data+=struct.pack('<hh',int(max(-1,min(1,l))*32767),int(max(-1,min(1,r))*32767))
    with wave.open(str(ROOT/'careclaim-calm.wav'),'wb') as out:
        out.setnchannels(2);out.setsampwidth(2);out.setframerate(rate);out.writeframes(data)


def main():
    music()
    frame(.9).save(ROOT/'walkthrough-poster.webp',quality=93)
    command=[get_ffmpeg_exe(),'-y','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-vcodec','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart',str(ROOT/'careclaim-walkthrough.mp4')]
    process=subprocess.Popen(command,stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    for i in range(FPS*DURATION):
        process.stdin.write(frame(i/FPS).tobytes())
    process.stdin.close()
    stderr=process.stderr.read().decode(errors='replace')
    if process.wait(): raise RuntimeError(stderr)
    print('Generated 16s H.264 MP4, WebP poster, and 24s original stereo WAV.')


if __name__=='__main__': main()
