import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)

import os
from flask import Flask, render_template
from flask_socketio import SocketIO

from game_engine.game_state import GameManager
from storage.game_store import GameStore
from sockets.events import register_events

# ----------------------------
# Flask + SocketIO setup
# ----------------------------

app = Flask(__name__, template_folder="templates", static_folder="static")

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="gevent"
)

# ----------------------------
# Lazy game initialization
# ----------------------------

_manager = None
_store = None

def get_manager():
    global _manager
    if _manager is None:
        _manager = GameManager()
    return _manager

def get_store():
    global _store
    if _store is None:
        _store = GameStore()
    return _store

register_events(socketio, get_manager, get_store)

# ----------------------------
# Routes
# ----------------------------

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/health")
def health():
    return "OK", 200

# ----------------------------
# Entry point (Railway)
# ----------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    socketio.run(app, host="0.0.0.0", port=port)
