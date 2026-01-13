import os
import json
from eventlet.semaphore import Semaphore

class GameStore:
    def __init__(self):
        self.lock = Semaphore(1)
        self.path = os.path.join(os.path.dirname(__file__), "game_state.json")

    def save(self, state):
        self.lock.acquire()
        try:
            with open(self.path, "w") as f:
                json.dump(state.to_dict(), f)
        finally:
            self.lock.release()

    def delete(self):
        self.lock.acquire()
        try:
            if os.path.exists(self.path):
                os.remove(self.path)
        finally:
            self.lock.release()
