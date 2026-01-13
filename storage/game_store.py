import os
import json
import threading

class GameStore:
    def __init__(self):
        self.lock = threading.RLock()
        self.path = os.path.join(os.path.dirname(__file__), "game_state.json")

    def save(self, state):
        with self.lock:
            with open(self.path, "w") as f:
                json.dump(state.to_dict(), f)

    def delete(self):
        with self.lock:
            if os.path.exists(self.path):
                os.remove(self.path)
