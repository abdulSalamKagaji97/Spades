from flask import request
from flask_socketio import emit, join_room, leave_room

def register_events(socketio, get_manager, get_store):
    @socketio.on("connect")
    def on_connect():
        emit("connected", {"sid": request.sid})

    @socketio.on("disconnect")
    def on_disconnect():
        manager = get_manager()
        state = manager.state()
        if state:
            pid = request.sid
            if any(p["id"] == pid for p in state.players):
                leave_room(state.code)
                emit("game_state_update", state.to_dict(), room=state.code)

    @socketio.on("create_game")
    def create_game(data):
        name = (data or {}).get("player_name")
        if not name or not str(name).strip():
            emit("error", {"message": "name_required"})
            return
        manager = get_manager()
        store = get_store()
        gs = manager.create_game()
        store.delete()
        manager.join(request.sid, name, gs.code)
        join_room(gs.code)
        emit("game_state_update", gs.to_dict(), room=gs.code)

    @socketio.on("join_game")
    def join_game(data):
        name = data.get("player_name")
        code = data.get("game_code")
        if not name or not str(name).strip():
            emit("error", {"message": "name_required"})
            return
        if not code or not str(code).strip():
            emit("error", {"message": "code_required"})
            return
        manager = get_manager()
        ok = manager.join(request.sid, name, code)
        if not ok:
            emit("error", {"message": "join_failed"})
            return
        state = manager.state()
        join_room(state.code)
        emit("game_state_update", state.to_dict(), room=state.code)

    @socketio.on("start_round")
    def start_round(data=None):
        manager = get_manager()
        store = get_store()
        state = manager.state()
        if not state or request.sid != state.host_id:
            emit("error", {"message": "not_host"})
            return
        if not manager.start_if_ready():
            emit("error", {"message": "start_failed"})
            return
        state = manager.state()
        state.deal_round()
        store.save(state)
        emit("start_round", {"round": state.current_round}, room=state.code)
        emit("game_state_update", state.to_dict(), room=state.code)

    @socketio.on("submit_estimate")
    def submit_estimate(data):
        manager = get_manager()
        store = get_store()
        state = manager.state()
        if not state or state.phase != "estimate":
            emit("error", {"message": "invalid_phase"})
            return
        pid = request.sid
        v = int(data.get("value"))
        result = state.submit_estimate(pid, v)
        if not result.get("ok"):
            emit("error", {"message": result.get("error", "estimate_invalid")})
            return
        store.save(state)
        emit("game_state_update", state.to_dict(), room=state.code)

    @socketio.on("play_card")
    def play_card(data):
        manager = get_manager()
        store = get_store()
        state = manager.state()
        if not state or state.phase != "play":
            emit("error", {"message": "invalid_phase"})
            return
        pid = request.sid
        card = data.get("card")
        result = state.play_card(pid, card)
        if not result.get("ok"):
            emit("error", {"message": "play_invalid"})
            return
        store.save(state)
        emit("game_state_update", state.to_dict(), room=state.code)
        if result.get("end_trick"):
            emit("end_trick", {"winner_index": result.get("winner_index")}, room=state.code)
        if result.get("end_round"):
            emit("end_round", {"round": state.current_round}, room=state.code)
            next_info = state.next_round_or_end()
            store.save(state)
            emit("game_state_update", state.to_dict(), room=state.code)
            if next_info.get("over"):
                emit("game_over", {"scores": state.scores}, room=state.code)
                store.delete()

    @socketio.on("play_again")
    def play_again(data=None):
        manager = get_manager()
        store = get_store()
        prev = manager.state()
        if not prev or prev.phase != "finished":
            emit("error", {"message": "not_finished"})
            return
        players = list(prev.players)
        old_code = prev.code
        gs = manager.create_game()
        store.delete()
        players_sorted = sorted(players, key=lambda p: p.get("seat", 0))
        for p in players_sorted:
            manager.join(p["id"], p["name"], gs.code)
            try:
                leave_room(old_code, sid=p["id"])
            except Exception:
                pass
            try:
                join_room(gs.code, sid=p["id"])
            except Exception:
                pass
        emit("game_state_update", gs.to_dict(), room=gs.code)
