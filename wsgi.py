"""Production WSGI entry point.

The production WSGI server (gunicorn) imports this module and serves the
callable named ``app``:

    gunicorn wsgi:app

The application itself is imported unchanged from backend/app.py, so local
development and production run exactly the same code.

Flask's development server is never used in production: nothing here calls
``app.run()``, because that call lives behind ``if __name__ == "__main__"`` in
backend/app.py and is therefore skipped on import.
"""

import os
import sys

# backend/ is not a package, so put it on the import path explicitly. This is
# done with an absolute path so it works whatever working directory the hosting
# platform chooses.
BACKEND_DIR = os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app import app  # noqa: E402  (must follow the sys.path change above)

__all__ = ["app"]
