"""Exercise installed Palmol through Android UI; fail on missing controls/errors."""
import subprocess, time, re
import xml.etree.ElementTree as ET

def adb(*args):
    return subprocess.check_output(['adb', *args], text=True, timeout=30)

def nodes():
    try:
        adb('shell','uiautomator','dump','/sdcard/window.xml')
        xml=adb('shell','cat','/sdcard/window.xml')
        open('android-ui.xml','w').write(xml)
        return list(ET.fromstring(xml).iter('node'))
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ET.ParseError):
        return []  # Window tree may not exist during the first launch frames.

def wait_text(text, tap=False):
    for _ in range(30):
        for node in nodes():
            if node.attrib.get('text') == text:
                if tap:
                    x1,y1,x2,y2=map(int,re.findall(r'\d+',node.attrib['bounds']))
                    adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
                return
        time.sleep(2)
    raise AssertionError('Missing UI text: '+text)

try:
    adb('logcat','-c')
    adb('shell','am','start','-n','org.lotossoks.palmol/.MainActivity')
    wait_text('Ready')
    app_pid=adb('shell','pidof','org.lotossoks.palmol').strip()
    wait_text('Open',True)
    wait_text('Demo: two states',True)
    wait_text('1 / 2')
    wait_text('▶',True)
    wait_text('2 / 2')
    wait_text('◀',True)
    wait_text('1 / 2')
    wait_text('Select',True)
    wait_text('PyMOL selection')
    adb('shell','input','keyevent','4')
    logs=adb('logcat','-d')
    open('android-logcat.txt','w').write(logs)
    assert adb('shell','pidof','org.lotossoks.palmol').strip()==app_pid, 'Palmol process restarted'
    assert 'FATAL EXCEPTION' not in adb('logcat','-d','--pid='+app_pid), 'Palmol crash detected'
    subprocess.run('adb exec-out screencap -p > android-smoke.png',shell=True,check=True)
    from PIL import Image
    rendered=False
    for _ in range(15):
        time.sleep(1)
        subprocess.run('adb exec-out screencap -p > android-scene.png',shell=True,check=True)
        image=Image.open('android-scene.png').convert('RGB');w,h=image.size
        pixels=image.crop((w//10,h//5,w*9//10,h*7//10)).getdata()
        if sum(1 for r,g,b in pixels if b>90 and b>r*1.3 and b>g*1.3)>20:
            rendered=True;break
        adb('shell','input','tap','820','125')  # Native reset-camera action.
    assert rendered, 'No rendered molecule pixels in the viewport'
    print('PASS: visible molecular rendering')
    print('PASS: Android launch, local offline demo, next/previous model, selection panel')
finally:
    try:
        open('android-logcat.txt','w').write(adb('logcat','-d'))
        subprocess.run('adb exec-out screencap -p > android-smoke.png',shell=True,timeout=30)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        print('Android emulator disconnected during diagnostics')
