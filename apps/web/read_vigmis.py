import zipfile
import os
import re
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
files = [
    'Vigmis System Architecture Document.docx',
    'ויגמיס.docx',
    'vigmis deck - tnufa novbember 2022.pptx'
]
output = []
for f in files:
    fp = os.path.join(root, f)
    output.append(f'FILE: {f} exists={os.path.exists(fp)}')
    if not os.path.exists(fp):
        continue
    if f.endswith('.docx'):
        with zipfile.ZipFile(fp) as z:
            names = [n for n in z.namelist() if n.startswith('word/') and n.endswith('.xml')]
            output.append(f'  xml count {len(names)}')
            if 'word/document.xml' in names:
                data = z.read('word/document.xml').decode('utf-8', errors='ignore')
                text = ' '.join(re.findall(r'>([^<>]+)<', data))
                output.append('  text sample: ' + text[:1200].replace('\n', ' '))
    elif f.endswith('.pptx'):
        with zipfile.ZipFile(fp) as z:
            slides = [n for n in z.namelist() if n.startswith('ppt/slides/slide')]
            output.append(f'  slides {len(slides)}')
            for n in slides[:3]:
                data = z.read(n).decode('utf-8', errors='ignore')
                text = ' '.join(re.findall(r'>([^<>]+)<', data))
                output.append(f'  slide {n} sample: ' + text[:1200].replace('\n', ' '))
with open(os.path.join(root, 'read_vigmis_output.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(output))
