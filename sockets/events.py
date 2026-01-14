from flask import request
from flask_socketio import emit, join_room, leave_room
import time

def register_events(socketio, get_manager, get_store):
    def schedule_end_due_to_disconnect(name, code):
        def task():
            socketio.sleep(15)
            manager = get_manager()
            state = manager.get(code)
            if not state or state.code != code or state.phase == "finished":
                return
            if getattr(state, "paused_until", 0) <= 0:
                return
            if time.time() < getattr(state, "paused_until", 0):
                return
            with state.lock:
                state.paused_until = 0
                state.paused_by = ""
                state.phase = "finished"
            store = get_store()
            try:
                store.save(state)
            except Exception:
                pass
            socketio.emit("game_state_update", state.to_dict(), room=code)
            winner_id = None
            best = None
            for pid, sc in (state.scores or {}).items():
                if best is None or (sc or 0) > (best or 0):
                    best = sc or 0
                    winner_id = pid
            socketio.emit("game_over", {"scores": state.scores, "winner_id": winner_id}, room=code)
        socketio.start_background_task(task)
    def schedule_next_round_after_delay(code):
        def task():
            socketio.sleep(3)
            manager = get_manager()
            state = manager.get(code)
            if not state or state.code != code or state.phase not in ("score", "deal"):
                return
            next_info = state.next_round_or_end()
            store = get_store()
            try:
                store.save(state)
            except Exception:
                pass
            socketio.emit("game_state_update", state.to_dict(), room=code)
            if next_info.get("over"):
                socketio.emit("game_over", {"scores": state.scores}, room=code)
                try:
                    store.delete_code(code)
                except Exception:
                    pass
        socketio.start_background_task(task)
    def schedule_end_round_announcement(code):
        def task():
            socketio.sleep(3)
            manager = get_manager()
            state = manager.get(code)
            if not state or state.code != code or state.phase != "score":
                return
            socketio.emit("end_round", {"round": state.current_round}, room=code)
            schedule_next_round_after_delay(code)
        socketio.start_background_task(task)
    @socketio.on("connect")
    def on_connect():
        emit("connected", {"sid": request.sid})

    @socketio.on("disconnect")
    def on_disconnect():
        manager = get_manager()
        state = manager.state_for_sid(request.sid)
        if not state:
            return
        pid = request.sid
        disc = None
        for p in state.players:
            if p["id"] == pid:
                disc = p
                break
        if disc and state.phase not in ("lobby", "finished"):
            with state.lock:
                state.paused_by = disc.get("name")
                state.paused_until = time.time() + 15
            store = get_store()
            try:
                store.save(state)
            except Exception:
                pass
            emit("game_paused", {"name": disc.get("name"), "seconds": 15}, room=state.code)
            schedule_end_due_to_disconnect(disc.get("name"), state.code)
            try:
                leave_room(state.code)
            except Exception:
                pass

    @socketio.on("create_game")
    def create_game(data):
        name = (data or {}).get("player_name")
        if not name or not str(name).strip():
            emit("error", {"message": "name_required"})
            return
        manager = get_manager()
        gs = manager.create_game()
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
        state = manager.get(code)
        if state and state.code == code and state.phase not in ("lobby", "finished") and getattr(state, "paused_until", 0) > time.time():
            pid_new = request.sid
            found = None
            for p in state.players:
                if p.get("name") == name:
                    found = p
                    break
            if found:
                pid_old = found.get("id")
                with state.lock:
                    found["id"] = pid_new
                    if state.host_id == pid_old:
                        state.host_id = pid_new
                    if pid_old in state.hands:
                        state.hands[pid_new] = state.hands.pop(pid_old)
                    if pid_old in state.wins:
                        state.wins[pid_new] = state.wins.pop(pid_old)
                    if pid_old in state.scores:
                        state.scores[pid_new] = state.scores.pop(pid_old)
                    if pid_old in state.estimates:
                        state.estimates[pid_new] = state.estimates.pop(pid_old)
                    for t in state.trick_cards:
                        if t.get("player_id") == pid_old:
                            t["player_id"] = pid_new
                    state.paused_until = 0
                    state.paused_by = ""
                try:
                    join_room(state.code)
                except Exception:
                    pass
                store = get_store()
                try:
                    store.save(state)
                except Exception:
                    pass
                emit("game_resumed", {}, room=state.code)
                emit("game_state_update", state.to_dict(), room=state.code)
                return
        ok = manager.join(request.sid, name, code)
        if not ok:
            emit("error", {"message": "join_failed"})
            return
        state = manager.get(code)
        join_room(state.code)
        emit("game_state_update", state.to_dict(), room=state.code)

    @socketio.on("start_round")
    def start_round(data=None):
        manager = get_manager()
        store = get_store()
        state = manager.state_for_sid(request.sid)
        if not state or request.sid != state.host_id:
            emit("error", {"message": "not_host"})
            return
        if not manager.start_if_ready(state.code):
            emit("error", {"message": "start_failed"})
            return
        state = manager.get(state.code)
        state.deal_round()
        store.save(state)
        emit("start_round", {"round": state.current_round}, room=state.code)
        emit("game_state_update", state.to_dict(), room=state.code)

    @socketio.on("submit_estimate")
    def submit_estimate(data):
        manager = get_manager()
        store = get_store()
        state = manager.state_for_sid(request.sid)
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
        state = manager.state_for_sid(request.sid)
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
        socketio.emit("game_state_update", state.to_dict(), room=state.code)
        if result.get("end_trick"):
            emit("end_trick", {"winner_index": result.get("winner_index"), "trick": result.get("last_trick")}, room=state.code)
        if result.get("end_round"):
            schedule_end_round_announcement(state.code)

    @socketio.on("play_again")
    def play_again(data=None):
        manager = get_manager()
        store = get_store()
        prev = manager.state_for_sid(request.sid)
        if not prev or prev.phase != "finished":
            emit("error", {"message": "not_finished"})
            return
        players = list(prev.players)
        old_code = prev.code
        gs = manager.create_game()
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

    @socketio.on("resume_session")
    def resume_session(data):
        manager = get_manager()
        code = (data or {}).get("game_code")
        state = manager.get(code)
        name = (data or {}).get("player_name")
        if not state or not code or state.code != code:
            emit("error", {"message": "resume_failed"})
            return
        if not name or not str(name).strip():
            emit("error", {"message": "resume_failed"})
            return
        pid_new = request.sid
        found = None
        for p in state.players:
            if p.get("name") == name:
                found = p
                break
        if not found:
            emit("error", {"message": "resume_failed"})
            return
        pid_old = found.get("id")
        if pid_old == pid_new:
            join_room(state.code)
            emit("game_state_update", state.to_dict(), room=state.code)
            return
        with state.lock:
            found["id"] = pid_new
            if state.host_id == pid_old:
                state.host_id = pid_new
            if pid_old in state.hands:
                state.hands[pid_new] = state.hands.pop(pid_old)
            if pid_old in state.wins:
                state.wins[pid_new] = state.wins.pop(pid_old)
            if pid_old in state.scores:
                state.scores[pid_new] = state.scores.pop(pid_old)
            if pid_old in state.estimates:
                state.estimates[pid_new] = state.estimates.pop(pid_old)
            for t in state.trick_cards:
                if t.get("player_id") == pid_old:
                    t["player_id"] = pid_new
            if getattr(state, "paused_until", 0) > 0:
                state.paused_until = 0
                state.paused_by = ""
        try:
            join_room(state.code)
        except Exception:
            pass
        store = get_store()
        try:
            store.save(state)
        except Exception:
            pass
        emit("game_resumed", {}, room=state.code)
        emit("game_state_update", state.to_dict(), room=state.code)

    @socketio.on("leave_game")
    def leave_game(data=None):
        manager = get_manager()
        store = get_store()
        state = manager.state_for_sid(request.sid)
        if not state:
            emit("error", {"message": "leave_failed"})
            return
        pid = request.sid
        disc_name = None
        for p in state.players:
            if p.get("id") == pid:
                disc_name = p.get("name")
                break
        ok = state.remove_player(pid)
        try:
            leave_room(state.code)
        except Exception:
            pass
        if ok:
            try:
                store.save(state)
            except Exception:
                pass
            if state.phase not in ("lobby", "finished"):
                with state.lock:
                    state.paused_by = disc_name or "Player"
                    state.paused_until = time.time() + 15
                try:
                    store.save(state)
                except Exception:
                    pass
                emit("game_paused", {"name": disc_name or "Player", "seconds": 15}, room=state.code)
                schedule_end_due_to_disconnect(disc_name or "Player", state.code)
            emit("game_state_update", state.to_dict(), room=state.code)
        else:
            emit("error", {"message": "leave_failed"})
