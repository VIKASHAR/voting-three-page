const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ── In-memory vote state ──────────────────────────────────────────────────────
let state = { A: 0, B: 0, C: 0, closed: false, launched: false, launchUrl: "" };

// Track voted session IDs to prevent double-voting
const votedSessions = new Set();

// ── Broadcast to all connected clients ───────────────────────────────────────
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}

// ── WebSocket message handler ─────────────────────────────────────────────────
wss.on("connection", (ws) => {
  // Send current state to new client immediately
  ws.send(JSON.stringify({ type: "state", state }));

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case "vote": {
        if (state.closed) return ws.send(JSON.stringify({ type: "error", reason: "closed" }));
        const { scenario, sessionId } = msg;
        if (!["A", "B", "C"].includes(scenario)) return;
        if (sessionId && votedSessions.has(sessionId)) {
          return ws.send(JSON.stringify({ type: "error", reason: "already_voted" }));
        }
        if (sessionId) votedSessions.add(sessionId);
        state[scenario]++;
        broadcast({ type: "state", state });
        break;
      }
      case "close": {
        state.closed = true;
        broadcast({ type: "state", state });
        break;
      }
      case "reset": {
        state = { A: 0, B: 0, C: 0, closed: false, launched: false, launchUrl: "" };
        votedSessions.clear();
        broadcast({ type: "state", state });
        break;
      }
      case "launch": {
        state.launched = true;
        state.launchUrl = msg.url || "";
        broadcast({ type: "state", state });
        break;
      }
    }
  });
});

// ── Serve static files ────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/vote",    (req, res) => res.sendFile(path.join(__dirname, "public", "vote.html")));
app.get("/admin",   (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/display", (req, res) => res.sendFile(path.join(__dirname, "public", "display.html")));
app.get("/",        (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
