#!/usr/bin/env python3
"""Migrate authored content to visibility-only schema. Dry-run unless --apply."""
import argparse
import os
from pathlib import Path
import re
import tempfile


def migrate_metadata(text, toml=False):
    separator = '=' if toml else ':'
    status = re.search(r'^status\s*' + separator + r'\s*[\"\']?([\w-]+)', text, re.M)
    visibility = re.search(r'^visibility\s*' + separator + r'\s*[\"\']?([\w-]+)', text, re.M)
    text = re.sub(r'^status\s*' + separator + r'[^\n]*(?:\n|$)', '', text, flags=re.M)
    if visibility:
        public = visibility[1] == 'public' and (not status or status[1] not in {'archived', 'draft'})
        value = 'public' if public else 'private'
        replacement = f'visibility = "{value}"' if toml else f'visibility: {value}'
        text = re.sub(r'^visibility\s*' + separator + r'[^\n]*', replacement, text, flags=re.M)
    return text


def migrate_file(path, text):
    if path.name == 'SCHEMA.md':
        if not re.search(r'^version: 1$', text, re.M):
            raise ValueError('Expected schema version 1')
        text = re.sub(r'^version: 1$', 'version: 2', text, flags=re.M)
        text = re.sub(r'^.*\{ name: status,.*\n', '', text, flags=re.M)
        text = text.replace('enum(private,unlisted,public)', 'enum(private,public)')
        text = re.sub(r'6\. \*\*`status` and `visibility` are never merged\*\*.*?project an Item\.',
                      '6. **Visibility is the only exposure state** — `public` or `private`. Only public content is projected to the website.', text, flags=re.S)
        return text
    if path.suffix == '.toml':
        return migrate_metadata(text, True)
    if text.startswith('---\n'):
        end = text.find('\n---', 4)
        if end >= 0:
            return '---\n' + migrate_metadata(text[4:end]) + text[end:]
    return text


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    root = args.root.resolve()
    schema = root / 'SCHEMA.md'
    paths = [schema] + sorted(p for p in (root / 'resources').rglob('*') if p.suffix in {'.md', '.toml'} and p.is_file())
    private_series = []
    for path in paths:
        if path.name == 'series.toml' and re.search(r'^status\s*=\s*["\']archived', path.read_text(), re.M):
            private_series.append(path.parent)
    changes = []
    for path in paths:
        if path.is_symlink():
            raise ValueError(f'Refusing symlink: {path}')
        before = path.read_text()
        after = migrate_file(path, before)
        if path.suffix == '.md' and any(parent in path.parents for parent in private_series) and after.startswith('---\n'):
            end = after.find('\n---', 4)
            if end >= 0:
                after = re.sub(r'^visibility: public$', 'visibility: private', after[:end], flags=re.M) + after[end:]
        if before != after:
            changes.append((path, before, after))
    for path, _, _ in changes:
        print(path.relative_to(root))
    if args.apply:
        written = []
        try:
            # Schema is the activation marker: replace it after all sources.
            for path, before, after in sorted(changes, key=lambda c: c[0] == schema):
                if path.read_text() != before:
                    raise RuntimeError(f'Source changed during migration: {path}')
                fd, temporary = tempfile.mkstemp(dir=path.parent)
                try:
                    with os.fdopen(fd, 'w') as stream:
                        stream.write(after)
                    os.chmod(temporary, path.stat().st_mode)
                    os.replace(temporary, path)
                finally:
                    if os.path.exists(temporary):
                        os.unlink(temporary)
                written.append((path, before))
        except Exception:
            for path, before in reversed(written):
                path.write_text(before)
            raise
    print(f'{len(changes)} files ' + ('updated' if args.apply else 'would change (use --apply)'))

if __name__ == '__main__':
    main()
