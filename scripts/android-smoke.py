"""Exercise installed Palmol through Android UI; fail on missing controls/errors."""
import subprocess, time, re
import xml.etree.ElementTree as ET

def adb(*args):
    return subprocess.check_output(['adb', *args], text=True)

def nodes():
    try:
        adb('shell','uiautomator','dump','/sdcard/window.xml')
        xml=adb('shell','cat','/sdcard/window.xml')
        open('android-ui.xml','w').write(xml)
        return list(ET.fromstring(xml).iter('node'))
    except (subprocess.CalledProcessError, ET.ParseError):
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
    assert 'FATAL EXCEPTION' not in logs, 'Android crash detected'
    subprocess.run('adb exec-out screencap -p > android-smoke.png',shell=True,check=True)
    print('PASS: Android launch, local offline demo, next/previous model, selection panel')
finally:
    open('android-logcat.txt','w').write(adb('logcat','-d'))
    subprocess.run('adb exec-out screencap -p > android-smoke.png',shell=True)
