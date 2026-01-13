from eventlet.semaphore import Semaphore
import json
import uuid
from typing import List, Dict, Optional
from .deck import new_deck, shuffle, Card, serialize_card, parse_card_str
from .rules import trick_winner
from .scoring import compute_score
from .validators import validate_estimate, validate_play_turn, validate_play_card, validate_join, validate_create

class GameState:
    def __init__(self, code: str):
        self.code = code
        self.players: List[Dict] = []
        self.phase = "lobby"
        self.host_id: Optional[str] = None
        self.current_round = 0
        self.total_rounds = 0
        self.dealer_index: Optional[int] = None
        self.lead_index: Optional[int] = None
        self.turn_index: Optional[int] = None
        self.estimate_turn_index: Optional[int] = None
        self.hands: Dict[str, List[Card]] = {}
        self.estimates: Dict[str, int] = {}
        self.estimates_open: bool = False
        self.wins: Dict[str, int] = {}
        self.scores: Dict[str, int] = {}
        self.trick_cards: List[Dict] = []
        self.deck: List[Card] = []
        self.spades_broken: bool = False
        self.history: List[Dict] = []
        self.lock = Semaphore(1)

    def player_count(self):
        return len(self.players)

    def seats(self):
        return [p["id"] for p in self.players]

    def player_index(self, pid):
        return next(i for i, p in enumerate(self.players) if p["id"] == pid)

    def to_dict(self):
        return {
            "code": self.code,
            "phase": self.phase,
            "current_round": self.current_round,
            "total_rounds": self.total_rounds,
            "host_id": self.host_id,
            "dealer_index": self.dealer_index,
            "lead_index": self.lead_index,
            "turn_index": self.turn_index,
            "estimate_turn_index": self.estimate_turn_index,
            "estimates_open": self.estimates_open,
            "spades_broken": self.spades_broken,
            "players": [{"id": p["id"], "name": p["name"], "seat": p["seat"]} for p in self.players],
            "hands": {pid: [serialize_card(c) for c in cards] for pid, cards in self.hands.items()},
            "estimates": dict(self.estimates),
            "wins": dict(self.wins),
            "scores": dict(self.scores),
            "history": list(self.history),
            "trick": [{"player_id": t["player_id"], "card": serialize_card(t["card"])} for t in self.trick_cards],
        }

    def add_player(self, pid, name):
        with self.lock:
            seat = len(self.players)
            self.players.append({"id": pid, "name": name, "seat": seat})
            if seat == 0:
                self.host_id = pid
            self.hands[pid] = []
            self.wins[pid] = 0
            self.scores.setdefault(pid, 0)

    def start(self):
        with self.lock:
            n = self.player_count()
            # self.total_rounds = 52 // n
            self.total_rounds = 3
            self.current_round = 1
            self.dealer_index = 0
            self.phase = "deal"

    def anticlockwise_order(self, start_index):
        n = self.player_count()
        return [(start_index + i) % n for i in range(n)]

    def deal_round(self):
        with self.lock:
            n = self.player_count()
            r = self.current_round
            self.deck = shuffle(new_deck())
            for pid in self.hands:
                self.hands[pid] = []
            order = self.anticlockwise_order((self.dealer_index + 1) % n)
            k = 0
            for _ in range(r):
                for idx in order:
                    pid = self.players[idx]["id"]
                    self.hands[pid].append(self.deck[k])
                    k += 1
            self.lead_index = (self.dealer_index + 1) % n
            self.turn_index = self.lead_index
            self.estimates = {}
            self.estimates_open = False
            self.estimate_turn_index = self.lead_index
            for pid in self.seats():
                self.wins[pid] = 0
            self.trick_cards = []
            self.spades_broken = False
            self.phase = "estimate"

    def submit_estimate(self, pid, value):
        with self.lock:
            n = self.current_round
            if not validate_estimate(value, n):
                return {"ok": False, "error": "estimate_invalid"}
            idx = self.player_index(pid)
            if self.estimate_turn_index is None or idx != self.estimate_turn_index:
                return {"ok": False, "error": "estimate_out_of_turn"}
            self.estimates[pid] = value
            if len(self.estimates) == self.player_count():
                self.estimates_open = True
                self.phase = "play"
                self.turn_index = self.lead_index
                self.estimate_turn_index = None
                return {"ok": True, "complete": True}
            self.estimate_turn_index = (self.estimate_turn_index + 1) % self.player_count()
            return {"ok": True, "complete": False}

    def advance_turn(self):
        self.turn_index = (self.turn_index + 1) % self.player_count()

    def play_card(self, pid, card_str):
        with self.lock:
            idx = self.player_index(pid)
            if not validate_play_turn(self.turn_index, idx):
                return {"ok": False}
            card = parse_card_str(card_str)
            hand = self.hands[pid]
            if card not in hand:
                return {"ok": False}
            lead = None
            if self.trick_cards:
                lead = self.trick_cards[0]["card"].suit
            if not validate_play_card(card, hand, lead, self.spades_broken):
                return {"ok": False}
            hand.remove(card)
            self.trick_cards.append({"player_id": pid, "card": card})
            if len(self.trick_cards) == self.player_count():
                plays = [(self.player_index(t["player_id"]), t["card"]) for t in self.trick_cards]
                lead_suit = self.trick_cards[0]["card"].suit
                if lead_suit != "S" and any(c.suit == "S" for _, c in plays):
                    self.spades_broken = True
                winner_idx, _ = trick_winner(lead_suit, plays)
                winner_pid = self.players[winner_idx]["id"]
                self.wins[winner_pid] = self.wins.get(winner_pid, 0) + 1
                self.trick_cards = []
                self.lead_index = winner_idx
                self.turn_index = winner_idx
                round_done = all(len(self.hands[x]) == 0 for x in self.seats())
                if round_done:
                    self.phase = "score"
                    round_entry = {"round": self.current_round, "players": []}
                    for pid in self.seats():
                        est = self.estimates.get(pid, 0)
                        w = self.wins.get(pid, 0)
                        delta = compute_score(est, w)
                        self.scores[pid] = self.scores.get(pid, 0) + delta
                        player = next(p for p in self.players if p["id"] == pid)
                        round_entry["players"].append({"id": pid, "name": player["name"], "estimate": est, "wins": w, "delta": delta})
                    self.history.append(round_entry)
                    return {"ok": True, "end_trick": True, "winner_index": winner_idx, "end_round": True}
                return {"ok": True, "end_trick": True, "winner_index": winner_idx, "end_round": False}
            else:
                self.advance_turn()
                return {"ok": True, "end_trick": False, "end_round": False}

    def next_round_or_end(self):
        with self.lock:
            if self.current_round < self.total_rounds:
                self.current_round += 1
                self.dealer_index = (self.dealer_index + 1) % self.player_count()
                self.phase = "deal"
                return {"over": False}
            self.phase = "finished"
            return {"over": True}

class GameManager:
    def __init__(self):
        self.lock = Semaphore(1)
        self.active: Optional[GameState] = None

    def has_active(self):
        return self.active is not None and self.active.phase != "finished"

    def create_game(self):
        with self.lock:
            code = str(uuid.uuid4())[:6].upper()
            self.active = GameState(code)
            return self.active

    def join(self, pid, name, code):
        with self.lock:
            if self.active is None or self.active.code != code:
                return False
            if self.active.phase != "lobby":
                return False
            if not validate_join(self.active.player_count(), 6):
                return False
            self.active.add_player(pid, name)
            return True

    def start_if_ready(self):
        with self.lock:
            if not self.active or not (2 <= self.active.player_count() <= 6):
                return False
            if self.active.phase == "lobby":
                self.active.start()
                return True
            if self.active.phase == "deal":
                return True
            return False

    def state(self):
        with self.lock:
            return self.active
