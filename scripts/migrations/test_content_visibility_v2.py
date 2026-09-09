import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('migration', Path(__file__).with_name('content-visibility-v2.py'))
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)

class MigrationTests(unittest.TestCase):
    def test_preserves_body_and_maps_hidden_content_to_private(self):
        for status, visibility, expected in [('published', 'public', 'public'), ('draft', 'public', 'private'), ('archived', 'public', 'private'), ('published', 'unlisted', 'private'), ('active', 'private', 'private')]:
            body = '\n---\n\n# Body\n\nstatus: published\nvisibility: public\n'
            source = f'---\ntitle: Test\nstatus: {status}\nvisibility: {visibility}' + body
            updated = migration.migrate_file(Path('en.md'), source)
            self.assertEqual(updated, f'---\ntitle: Test\nvisibility: {expected}' + body)
    def test_translation_without_frontmatter_unchanged(self):
        self.assertEqual(migration.migrate_file(Path('zh.md'), '# 正文\n'), '# 正文\n')
    def test_schema_rejects_repeated_migration(self):
        with self.assertRaises(ValueError):
            migration.migrate_file(Path('SCHEMA.md'), 'version: 2\n')
    def test_series_status_removed(self):
        self.assertEqual(migration.migrate_file(Path('series.toml'), 'title = "Series"\nstatus = "ongoing"\n'), 'title = "Series"\n')
if __name__ == '__main__':
    unittest.main()
