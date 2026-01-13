from dataclasses import dataclass
import random

SUITS = ["S", "H", "D", "C"]
RANKS = list(range(2, 15))

@dataclass(frozen=True)
class Card:
    suit: str
    rank: int

def new_deck():
    return [Card(s, r) for s in SUITS for r in RANKS]

def shuffle(deck):
    random.shuffle(deck)
    return deck

def serialize_card(card):
    return {"s": card.suit, "r": card.rank}

def deserialize_card(data):
    return Card(data["s"], int(data["r"]))

def parse_card_str(s):
    suit, rank = s.split("-")
    return Card(suit, int(rank))

def card_str(card):
    return f"{card.suit}-{card.rank}"
