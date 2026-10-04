import contextlib
import io
import os
import sys
import traceback


def execute(code: str, workspace_path: str | None = None):
    stdout = io.StringIO()
    stderr = io.StringIO()
    namespace = {
        "__name__": "__main__",
        "__file__": "<mychat-android>",
    }
    previous_cwd = os.getcwd()
    previous_sys_path = list(sys.path)

    try:
        if workspace_path:
            os.makedirs(workspace_path, exist_ok=True)
            os.chdir(workspace_path)
            if workspace_path not in sys.path:
                sys.path.insert(0, workspace_path)

        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            exec(compile(code, "<mychat-android>", "exec"), namespace, namespace)

        return {
            "success": True,
            "stdout": stdout.getvalue(),
            "stderr": stderr.getvalue(),
            "exitCode": 0,
            "error": None,
        }
    except BaseException as exc:
        traceback.print_exc(file=stderr)
        return {
            "success": False,
            "stdout": stdout.getvalue(),
            "stderr": stderr.getvalue(),
            "exitCode": 1,
            "error": f"{type(exc).__name__}: {exc}",
        }
    finally:
        os.chdir(previous_cwd)
        sys.path[:] = previous_sys_path
