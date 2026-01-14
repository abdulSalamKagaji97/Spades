import os
import json
import threading

class GameStore:
    def __init__(self):
        self.lock = threading.RLock()
        self.dir = os.path.join(os.path.dirname(__file__), "games")
        if not os.path.exists(self.dir):
            try:
                os.makedirs(self.dir, exist_ok=True)
            except Exception:
                pass
 
    def _path_for_code(self, code: str):
        return os.path.join(self.dir, f"{code}.json")
 
    def save(self, state):
        with self.lock:
            p = self._path_for_code(state.code)
            with open(p, "w") as f:
                json.dump(state.to_dict(), f)
 
    def delete_code(self, code: str):
        with self.lock:
            p = self._path_for_code(code)
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass
