"""Verify an unmodified source delivery (stdlib only, no network or writes).
Run BEFORE installing dependencies, generating secrets or editing sources.
This is an integrity check, not a build, vulnerability scan or production approval.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]

def verify(root: Path) -> dict:
    root = root.resolve()
    errors: list[str] = []
    entries: dict[str, str] = {}
    manifest = root / 'MANIFEST.sha256'
    if manifest.is_symlink() or not manifest.is_file():
        return {'manifestErrors': ['MANIFEST.sha256 absent ou lien symbolique'], 'filesChecked': 0}
    try:
        for line in manifest.read_text(encoding='utf-8').splitlines():
            digest, sep, name = line.partition('  ')
            parts = PurePosixPath(name).parts
            if not sep or not re.fullmatch(r'[0-9a-f]{64}', digest) or not parts or name.startswith('/') or any(p in ('..','.') for p in parts) or '\\' in name or ':' in name or name in entries or name=='MANIFEST.sha256' or PurePosixPath(name).as_posix()!=name:
                errors.append('Entree de manifeste invalide'); continue
            entries[name] = digest
            p = root.joinpath(*parts)
            current = root
            symbolic = False
            for part in parts:
                current = current / part
                if current.is_symlink(): symbolic = True; break
            if symbolic or not p.is_file():
                errors.append(name + ' absent ou lien symbolique'); continue
            h = hashlib.sha256()
            with p.open('rb') as stream:
                for block in iter(lambda: stream.read(1024*1024), b''): h.update(block)
            if h.hexdigest() != digest: errors.append(name + ' : empreinte differente')
        for directory, dirs, files in os.walk(root, followlinks=False):
            for name in dirs:
                p = Path(directory)/name
                if p.is_symlink(): errors.append(p.relative_to(root).as_posix()+' : lien symbolique')
            for name in files:
                p = Path(directory)/name
                rel = p.relative_to(root).as_posix()
                if rel != 'MANIFEST.sha256' and rel not in entries: errors.append(rel+' : fichier ajoute hors livraison')
    except (OSError, UnicodeError) as error:
        errors.append('Lecture du paquet impossible : ' + type(error).__name__)
    return {'manifestErrors': errors, 'filesChecked': len(entries)}

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    args = parser.parse_args()
    result = verify(args.root)
    result['scope'] = 'integrite de la livraison vierge ; pas de compilation ni de qualification production'
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if result['manifestErrors'] else 0

if __name__ == '__main__':
    sys.exit(main())
