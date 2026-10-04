import contextlib
import io
import traceback


def execute(code: str):
    stdout = io.StringIO()
    stderr = io.StringIO()
    namespace = {
        "__name__": "__main__",
        "__file__": "<mychat-android>",
    }

    try:
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
