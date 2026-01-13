def validate_create(active_exists):
    return not active_exists

def validate_join(players_count, max_players):
    return players_count < max_players

def validate_estimate(value, n):
    return isinstance(value, int) and 0 <= value <= n

def can_follow_suit(hand, lead):
    return any(c.suit == lead for c in hand)

def validate_play_turn(turn_idx, player_idx):
    return turn_idx == player_idx

def only_spades(hand):
    return all(c.suit == "S" for c in hand) and len(hand) > 0

def validate_play_card(card, hand, lead, spades_broken):
    if lead is None:
        return True
    if any(c.suit == lead for c in hand):
        return card.suit == lead
    return True
