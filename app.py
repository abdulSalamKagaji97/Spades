from flask import Flask, render_template
from flask_socketio import SocketIO
from game_engine.game_state import GameManager
from storage.game_store import GameStore
from sockets.events import register_events

app = Flask(__name__, template_folder="templates", static_folder="static")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")
manager = GameManager()
store = GameStore()
register_events(socketio, manager, store)

@app.route("/")
def index():
    return render_template("index.html")

application = app
