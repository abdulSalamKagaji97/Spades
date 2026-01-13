import os
import warnings
import eventlet
eventlet.monkey_patch()
warnings.filterwarnings("ignore", category=DeprecationWarning)

from app import app, socketio

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    socketio.run(app, host="0.0.0.0", port=port)
