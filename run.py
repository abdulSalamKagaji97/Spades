import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)
import os

from app import app, socketio

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting server on 0.0.0.0:{port}", flush=True)
    socketio.run(app, host="0.0.0.0", port=port)
