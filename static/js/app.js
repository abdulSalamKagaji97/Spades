const state = {
  socket: null,
  me: null,
  game: null,
  estimator: 0,
  selectedCard: null,
  insightExpanded: false,
  currentTab: "players",
  roundsOpen: {},
  dealing: false,
  _dealTimer: null,
  _inlineTimer: null,
  _confettiTimer: null,
  _confettiShown: false,
  audioCtx: null,
  prevTrickLen: 0,
  lastCompletedTrick: [],
  trickPauseUntil: 0,
  _countdownTimer: null,
  _countdownTicks: 0,
};
function $(id) {
  return document.getElementById(id);
}
function suitChar(s) {
  if (s === "S") return "♠";
  if (s === "H") return "♥";
  if (s === "D") return "♦";
  return "♣";
}
function rankText(r) {
  if (r === 11) return "J";
  if (r === 12) return "Q";
  if (r === 13) return "K";
  if (r === 14) return "A";
  return String(r);
}
function cardKey(c) {
  return c.s + "-" + c.r;
}
function setPhaseBadge(phase) {
  const el = $("phaseBadge");
  el.textContent = phase || "lobby";
  el.classList.remove(
    "phase-deal",
    "phase-estimate",
    "phase-play",
    "phase-score"
  );
  if (phase === "deal") el.classList.add("phase-deal");
  if (phase === "estimate") el.classList.add("phase-estimate");
  if (phase === "play") el.classList.add("phase-play");
  if (phase === "score") el.classList.add("phase-score");
}
function renderContext() {
  const r = state.game ? state.game.current_round : 0;
  const t = state.game ? state.game.total_rounds : 0;
  $("roundIndicator").textContent = state.game ? "Round " + r + " of " + t : "";
  setPhaseBadge(state.game ? state.game.phase : "lobby");
  $("sessionId").textContent = state.game ? state.game.code : "";
}
function renderFocus() {
  const root = $("focusContent");
  root.innerHTML = "";
  const secondary = $("secondaryAction");
  if (secondary) secondary.style.display = "none";
  if (!state.game) {
    const wrap = document.createElement("div");
    wrap.className = "lobby-view";
    const name = document.createElement("input");
    name.id = "inputName";
    name.placeholder = "Your name";
    const code = document.createElement("input");
    code.id = "inputCode";
    code.placeholder = "Session ID (optional)";
    const status = document.createElement("div");
    status.id = "statusText";
    status.className = "status-text";
    const hint = document.createElement("div");
    hint.className = "status-text";
    hint.textContent =
      "Enter a name to create a game or provide a session ID to join.";
    wrap.appendChild(name);
    wrap.appendChild(code);
    wrap.appendChild(status);
    wrap.appendChild(hint);
    root.appendChild(wrap);
    const enabled = (name.value || "").trim().length > 0;
    const initialLabel =
      (code.value || "").trim().length > 0 ? "Join Game" : "Start Game";
    renderDock(initialLabel, enabled);
    name.oninput = () => {
      const ok = (name.value || "").trim().length > 0;
      const label =
        (code.value || "").trim().length > 0 ? "Join Game" : "Start Game";
      renderDock(label, ok);
      setStatus("");
    };
    code.oninput = () => {
      const ok = (name.value || "").trim().length > 0;
      const label =
        (code.value || "").trim().length > 0 ? "Join Game" : "Start Game";
      renderDock(label, ok);
      setStatus("");
    };
    setStatus("");
    return;
  }
  const phase = state.game.phase;
  if (phase === "lobby") {
    const wrap = document.createElement("div");
    wrap.className = "lobby-view";
    const sid = document.createElement("div");
    sid.className = "session-display";
    sid.textContent = "Session: " + (state.game.code || "");
    const list = document.createElement("div");
    list.className = "player-names";
    (state.game.players || []).forEach((p) => {
      const r = document.createElement("div");
      r.textContent = p.name;
      list.appendChild(r);
    });
    const status = document.createElement("div");
    status.className = "status-text";
    const canStart =
      (state.game.players || []).length >= 2 && state.me === state.game.host_id;
    status.textContent =
      (state.game.players || []).length < 2
        ? "Waiting for players"
        : state.me === state.game.host_id
        ? "Ready to start"
        : "Only host can start";
    wrap.appendChild(sid);
    wrap.appendChild(list);
    wrap.appendChild(status);
    root.appendChild(wrap);
    renderDock("Start Game", canStart);
    setStatus("");
    return;
  }
  if (phase === "deal") {
    const wrap = document.createElement("div");
    wrap.className = "deal-view";
    const anim = document.createElement("div");
    anim.className = "deal-anim";
    const msg = document.createElement("div");
    msg.textContent = "Dealing cards";
    wrap.appendChild(anim);
    wrap.appendChild(msg);
    root.appendChild(wrap);
    const canStart =
      (state.game.players || []).length >= 2 && state.me === state.game.host_id;
    renderDock("Start Round", canStart);
    setStatus("");
    return;
  }
  if (phase === "estimate") {
    const wrap = document.createElement("div");
    wrap.className = "estimate-view";
    const turnIdx =
      typeof state.game.estimate_turn_index === "number"
        ? state.game.estimate_turn_index
        : null;
    const turnPlayer =
      turnIdx !== null ? (state.game.players || [])[turnIdx] : null;
    const turnLabel = document.createElement("div");
    turnLabel.className = "estimate-turn";
    turnLabel.textContent = turnPlayer
      ? "Estimating: " + turnPlayer.name
      : "Estimating";
    const hand = document.createElement("div");
    hand.className = "hand-row";
    const cards = state.game.hands[state.me] || [];
    hand.innerHTML = "";
    wrap.appendChild(turnLabel);
    cards.forEach((c) => {
      const d = document.createElement("div");
      d.className = "card-item";
      const face = document.createElement("div");
      face.className = "card-face";
      const rank = document.createElement("span");
      rank.textContent = rankText(c.r);
      const suit = document.createElement("span");
      suit.className = "suit-symbol s-" + c.s;
      suit.textContent = suitChar(c.s);
      face.appendChild(rank);
      face.appendChild(suit);
      d.appendChild(face);
      hand.appendChild(d);
    });
    const myTurn =
      !!turnPlayer && turnPlayer.id === state.me && phase === "estimate";
    let est = null;
    if (myTurn) {
      est = document.createElement("div");
      est.className = "estimator";
      const val = document.createElement("div");
      val.className = "estimator-value";
      val.id = "estValue";
      val.textContent = String(state.estimator);
      const ctr = document.createElement("div");
      ctr.className = "estimator-controls";
      const minus = document.createElement("button");
      minus.className = "control-btn";
      minus.id = "btnMinus";
      minus.textContent = "−";
      const plus = document.createElement("button");
      plus.className = "control-btn";
      plus.id = "btnPlus";
      plus.textContent = "+";
      ctr.appendChild(minus);
      ctr.appendChild(plus);
      est.appendChild(val);
      est.appendChild(ctr);
    }
    wrap.appendChild(hand);
    if (est) wrap.appendChild(est);
    root.appendChild(wrap);
    {
      const paused = Date.now() < (state.trickPauseUntil || 0);
      renderDock("Submit Estimate", myTurn && !paused);
    }
    setStatus("");
    if (state.dealing) {
      requestAnimationFrame(runDealToHand);
    }
    return;
  }
  if (phase === "play") {
    const wrap = document.createElement("div");
    wrap.className = "play-view";
    const table = document.createElement("div");
    table.className = "table-cards";
    const paused = Date.now() < (state.trickPauseUntil || 0);
    const trickCards = paused
      ? state.lastCompletedTrick || []
      : state.game.trick || [];
    trickCards.forEach((t) => {
      const c = t.card;
      const d = document.createElement("div");
      d.className = "played-card";
      d.textContent = rankText(c.r) + " " + suitChar(c.s);
      table.appendChild(d);
    });
    const turn = document.createElement("div");
    turn.className = "current-player";
    const p =
      state.game.turn_index !== null
        ? state.game.players[state.game.turn_index]
        : null;
    const paused2 = Date.now() < (state.trickPauseUntil || 0);
    turn.textContent = paused2 ? "" : p ? "Turn: " + p.name : "";
    const hand = document.createElement("div");
    hand.className = "hand-row-bottom hand-arc";
    const cards = state.game.hands[state.me] || [];
    const leadSuit =
      trickCards && trickCards.length > 0 ? trickCards[0].card.s : null;
    const hasLead = leadSuit ? cards.some((c) => c.s === leadSuit) : false;
    hand.innerHTML = "";
    const n2 = cards.length;
    const step2 = 24;
    const cardW2 = 60;
    const arc2 = 16;
    hand.style.position = "relative";
    hand.style.height = "110px";
    hand.style.width = String(step2 * Math.max(0, n2 - 1) + cardW2) + "px";
    hand.style.margin = "0 auto";
    cards.forEach((c, i) => {
      const d = document.createElement("div");
      d.className = "card-item card-item-arc";
      d.dataset.card = cardKey(c);
      const face = document.createElement("div");
      face.className = "card-face";
      const rank = document.createElement("span");
      rank.textContent = rankText(c.r);
      const suit = document.createElement("span");
      suit.className = "suit-symbol s-" + c.s;
      suit.textContent = suitChar(c.s);
      face.appendChild(rank);
      face.appendChild(suit);
      d.appendChild(face);
      const tt = n2 > 1 ? (i / (n2 - 1)) * 2 - 1 : 0;
      const yy = -arc2 * (1 - tt * tt);
      const ang2 = tt * 8;
      d.style.left = String(i * step2) + "px";
      d.style.transform =
        "translateY(" + String(yy) + "px) rotate(" + String(ang2) + "deg)";
      d.style.zIndex = String(i);
      const myTurn =
        state.game.turn_index !== null &&
        state.game.players[state.game.turn_index] &&
        state.game.players[state.game.turn_index].id === state.me;
      const paused = Date.now() < (state.trickPauseUntil || 0);
      const canPlay =
        !paused && myTurn && (!leadSuit || !hasLead || c.s === leadSuit);
      if (canPlay) {
        d.onclick = () => {
          state.selectedCard = d.dataset.card;
          renderDock("Play Card", true);
          renderFocus();
        };
      } else {
        d.style.opacity = "0.5";
      }
      if (state.selectedCard === d.dataset.card) {
        d.classList.add("selected");
      }
      hand.appendChild(d);
    });
    wrap.appendChild(table);
    wrap.appendChild(turn);
    wrap.appendChild(hand);
    root.appendChild(wrap);
    const myTurn =
      state.game.turn_index !== null &&
      state.game.players[state.game.turn_index] &&
      state.game.players[state.game.turn_index].id === state.me;
    renderDock("Play Card", !paused && myTurn && !!state.selectedCard);
    setStatus("");
    return;
  }
  if (phase === "score") {
    renderDock("", false);
    setStatus("");
    return;
  }
  if (phase === "finished") {
    const wrap = document.createElement("div");
    wrap.className = "leaderboard-view";
    const ordered = Object.entries(state.game.scores || {}).sort(
      (a, b) => b[1] - a[1]
    );
    if (ordered.length > 0) {
      const [pid, score] = ordered[0];
      const winner = (state.game.players || []).find((x) => x.id === pid);
      const banner = document.createElement("div");
      banner.className = "winner-banner";
      const title = document.createElement("div");
      title.className = "winner-title";
      title.textContent = "🏆 Winner";
      const name = document.createElement("div");
      name.className = "winner-name";
      name.textContent = winner && winner.name ? winner.name : "Winner";
      banner.appendChild(title);
      banner.appendChild(name);
      wrap.appendChild(banner);
      if (!state._confettiShown) {
        state._confettiShown = true;
        launchConfetti();
      }
    }
    ordered.forEach(([pid, score], idx) => {
      const p = (state.game.players || []).find((x) => x.id === pid);
      const card = document.createElement("div");
      card.className = "rank-card" + (idx === 0 ? " winner" : "");
      card.textContent = idx + 1 + ". " + (p ? p.name : pid) + " — " + score;
      wrap.appendChild(card);
    });
    $("focusContent").appendChild(wrap);
    renderDock("Play Again", true);
    if (secondary) {
      secondary.textContent = "New Game";
      secondary.disabled = false;
      secondary.style.display = "block";
    }
    return;
  }
}
function renderInsight() {
  const strip = $("insightStrip");
  strip.classList.toggle("insight-expanded", state.insightExpanded);
  strip.classList.toggle("insight-collapsed", !state.insightExpanded);
  ["tabPlayers", "tabScores", "tabRounds"].forEach((id) =>
    $(id).classList.add("hidden")
  );
  ["tabPlayers", "tabScores", "tabRounds", "tabRules"].forEach((id) => {
    const el = $(id);
    if (el) el.classList.add("hidden");
  });
  if (state.currentTab === "players") {
    const el = $("tabPlayers");
    el.classList.remove("hidden");
    el.innerHTML = "";
    (state.game && state.game.players ? state.game.players : [])
      .slice(0, 6)
      .forEach((p) => {
        const row = document.createElement("div");
        row.className = "list-card list-row";
        const avatar = document.createElement("div");
        avatar.className = "avatar";
        avatar.textContent = (p.name || "?").slice(0, 1).toUpperCase();
        const name = document.createElement("div");
        name.textContent = p.name;
        row.appendChild(avatar);
        row.appendChild(name);
        el.appendChild(row);
      });
  } else if (state.currentTab === "scores") {
    const el = $("tabScores");
    el.classList.remove("hidden");
    el.innerHTML = "";
    (state.game && state.game.players ? state.game.players : [])
      .slice(0, 6)
      .forEach((p) => {
        const r = document.createElement("div");
        r.className =
          "list-card rounded-lg border border-slate-700 bg-slate-800 p-3 text-slate-100";
        r.textContent = p.name + ": " + ((state.game.scores || {})[p.id] || 0);
        el.appendChild(r);
      });
  } else if (state.currentTab === "rounds") {
    const el = $("tabRounds");
    el.classList.remove("hidden");
    el.innerHTML = "";
    const items = (
      state.game && state.game.history ? state.game.history : []
    ).slice(-6);
    items.forEach((h) => {
      const item = document.createElement("div");
      item.className = "accordion-item";
      const header = document.createElement("button");
      header.className = "accordion-header list-card";
      const open = !!state.roundsOpen[h.round];
      const best =
        (h.players || []).reduce((acc, pl) => {
          if (!acc || (pl.delta || 0) > (acc.delta || 0)) return pl;
          return acc;
        }, null) || null;
      const chevron = open ? "▾" : "▸";
      const subtitle =
        best && best.name
          ? " — Best: " +
            best.name +
            " (" +
            (best.delta >= 0 ? "+" : "") +
            best.delta +
            ")"
          : "";
      header.textContent = chevron + " " + "Round " + h.round + subtitle;
      const content = document.createElement("div");
      content.className = "accordion-content";
      content.classList.toggle("hidden", !open);
      (h.players || []).forEach((pl) => {
        const row = document.createElement("div");
        row.className = "list-card";
        row.textContent =
          pl.name +
          ": est " +
          (pl.estimate || 0) +
          " • score " +
          (pl.delta || 0) +
          " • wins " +
          (pl.wins || 0);
        content.appendChild(row);
      });
      header.onclick = () => {
        state.roundsOpen[h.round] = !state.roundsOpen[h.round];
        renderInsight();
      };
      item.appendChild(header);
      item.appendChild(content);
      el.appendChild(item);
    });
  } else if (state.currentTab === "rules") {
    const el = $("tabRules");
    el.classList.remove("hidden");
    el.innerHTML = "";

    const add = (t) => {
      const r = document.createElement("div");
      r.className = "list-card";
      r.innerHTML = t.replace(/\n/g, "<br>");
      el.appendChild(r);
    };

    add(`
1. OVERVIEW
Spades is a multiplayer, individual-scoring card game for 2 to 6 players.
Each player competes independently. There are no teams, no Nil bonuses, and no carry-over penalties.
The objective is to score the highest total points by accurately estimating the number of tricks won in each round.
---------------------------------
2. PLAYERS AND DECK
Players: 2 to 6
Deck: Standard 52-card deck
Trump Suit: Spades
Card rank from highest to lowest: Ace, King, Queen, Jack, 10, 9, 8, 7, 6, 5, 4, 3, 2
---------------------------------
3. NUMBER OF ROUNDS
Total rounds = floor(52 ÷ number of players)
Examples:
3 players → 17 rounds
4 players → 13 rounds
6 players → 8 rounds
---------------------------------
4. PLAYER ORDER AND DIRECTION
Players are seated in a fixed order for the entire game.
All actions proceed in anti-clockwise direction.
Player order never changes.
---------------------------------
5. DEALER AND STARTING PLAYER
The host is the dealer for Round 1.
The dealer rotates anti-clockwise at the start of each new round.
The player immediately after the dealer:
- Receives the first card
- Submits the first estimate
- Leads the first trick
---------------------------------
6. DEALING CARDS
In Round N, each player receives N cards.
Cards are dealt:
- One card at a time
- In anti-clockwise order
- Starting with the player next to the dealer
Example for 3 players (A, B, C):
Round 1:
Dealer: A
Dealing order: B → C → A
Round 2:
Dealer: B
Dealing order: C → A → B
Round 3:
Dealer: C
Dealing order: A → B → C
---------------------------------
7. ESTIMATION (BIDDING)
After cards are dealt, players submit their estimate of tricks they expect to win.
Estimates:
- Are submitted one at a time
- Follow the same anti-clockwise order as dealing
- Must be between 0 and the round number (inclusive)
- Cannot be changed once submitted
An estimate of 0 has no special bonus or penalty.
---------------------------------
8. PLAYING TRICKS
The player who received the first card leads the first trick.
For subsequent tricks:
- The winner of the previous trick leads
When playing a card:
- Players must follow the suit led, if possible
- If unable to follow suit, a player may:
  - Play a spade (trump), or
  - Play any other card
Spades may not be led until:
- A spade has been played to trump another suit, or
- A player has only spades remaining
---------------------------------
9. WINNING A TRICK
The highest card of the suit led wins the trick.
If any spades are played, the highest spade wins.
The winner:
- Collects the trick
- Leads the next trick
---------------------------------
10. SCORING
Let:
E = Estimated tricks
W = Tricks won
If W ≥ E:
Score = (E × 10) + (W − E)
If W < E:
Score = −(E × 10) + W
If E = 0:
Score = W
Notes:
- Overtricks are rewarded
- Undertricks are penalized
- No Nil bonuses
- No bags or carry-over penalties
---------------------------------
11. END OF ROUND
After scoring:
- Round scores are added to total scores
- Trick counts and round state are reset
- Dealer rotates anti-clockwise for the next round
---------------------------------
12. END OF GAME
The game ends after the final round.
The player with the highest total score wins.
Tie-breakers (in order):
1. Most total tricks won
2. Fewest failed estimates
3. Optional sudden-death playoff round
`);
  }

  ["tabBtnPlayers", "tabBtnScores", "tabBtnRounds"].forEach((id) =>
    $(id).classList.remove("active")
  );
  if (state.currentTab === "players")
    $("tabBtnPlayers").classList.add("active");
  if (state.currentTab === "scores") $("tabBtnScores").classList.add("active");
  if (state.currentTab === "rounds") $("tabBtnRounds").classList.add("active");
  if (state.currentTab === "rules") $("tabBtnRules").classList.add("active");
}
function setStatus(msg) {
  const el = $("inlineStatus");
  if (!el) return;
  el.textContent = msg || "";
}
function ensureAudio() {
  if (!state.audioCtx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    state.audioCtx = new C();
  }
  if (state.audioCtx && state.audioCtx.state !== "running") {
    state.audioCtx.resume().catch(() => {});
  }
}
function beep(freq, durationMs, volume) {
  ensureAudio();
  const ctx = state.audioCtx;
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  gain.gain.value = 0;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
  osc.stop(t0 + durationMs / 1000 + 0.02);
}
function playDealTick(i) {
  const f = 900 + (i % 3) * 60;
  beep(f, 90, 0.08);
}
function playCardPlay() {
  beep(320, 120, 0.12);
}
function playTrickWin() {
  beep(660, 160, 0.14);
  setTimeout(() => beep(880, 160, 0.12), 140);
}
function playGameWin() {
  beep(440, 180, 0.12);
  setTimeout(() => beep(660, 180, 0.12), 170);
  setTimeout(() => beep(880, 220, 0.12), 360);
}
function showToast(message, kind = "info") {
  const host = $("toasts");
  if (!host) return;
  const el = document.createElement("div");
  el.className =
    "toast" +
    (kind === "error" ? " error" : kind === "success" ? " success" : "");
  el.textContent = message || "";
  host.appendChild(el);
  requestAnimationFrame(() => {
    el.classList.add("show");
  });
  setTimeout(() => {
    el.classList.add("hide");
    setTimeout(() => {
      if (el.parentNode === host) host.removeChild(el);
    }, 200);
  }, 1800);
}
function showInline(message) {
  const b = $("inlineBanner");
  if (!b) return;
  b.textContent = message || "";
  b.style.display = "block";
  clearTimeout(state._inlineTimer);
  state._inlineTimer = setTimeout(() => {
    b.style.display = "none";
    b.textContent = "";
  }, 2000);
}
function startCountdown(seconds, prefix) {
  const b = $("inlineBanner");
  if (!b) return;
  try {
    clearInterval(state._countdownTimer);
  } catch {}
  const total = Math.max(0, Math.floor(seconds));
  state._countdownTicks = total * 10;
  state.trickPauseUntil = Date.now() + total * 1000;
  b.style.display = "block";
  const update = () => {
    const now = Date.now();
    const remainingMs = Math.max(0, (state.trickPauseUntil || 0) - now);
    const remaining = Math.ceil(remainingMs / 1000);
    b.textContent = (prefix ? prefix + " • " : "") + String(remaining) + "s";
    if (remainingMs <= 0) {
      clearInterval(state._countdownTimer);
      state._countdownTimer = null;
      state.trickPauseUntil = 0;
      setTimeout(() => {
        b.style.display = "none";
        b.textContent = "";
        renderAll();
      }, 200);
    }
  };
  update();
  state._countdownTimer = setInterval(update, 200);
}
function startPauseCountdown(seconds, prefix) {
  const b = $("inlineBanner");
  if (!b) return;
  try {
    clearInterval(state._countdownTimer);
  } catch {}
  const total = Math.max(0, Math.floor(seconds));
  state._countdownTicks = total * 10;
  state.trickPauseUntil = Date.now() + total * 1000;
  b.style.display = "block";
  const update = () => {
    const now = Date.now();
    const remainingMs = Math.max(0, (state.trickPauseUntil || 0) - now);
    const remaining = Math.ceil(remainingMs / 1000);
    b.textContent =
      (prefix ? prefix + " • " : "") +
      "Game ends in " +
      String(remaining) +
      "s";
    if (remainingMs <= 0) {
      clearInterval(state._countdownTimer);
      state._countdownTimer = null;
      state.trickPauseUntil = 0;
      setTimeout(() => {
        b.style.display = "none";
        b.textContent = "";
        renderAll();
      }, 200);
    }
  };
  update();
  state._countdownTimer = setInterval(update, 200);
}
function startRoundCountdown(seconds, prefix) {
  const b = $("inlineBanner");
  if (!b) return;
  try {
    clearInterval(state._countdownTimer);
  } catch {}
  const total = Math.max(0, Math.floor(seconds));
  state._countdownTicks = total * 10;
  state.trickPauseUntil = Date.now() + total * 1000;
  b.style.display = "block";
  const update = () => {
    const now = Date.now();
    const remainingMs = Math.max(0, (state.trickPauseUntil || 0) - now);
    const remaining = Math.ceil(remainingMs / 1000);
    b.textContent =
      (prefix ? prefix + " • " : "") +
      "Next round in " +
      String(remaining) +
      "s";
    if (remainingMs <= 0) {
      clearInterval(state._countdownTimer);
      state._countdownTimer = null;
      state.trickPauseUntil = 0;
      setTimeout(() => {
        b.style.display = "none";
        b.textContent = "";
        renderAll();
      }, 200);
    }
  };
  update();
  state._countdownTimer = setInterval(update, 200);
}
function runDealToHand() {
  const host = document.querySelector(".card-surface");
  const hand = document.querySelector(".estimate-view .hand-row");
  if (!host || !hand) return;
  const cards = Array.from(hand.querySelectorAll(".card-item"));
  if (cards.length === 0) return;
  const layer = document.createElement("div");
  layer.className = "deal-layer";
  host.appendChild(layer);
  const hostRect = host.getBoundingClientRect();
  const W = hostRect.width;
  const H = hostRect.height;
  const cardW = 60;
  const cardH = 90;
  const deckX = Math.floor(W / 2 - cardW / 2);
  const deckY = Math.floor(H * 0.2 - cardH / 2);
  cards.forEach((c) => c.classList.add("hidden"));
  const stepDelay = 140;
  cards.forEach((c, i) => {
    const r = c.getBoundingClientRect();
    const tx = r.left - hostRect.left;
    const ty = r.top - hostRect.top;
    const el = document.createElement("div");
    el.className = "deal-card";
    el.style.left = deckX + "px";
    el.style.top = deckY + "px";
    el.style.transform = "translateY(0px) rotate(0deg) scale(0.96)";
    layer.appendChild(el);
    const delay = i * stepDelay;
    setTimeout(() => {
      el.style.left = tx + "px";
      el.style.top = ty + "px";
      el.style.transform = "translateY(0px) rotate(0deg) scale(1)";
      el.style.opacity = "1";
      playDealTick(i);
      setTimeout(() => {
        c.classList.remove("hidden");
        el.style.opacity = "0";
        setTimeout(() => {
          if (el.parentNode === layer) layer.removeChild(el);
          if (i === cards.length - 1) {
            if (layer && layer.parentNode === host) host.removeChild(layer);
            state.dealing = false;
          }
        }, 220);
      }, 420);
    }, delay);
  });
}
function launchConfetti() {
  const host = document.querySelector(".card-surface");
  if (!host) return;
  let layer = document.getElementById("confettiLayer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "confettiLayer";
    layer.className = "confetti-layer";
    host.appendChild(layer);
  }
  layer.innerHTML = "";
  const colors = ["#4ba3ff", "#7dd3fc", "#ef6b6b", "#f6c85f", "#4bd47a"];
  const count = 60;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "confetti-piece";
    const left = Math.random() * 100;
    const delay = Math.random() * 0.4;
    const dur = 2.6 + Math.random() * 0.8;
    const rot = Math.floor(Math.random() * 360);
    const color = colors[i % colors.length];
    el.style.left = left + "%";
    el.style.background = color;
    el.style.animationDuration = dur + "s";
    el.style.animationDelay = delay + "s";
    el.style.transform = "translateY(-10%) rotate(" + rot + "deg)";
    layer.appendChild(el);
  }
  clearTimeout(state._confettiTimer);
  state._confettiTimer = setTimeout(() => {
    if (layer && layer.parentNode === host) host.removeChild(layer);
  }, 3500);
}
function renderDock(label, enabled) {
  const btn = $("primaryAction");
  btn.textContent = label;
  btn.disabled = !enabled;
  const info = $("dockInfo");
  if (!info) return;
  if (!state.game) {
    info.textContent = "";
    return;
  }
  const estimates = state.game.estimates || {};
  const tokens = (state.game.players || []).map((p) => {
    const v =
      typeof estimates[p.id] === "number" ? String(estimates[p.id]) : "—";
    return p.name + " " + v;
  });
  let prev = "";
  const hist = state.game.history || [];
  if (hist.length > 0) {
    const last = hist[hist.length - 1];
    let best = null;
    (last.players || []).forEach((pl) => {
      if (best === null || (pl.delta || 0) > (best.delta || 0)) best = pl;
    });
    if (best && best.name) prev = "Prev: " + best.name;
  }
  info.textContent = (prev ? prev + " • " : "") + tokens.join(" • ");
}
function renderAll() {
  renderContext();
  renderFocus();
  renderInsight();
  renderOverlays();
}
function bindUI() {
  $("sessionId").onclick = () => {
    if (!state.game || !state.game.code) return;
    navigator.clipboard.writeText(state.game.code).catch(() => {});
  };
  $("sessionCopyBtn").onclick = () => {
    if (!state.game || !state.game.code) return;
    navigator.clipboard
      .writeText(state.game.code)
      .then(() => {
        setStatus("Session ID copied");
        showToast("Session ID copied", "success");
        setTimeout(() => setStatus(""), 1200);
      })
      .catch(() => {});
  };
  $("infoBtn").onclick = () => {
    state.insightExpanded = !state.insightExpanded;
    renderInsight();
  };
  $("exitBtn").onclick = () => {
    try {
      state.socket.emit("leave_game");
    } catch {}
    try {
      localStorage.removeItem("gameCode");
    } catch {}
    state.game = null;
    state._confettiShown = false;
    setStatus("");
    showToast("Exited game", "info");
    renderAll();
  };
  $("stripHandle").onclick = () => {
    state.insightExpanded = !state.insightExpanded;
    renderInsight();
  };
  $("tabBtnPlayers").onclick = () => {
    state.currentTab = "players";
    renderInsight();
  };
  $("tabBtnScores").onclick = () => {
    state.currentTab = "scores";
    renderInsight();
  };
  $("tabBtnRounds").onclick = () => {
    state.currentTab = "rounds";
    renderInsight();
  };
  $("tabBtnRules").onclick = () => {
    state.currentTab = "rules";
    renderInsight();
  };
  $("primaryAction").onclick = () => {
    if (!state.game) {
      const nameEl = $("inputName");
      const codeEl = $("inputCode");
      const name = nameEl ? nameEl.value.trim() : "";
      const code = codeEl ? codeEl.value.trim() : "";
      if (!name) {
        setStatus("Name is required");
        return;
      }
      try {
        localStorage.setItem("playerName", name);
      } catch {}
      if (code) {
        try {
          localStorage.setItem("gameCode", code);
        } catch {}
        state.socket.emit("join_game", { game_code: code, player_name: name });
      } else {
        state.socket.emit("create_game", { player_name: name });
      }
      return;
    }
    const phase = state.game.phase;
    if (phase === "lobby" || phase === "deal") {
      if (state.me === state.game.host_id) state.socket.emit("start_round");
      return;
    }
    if (phase === "estimate") {
      const max = state.game.current_round || 0;
      const v = Math.max(0, Math.min(max, state.estimator));
      state.socket.emit("submit_estimate", { value: v });
      return;
    }
    if (phase === "play") {
      if (state.selectedCard)
        state.socket.emit("play_card", { card: state.selectedCard });
      return;
    }
    if (phase === "finished") {
      state.socket.emit("play_again");
    }
  };
  $("secondaryAction").onclick = () => {
    // Return to player creation lobby
    state.game = null;
    state._confettiShown = false;
    renderAll();
  };
}
function renderOverlays() {
  const estHost = $("overlayEstimates");
  const scHost = $("overlayScores");
  if (!estHost || !scHost) return;
  estHost.innerHTML = "";
  scHost.innerHTML = "";
  if (!state.game || state.game.phase === "lobby") {
    estHost.style.display = "none";
    scHost.style.display = "none";
    return;
  }
  estHost.style.display = "block";
  scHost.style.display = "block";
  const estimates = state.game.estimates || {};
  const scores = state.game.scores || {};
  const players = (state.game.players || []).slice(0, 6);
  const title1 = document.createElement("div");
  title1.className = "overlay-title";
  title1.textContent = "Estimates";
  estHost.appendChild(title1);
  const table1 = document.createElement("div");
  table1.className = "mini-table";
  players.forEach((p) => {
    const row = document.createElement("div");
    row.className = "mini-row";
    const c1 = document.createElement("div");
    c1.className = "mini-cell";
    c1.textContent = p.name;
    const c2 = document.createElement("div");
    c2.className = "mini-cell";
    const v =
      typeof estimates[p.id] === "number" ? String(estimates[p.id]) : "—";
    c2.textContent = v;
    row.appendChild(c1);
    row.appendChild(c2);
    table1.appendChild(row);
  });
  estHost.appendChild(table1);
  const title2 = document.createElement("div");
  title2.className = "overlay-title";
  title2.textContent = "Scores";
  scHost.appendChild(title2);
  const table2 = document.createElement("div");
  table2.className = "mini-table";
  players.forEach((p) => {
    const c1 = document.createElement("div");
    c1.className = "mini-cell";
    c1.textContent = p.name;
    const c2 = document.createElement("div");
    c2.className = "mini-cell";
    const v = typeof scores[p.id] === "number" ? String(scores[p.id]) : "0";
    c2.textContent = v;
    table2.appendChild(c1);
    table2.appendChild(c2);
  });
  scHost.appendChild(table2);
}
function bindPhaseControls() {
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t || !state.game) return;
    if (t.id === "btnMinus") {
      const max = state.game.current_round || 0;
      state.estimator = Math.max(0, Math.min(max, state.estimator - 1));
      const val = $("estValue");
      if (val) val.textContent = String(state.estimator);
    }
    if (t.id === "btnPlus") {
      const max = state.game.current_round || 0;
      state.estimator = Math.max(0, Math.min(max, state.estimator + 1));
      const val = $("estValue");
      if (val) val.textContent = String(state.estimator);
    }
  });
}
function onGameUpdate(payload) {
  const prevGame = state.game;
  const prevTrick = prevGame && prevGame.trick ? prevGame.trick.slice() : [];
  state.game = payload;
  try {
    if (state.game && state.game.code) {
      localStorage.setItem("gameCode", state.game.code);
    }
  } catch {}
  if (state.game && state.game.phase !== "estimate") state.estimator = 0;
  if (state.game && state.game.phase !== "play") state.selectedCard = null;
  const prev = state.prevTrickLen || 0;
  const cur =
    (state.game && state.game.trick ? state.game.trick.length : 0) || 0;
  if (cur > prev) playCardPlay();
  if (prev > 0 && cur === 0) {
    state.lastCompletedTrick = prevTrick;
  }
  state.prevTrickLen = cur;
  if (
    state.game &&
    state.game.phase === "deal" &&
    (state.game.players || []).length >= 2 &&
    state.me === state.game.host_id &&
    (state.autoStartedRound || 0) !== state.game.current_round &&
    state.game.current_round > 1
  ) {
    state.autoStartedRound = state.game.current_round;
    state.socket.emit("start_round");
  }
  renderAll();
}
function boot() {
  state.socket = io();
  bindUI();
  bindPhaseControls();
  document.addEventListener("click", ensureAudio, { once: true });
  function attemptResume() {
    try {
      const name = localStorage.getItem("playerName");
      const code = localStorage.getItem("gameCode");
      if (name && code) {
        state.socket.emit("resume_session", {
          player_name: name,
          game_code: code,
        });
      }
    } catch {}
  }
  state.socket.on("connect", () => {
    attemptResume();
  });
  state.socket.on("disconnect", () => {
    setStatus("Disconnected");
  });
  state.socket.on("connected", (d) => {
    state.me = d.sid;
    attemptResume();
  });
  state.socket.on("game_state_update", onGameUpdate);
  state.socket.on("error", (msg) => {
    const m = msg && msg.message ? msg.message : "";
    setStatus(m);
    if (m) showToast(m, "error");
  });
  state.socket.on("start_round", () => {
    setStatus("");
    state.dealing = true;
  });
  state.socket.on("end_trick", (d) => {
    try {
      if (d && d.trick && Array.isArray(d.trick)) {
        state.lastCompletedTrick = d.trick.map((t) => ({
          player_id: t.player_id,
          card: { s: t.card.s, r: t.card.r },
        }));
      }
      const idx =
        d && typeof d.winner_index === "number" ? d.winner_index : null;
      const p =
        idx !== null && state.game && state.game.players
          ? state.game.players[idx]
          : null;
      const name = p && p.name ? p.name : "Unknown";
      startCountdown(3, "Trick winner: " + name);
      playTrickWin();
    } catch {
      startCountdown(3, "Trick ended");
      playTrickWin();
    }
  });
  state.socket.on("end_round", (d) => {
    try {
      clearInterval(state._countdownTimer);
      state._countdownTimer = null;
      state.trickPauseUntil = 0;
    } catch {}
    startRoundCountdown(3, "Round ended");
  });
  state.socket.on("game_paused", (d) => {
    const name = d && d.name ? d.name : "Player";
    const secs = d && typeof d.seconds === "number" ? d.seconds : 30;
    startPauseCountdown(secs, name + " disconnected");
  });
  state.socket.on("game_resumed", () => {
    try {
      clearInterval(state._countdownTimer);
      state._countdownTimer = null;
      state.trickPauseUntil = 0;
      const b = $("inlineBanner");
      if (b) {
        b.style.display = "none";
        b.textContent = "";
      }
    } catch {}
    showToast("Game resumed", "success");
    renderAll();
  });
  state.socket.on("game_over", (d) => {
    try {
      clearInterval(state._countdownTimer);
      state._countdownTimer = null;
      state.trickPauseUntil = 0;
      const b = $("inlineBanner");
      if (b) {
        b.style.display = "none";
        b.textContent = "";
      }
    } catch {}
    if (state.game) {
      state.game.phase = "finished";
      if (d && d.scores) {
        state.game.scores = d.scores;
      }
    }
    const winnerId = d && d.winner_id ? d.winner_id : null;
    let winnerName = "";
    if (winnerId && state.game && state.game.players) {
      const p = state.game.players.find((x) => x.id === winnerId);
      winnerName = p && p.name ? p.name : "";
    }
    showToast(
      winnerName ? "Game over • Winner: " + winnerName : "Game over",
      "info"
    );
    playGameWin();
    renderAll();
  });
  renderAll();
}
function isGameInProgress() {
  const p = state.game ? state.game.phase : "lobby";
  return p !== "lobby" && p !== "finished";
}
window.addEventListener("beforeunload", (e) => {
  if (isGameInProgress()) {
    e.preventDefault();
    e.returnValue = "Leave the game?";
    return "Leave the game?";
  }
});
boot();
