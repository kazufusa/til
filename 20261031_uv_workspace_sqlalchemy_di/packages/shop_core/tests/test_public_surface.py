"""アプリは shop_core の公開面だけを import する。基盤の内部に依存すると、基盤側の改修が壊れる"""

import ast
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[3]
_APPS = ("app1", "app2")
# 公開面。それ以外の shop_core.* は内部(infra、usecase、domain、di、container など)
_ALLOWED = {"shop_core", "shop_core.tables", "shop_core.testing", "shop_core.fastapi"}


def _imports(path: Path):
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                yield node.lineno, alias.name
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            yield node.lineno, node.module


def _violations():
    found = []
    for app in _APPS:
        for path in sorted((_ROOT / app / "src").rglob("*.py")):
            for lineno, module in _imports(path):
                if module.split(".")[0] != "shop_core":
                    continue
                if module not in _ALLOWED:
                    found.append(f"{path.relative_to(_ROOT)}:{lineno} imports {module}")
    return found


def test_app_sources_exist():
    assert any((_ROOT / app / "src").is_dir() for app in _APPS)


def test_apps_import_only_the_public_surface():
    assert _violations() == []


def test_the_scan_catches_internal_imports(tmp_path, monkeypatch):
    bad = tmp_path / "app1" / "src" / "app1"
    bad.mkdir(parents=True)
    (bad / "x.py").write_text("from shop_core.infra.db import make_engine\nimport shop_core.usecase.uow\n")
    monkeypatch.setitem(globals(), "_ROOT", tmp_path)
    monkeypatch.setitem(globals(), "_APPS", ("app1",))
    assert len(_violations()) == 2
