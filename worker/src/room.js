// A game room — one Cloudflare Durable Object per live game.
//
// Every phone in a game holds a WebSocket open to the same room, so the room
// can tell them all the same thing at the same moment: here is question 4,
// time is up, here is the scoreboard. The rules are in game.js; this file
// is only plumbing.
//
// Two free-plan choices shape it:
//
//   - WebSocket hibernation. A room with no message to handle is taken out
//     of memory while the sockets stay open, so a lobby waiting for friends
//     costs nothing. The price is that memory cannot be trusted between
//     messages: the game is written to storage after every change and read
//     back on waking, and each socket carries its player id with it.
//   - Alarms, not timers. "Time is up" is an alarm set for the deadline,
//     which wakes the room even when every phone is quiet.
//
// Written as a plain class rather than by extending DurableObject from
// "cloudflare:workers", so the rest of the Worker still loads in Node for
// the tests.

import { displayName, usernameOf } from "../../src/lib/scorecard.js";
import * as G from "./game.js";
import { verifyInitData } from "./telegram.js";

/** A new round carries up to thirty questions; nothing else comes close. */
const MAX_MESSAGE = 64 * 1024;

export function randomToken(bytes = 16) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.game = undefined; // undefined: not read yet; null: no game here
    // Phones send "ping" now and then so a quiet mobile network does not
    // drop the connection. Cloudflare answers it without waking the room.
    if (typeof WebSocketRequestResponsePair === "function") {
      state.setWebSocketAutoResponse?.(new WebSocketRequestResponsePair("ping", "pong"));
    }
  }

  async load() {
    if (this.game === undefined) this.game = (await this.state.storage.get("game")) ?? null;
    return this.game;
  }

  /** Write the game back and set the alarm for its next deadline — or clear everything once it closes. */
  async persist() {
    const game = this.game;
    if (!game || game.phase === "closed") {
      await this.state.storage.deleteAlarm();
      await this.state.storage.deleteAll();
      this.game = null;
      return;
    }
    await this.state.storage.put("game", game);
    const wake = G.nextWake(game);
    if (wake) await this.state.storage.setAlarm(wake);
  }

  async fetch(request) {
    const url = new URL(request.url);

    // A new game in this room. Refused while another is still running in
    // it, which is how the Worker finds a free code.
    if (url.pathname === "/init" && request.method === "POST") {
      const now = Date.now();
      const game = await this.load();
      if (game) {
        G.tick(game, now); // an abandoned game past its idle time closes here
        if (game.phase !== "closed") return new Response("busy", { status: 409 });
      }
      const { code, settings, questions } = await request.json();
      const creatorToken = randomToken();
      this.game = G.newGame({ code, settings, questions, creatorToken, now });
      await this.persist();
      return Response.json({ creatorToken });
    }

    if (request.headers.get("Upgrade") === "websocket") {
      const [client, server] = Object.values(new WebSocketPair());
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("not found", { status: 404 });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > MAX_MESSAGE) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const now = Date.now();

    const game = await this.load();
    // The alarm may be a moment late; an answer must not slip in after the
    // deadline because of it. If the clock moves the game on here, that is
    // saved and sent whatever becomes of the message itself.
    const ticked = game ? G.tick(game, now) : false;
    const settle = async (changed) => {
      if (!changed && !ticked) return;
      await this.persist();
      this.broadcast(now);
    };

    if (msg?.type === "join") {
      if (!game || game.phase === "closed") {
        this.refuse(ws, "missing");
        return settle(false);
      }
      const who = await this.identify(msg);
      const res = G.join(game, { clientId: msg.clientId, ...who, creatorToken: msg.creatorToken, lang: msg.lang }, now);
      if (res.error) {
        this.refuse(ws, res.error);
        return settle(false);
      }
      ws.serializeAttachment({ pid: res.pid });
      return settle(true);
    }

    const pid = ws.deserializeAttachment()?.pid;
    if (!pid || !game) return settle(false);

    let res;
    if (msg.type === "start") res = G.start(game, pid, now);
    else if (msg.type === "answer") res = G.answer(game, pid, msg, now);
    else if (msg.type === "again") res = G.newRound(game, pid, msg.questions, now);
    else if (msg.type === "leave") {
      res = G.leave(game, pid, now);
      ws.serializeAttachment({});
      try { ws.close(1000, "left"); } catch { /* already closing */ }
    } else return settle(false);

    if (res?.error) this.send(ws, { type: "notice", reason: res.error });
    return settle(!res?.error);
  }

  async webSocketClose(ws) {
    await this.dropped(ws);
    try { ws.close(1000, "bye"); } catch { /* already closed */ }
  }

  async webSocketError(ws) {
    await this.dropped(ws);
  }

  /** A phone's connection went. Unless it has another one open, it is away. */
  async dropped(ws) {
    const pid = ws.deserializeAttachment()?.pid;
    if (!pid) return;
    const game = await this.load();
    if (!game?.players[pid]) return;
    const another = this.state.getWebSockets().some((o) => o !== ws && o.deserializeAttachment()?.pid === pid);
    if (another) return;
    const now = Date.now();
    G.disconnect(game, pid, now);
    await this.persist();
    this.broadcast(now);
  }

  async alarm() {
    const game = await this.load();
    if (!game) return;
    const now = Date.now();
    const changed = G.tick(game, now);
    if (game.phase === "closed") {
      for (const ws of this.state.getWebSockets()) this.refuse(ws, "closed");
    }
    await this.persist();
    if (changed && this.game) this.broadcast(now);
  }

  /** The name to show. Signed by Telegram when there is launch data; typed by the player on the web. */
  async identify(msg) {
    if (msg.initData && this.env.BOT_TOKEN) {
      const auth = await verifyInitData(msg.initData, this.env.BOT_TOKEN);
      if (auth) return { name: displayName(auth.user), username: usernameOf(auth.user) };
    }
    return { name: displayName({ first_name: typeof msg.nickname === "string" ? msg.nickname : "" }), username: null };
  }

  broadcast(now) {
    const game = this.game;
    if (!game) return;
    for (const ws of this.state.getWebSockets()) {
      const pid = ws.deserializeAttachment()?.pid;
      if (pid && game.players[pid]) this.send(ws, G.view(game, pid, now));
    }
  }

  send(ws, body) {
    try { ws.send(JSON.stringify(body)); } catch { /* the socket is closing */ }
  }

  refuse(ws, reason) {
    this.send(ws, { type: "error", reason });
    ws.serializeAttachment({});
    try { ws.close(4000, reason); } catch { /* already closed */ }
  }
}
