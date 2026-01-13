from .deck import Card

def compare_cards(a, b, lead):
    if a.suit == "S" and b.suit != "S":
        return 1
    if b.suit == "S" and a.suit != "S":
        return -1
    if a.suit == "S" and b.suit == "S":
        return (a.rank > b.rank) - (a.rank < b.rank)
    if a.suit == lead and b.suit != lead:
        return 1
    if b.suit == lead and a.suit != lead:
        return -1
    if a.suit == b.suit:
        return (a.rank > b.rank) - (a.rank < b.rank)
    return 0

def trick_winner(lead, plays):
    winner_idx = plays[0][0]
    best = plays[0][1]
    for idx, card in plays[1:]:
        c = compare_cards(card, best, lead)
        if c > 0:
            best = card
            winner_idx = idx
    return winner_idx, best
