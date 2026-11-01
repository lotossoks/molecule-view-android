"""Bundle dependency license texts with the offline viewer."""
import json
from pathlib import Path
lock=json.loads(Path('web/package-lock.json').read_text())
parts=['Palmol third-party notices\n\nMol* and its dependencies are distributed under their respective licenses.\n']
for location, info in sorted(lock['packages'].items()):
    if not location or info.get('dev'):
        continue
    root=Path('web')/location
    parts.append(f"\n{'='*72}\n{location} {info.get('version','')} — {info.get('license','See package license')}\n")
    for pattern in ('LICENSE*','LICENCE*','license*','COPYING*'):
        for path in root.glob(pattern):
            if path.is_file():
                parts.append(path.read_text(errors='replace')+'\n')
Path('app/src/main/assets/third-party-notices.txt').write_text('\n'.join(parts))
