#!/usr/bin/env python3
"""Print Firebase deploy targets exported by functions/main.py.

Firebase discovers Python functions through the imports re-exported from main.py.
Keeping the CI target selection derived from that entrypoint prevents new callable
exports from being silently omitted from production deployments.
"""

from __future__ import annotations

import argparse
import ast
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
FUNCTIONS_DIR = ROOT / "functions"
ENTRYPOINT = FUNCTIONS_DIR / "main.py"

# Auth blocking triggers are deliberately not part of this deploy transaction:
# updating them changes Identity Toolkit configuration and needs a separately
# authorized credential. HTTP callables are safe to deploy with this CI identity.
HTTP_DECORATORS = {"on_call", "on_request"}


def decorator_name(decorator: ast.expr) -> str | None:
    """Return the final attribute/call name used by a decorator."""
    node = decorator.func if isinstance(decorator, ast.Call) else decorator
    if isinstance(node, ast.Attribute):
        return node.attr
    if isinstance(node, ast.Name):
        return node.id
    return None


def exported_imports(entrypoint: Path) -> list[tuple[str, str]]:
    tree = ast.parse(entrypoint.read_text(encoding="utf-8"), filename=str(entrypoint))
    exports: list[tuple[str, str]] = []
    for statement in tree.body:
        if not isinstance(statement, ast.ImportFrom) or statement.level != 0 or not statement.module:
            continue
        for imported in statement.names:
            if imported.name == "*":
                raise ValueError("functions/main.py must not use wildcard imports")
            exports.append((statement.module, imported.asname or imported.name))
    return exports


def function_decorators(module: str) -> dict[str, set[str]]:
    module_path = FUNCTIONS_DIR.joinpath(*module.split(".")).with_suffix(".py")
    if not module_path.is_file():
        raise ValueError(f"Export module {module!r} does not resolve to {module_path}")

    tree = ast.parse(module_path.read_text(encoding="utf-8"), filename=str(module_path))
    decorators: dict[str, set[str]] = {}
    for statement in tree.body:
        if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef)):
            decorators[statement.name] = {
                name
                for decorator in statement.decorator_list
                if (name := decorator_name(decorator)) is not None
            }
    return decorators


def deployable_targets() -> list[str]:
    targets: list[str] = []
    inspected_modules: dict[str, dict[str, set[str]]] = {}
    for module, export_name in exported_imports(ENTRYPOINT):
        decorators = inspected_modules.setdefault(module, function_decorators(module))
        if export_name not in decorators:
            raise ValueError(
                f"functions/main.py exports {export_name!r} from {module!r}, "
                "but it is not a top-level function in that module"
            )
        if decorators[export_name] & HTTP_DECORATORS:
            targets.append(export_name)

    if not targets:
        raise ValueError("No HTTP callable exports found in functions/main.py")
    if len(targets) != len(set(targets)):
        raise ValueError("functions/main.py exports duplicate HTTP callable names")
    return targets


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--format", choices=("plain", "firebase"), default="plain")
    args = parser.parse_args()
    try:
        targets = deployable_targets()
    except (OSError, SyntaxError, ValueError) as error:
        print(f"Function deploy target validation failed: {error}", file=sys.stderr)
        return 1

    if args.format == "firebase":
        print(",".join(f"functions:{target}" for target in targets))
    else:
        print("\n".join(targets))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
