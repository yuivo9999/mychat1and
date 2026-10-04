import contextlib
import hashlib
import io
import json
import os
import runpy
import shlex
import sys
import traceback
from pathlib import Path


def _snapshot(root: Path):
    result = {}
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if "__pycache__" in path.parts:
            continue
        rel = path.relative_to(root).as_posix()
        data = path.read_bytes()
        result[rel] = hashlib.sha256(data).hexdigest()
    return result


def _read_changed_files(root: Path, before):
    changed = []
    binary_files = []
    for path in root.rglob("*"):
        if not path.is_file() or "__pycache__" in path.parts:
            continue
        rel = path.relative_to(root).as_posix()
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if before.get(rel) == digest:
            continue
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            binary_files.append(rel)
            continue
        changed.append({"path": rel, "content": text, "deleted": False, "isBinary": False})

    for rel in before:
        if not (root / rel).exists():
            changed.append({"path": rel, "deleted": True})

    return changed, binary_files


def _execute(command: str, root: Path):
    argv = shlex.split(command)
    if not argv:
        raise ValueError("命令为空")
    if argv[0] not in ("python", "python3", "py"):
        raise ValueError("Android 原生运行时当前只允许 Python 命令。请使用 python / python3。")

    args = argv[1:]
    if not args:
        raise ValueError("缺少 Python 脚本路径或 -c 代码。")

    old_cwd = os.getcwd()
    old_argv = sys.argv[:]
    os.chdir(root)
    os.environ["HOME"] = str(root)
    sys.path.insert(0, str(root))

    stdout = io.StringIO()
    stderr = io.StringIO()
    exit_code = 0

    try:
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            if args[0] == "-c":
                if len(args) < 2:
                    raise ValueError("python -c 缺少代码参数")
                code = args[1]
                sys.argv = ["-c", *args[2:]]
                exec(compile(code, "<android-python>", "exec"), {"__name__": "__main__", "__file__": "<android-python>"})
            elif args[0] == "-m":
                if len(args) < 2:
                    raise ValueError("python -m 缺少模块名")
                module = args[1]
                sys.argv = [module, *args[2:]]
                runpy.run_module(module, run_name="__main__")
            else:
                script = Path(args[0])
                if script.is_absolute() or ".." in script.parts:
                    raise ValueError("Python 脚本必须位于当前工作区内。")
                script_path = (root / script).resolve()
                if not script_path.is_file() or root not in script_path.parents:
                    raise FileNotFoundError(f"工作区中不存在脚本: {script}")
                sys.argv = [str(script), *args[1:]]
                runpy.run_path(str(script_path), run_name="__main__")
    except SystemExit as exc:
        code = exc.code
        exit_code = int(code) if isinstance(code, int) else 0
    except BaseException:
        exit_code = 1
        traceback.print_exc(file=stderr)
    finally:
        sys.argv = old_argv
        os.chdir(old_cwd)
        if sys.path and sys.path[0] == str(root):
            sys.path.pop(0)

    return {
        "success": exit_code == 0,
        "stdout": stdout.getvalue(),
        "stderr": stderr.getvalue(),
        "exitCode": exit_code,
    }


def run(command: str, root_path: str):
    root = Path(root_path).resolve()
    before = _snapshot(root)
    result = _execute(command, root)
    changed, binary_files = _read_changed_files(root, before)
    result["changedFiles"] = changed
    result["binaryFiles"] = binary_files
    result["durationMs"] = 0
    return json.dumps(result, ensure_ascii=False)
