const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const path = require("path");
const os = require("os");
const QRCode = require("qrcode");
const fs = require("fs").promises;

const app = express();

/* =====================================================
   CORS + PREFLIGHT FIX
   ===================================================== */
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

/* =====================================================
   BASIC MIDDLEWARE
   ===================================================== */
app.use(express.json({ limit: "200kb" }));
app.use(cors());

// Serve static files from this directory
app.use("/static", express.static(path.join(__dirname, "static")));

const server = http.createServer(app);

/* =====================================================
   WEBSOCKET — Interface clients
   ===================================================== */
const wss = new WebSocket.Server({ server });

// Store all connected clients with player info
let interfaceClients = new Map(); // ws -> { playerName, connectedAt }
let unrealClients = new Set();

// JSON message log (store last 100 messages)
const jsonMessages = [];
const MAX_MESSAGES = 100;

function logJsonMessage(message) {
  jsonMessages.push(message);
  if (jsonMessages.length > MAX_MESSAGES) {
    jsonMessages.shift();
  }
  // Broadcast to all interface clients
  broadcastToInterfaceClients({
    type: "json_message",
    data: message
  });
}

function broadcastToInterfaceClients(data) {
  const message = JSON.stringify(data);
  interfaceClients.forEach((clientInfo, client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (err) {
        console.error("Error sending to interface client:", err);
      }
    }
  });
}

// Heartbeat (prevents silent disconnect freeze)
function heartbeat() {
  this.isAlive = true;
}

wss.on("connection", (ws, req) => {
  ws.isAlive = true;
  ws.on("pong", heartbeat);

  // Determine client type from URL
  const url = new URL(req.url, `http://${req.headers.host}`);
  const role = (url.searchParams.get("role") || "interface").toLowerCase();

  if (role === "unreal") {
    unrealClients.add(ws);
    console.log("Unreal Engine connected. Total:", unrealClients.size);
    
    ws.on("message", (msg) => {
      console.log("UE → Node:", msg.toString());
      // Log JSON message
      try {
        const data = JSON.parse(msg.toString());
        logJsonMessage({
          type: "unreal_message",
          data: data,
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        logJsonMessage({
          type: "unreal_message",
          data: msg.toString(),
          timestamp: new Date().toISOString()
        });
      }
    });

    ws.on("close", () => {
      unrealClients.delete(ws);
      console.log("Unreal disconnected. Total:", unrealClients.size);
    });

    ws.on("error", () => {
      unrealClients.delete(ws);
    });
  } else {
    // Interface client
    const clientInfo = {
      playerName: "Player",
      connectedAt: new Date().toISOString()
    };
    interfaceClients.set(ws, clientInfo);
    console.log(`Interface client connected: ${req.socket.remoteAddress || 'unknown'} (Total: ${interfaceClients.size})`);

    // Send initial state
    const initialState = {
      type: "state",
      data: {
        v: 1,
        surface: {
          cols: 4,
          rows: 6,
          theme: {
            bg: "#0a0a0d",
            fg: "#e8e8ee",
            muted: "#8d8d98",
            accent: "#b7c7ff",
            glow: 0.9,
            grain: 0.12,
          },
          tempo: 0.35,
        },
        modules: [
          { id: "A1", type: "trig", label: "∎", mode: "momentary", value: 0, locked: false },
          { id: "A2", type: "fader", label: "I", min: 0, max: 1, step: 0.01, value: 0.62, locked: false },
          { id: "A3", type: "dial", label: "↺", min: 0, max: 1, step: 0.02, value: 0.18, locked: false },
          { id: "A4", type: "meter", label: "⋯", value: 0.4 },
        ],
      }
    };
    ws.send(JSON.stringify(initialState));

    // Send all existing JSON messages
    if (jsonMessages.length > 0) {
      jsonMessages.forEach(msg => {
        ws.send(JSON.stringify({
          type: "json_message",
          data: msg
        }));
      });
    }

    ws.on("message", (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        const clientInfo = interfaceClients.get(ws) || { playerName: "Player" };
        
        // Handle different message types
        if (data.type === "wizard:push_state") {
          logJsonMessage({
            type: "wizard:push_state",
            state: data.state,
            timestamp: new Date().toISOString()
          });
          
          // Broadcast state to all interface clients
          broadcastToInterfaceClients({
            type: "state",
            data: data.state
          });
        } else if (data.type === "player:update_name") {
          // Update player name for this client
          const newName = (data.name || "Player").trim() || "Player";
          clientInfo.playerName = newName;
          interfaceClients.set(ws, clientInfo);
          console.log(`Player name updated: ${newName} (Total players: ${interfaceClients.size})`);
          
          logJsonMessage({
            type: "player:update_name",
            player: newName,
            timestamp: new Date().toISOString()
          });
        } else if (data.type === "player:button_press") {
          // Simplified button press message
          const playerName = data.player || clientInfo.playerName;
          const movement = data.movement || "unknown";

          console.log(`${playerName}: ${movement}`);

          logJsonMessage({
            type: "player:button_press",
            player: playerName,
            movement: movement,
            timestamp: new Date().toISOString()
          });
          
          // Broadcast to other interface clients
          broadcastToInterfaceClients({
            type: "player:button_press",
            data: {
              player: playerName,
              movement: movement
            }
          });
        } else if (data.type === "player:interaction") {
          // Legacy interaction message (still supported)
          const playerName = data.player || clientInfo.playerName;
          const controller = data.controller || "controller";
          const controllerId = data.controllerId || "unknown";
          const interaction = data.interaction || "unknown";
          const value = data.value;

          console.log(`[${playerName}] interacted with ${controller} (${controllerId}): ${interaction} = ${value}`);

          logJsonMessage({
            type: "player:interaction",
            player: playerName,
            controller: controller,
            controllerId: controllerId,
            interaction: interaction,
            value: value,
            timestamp: new Date().toISOString()
          });
          
          // Broadcast interaction to other interface clients
          broadcastToInterfaceClients({
            type: "player:interaction",
            data: {
              player: playerName,
              controller: controller,
              controllerId: controllerId,
              interaction: interaction,
              value: value
            }
          });
        } else if (data.type === "user:module_event") {
          // Legacy format - still supported but log with player info
          const mid = data.id;
          const value = data.value;
          const etype = data.etype;
          const payload = data.payload;
          const playerName = clientInfo.playerName;

          console.log(`[${playerName}] Button Interaction: id=${mid}, type=${etype}, value=${value}`);

          logJsonMessage({
            type: "user:module_event",
            player: playerName,
            id: mid,
            etype: etype,
            value: value,
            payload: payload,
            timestamp: new Date().toISOString()
          });
          
          // Broadcast event to other interface clients
          broadcastToInterfaceClients({
            type: "user:module_event",
            data: {
              id: mid,
              etype: etype,
              value: value,
              payload: payload
            }
          });
        }
      } catch (err) {
        console.error("Error parsing WebSocket message:", err);
      }
    });

    ws.on("close", () => {
      const clientInfo = interfaceClients.get(ws);
      if (clientInfo) {
        console.log(`Player "${clientInfo.playerName}" disconnected (Total: ${interfaceClients.size - 1})`);
      }
      interfaceClients.delete(ws);
      console.log(`Interface client disconnected (Total: ${interfaceClients.size})`);
    });

    ws.on("error", () => {
      interfaceClients.delete(ws);
    });
  }
});

/* =====================================================
   HEARTBEAT PING (ANTI-FREEZE)
   ===================================================== */
const interval = setInterval(() => {
  // Check interface clients
  interfaceClients.forEach((clientInfo, ws) => {
    if (ws.isAlive === false) {
      interfaceClients.delete(ws);
      try { ws.terminate(); } catch {}
      return;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  });
  
  // Check unreal clients
  unrealClients.forEach(ws => {
    if (ws.isAlive === false) {
      unrealClients.delete(ws);
      try { ws.terminate(); } catch {}
      return;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  });
}, 15000);

server.on("close", () => clearInterval(interval));

/* =====================================================
   UI → NODE → UNREAL (HTTP → WS)
   ===================================================== */
app.post("/send-command", (req, res) => {
  const { player, action, device } = req.body || {};

  if (!player || !action) {
    return res.status(400).json({
      ok: false,
      error: "Missing player or action"
    });
  }

  const msg = JSON.stringify({
    player: String(player),
    action: String(action),
    device: device ? String(device) : ""
  });

  // Log JSON message
  logJsonMessage({
    type: "send_command",
    player: player,
    action: action,
    device: device,
    timestamp: new Date().toISOString()
  });

  let sent = 0;
  for (const ws of unrealClients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(msg);
        sent++;
      } catch {}
    }
  }

  console.log(`UI → Node: ${msg} | forwarded: ${sent}`);

  if (sent === 0) {
    return res.status(503).json({
      ok: false,
      error: "No Unreal connected"
    });
  }

  res.json({ ok: true, forwarded: sent });
});

/* =====================================================
   API ENDPOINTS
   ===================================================== */
app.get("/api/json-messages", (req, res) => {
  res.json(jsonMessages);
});

/* =====================================================
   SERVE UI
   ===================================================== */
app.get("/", async (req, res) => {
  try {
    // Read the interface HTML template
    const htmlPath = path.join(__dirname, "templates", "interface_index.html");
    let html = await fs.readFile(htmlPath, "utf8");
    
    // Replace Socket.IO with WebSocket client code
    html = html.replace(
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/3.1.1/socket.io.js"></script>',
      '<script src="/static/websocket-client.js"></script>'
    );
    
    res.send(html);
  } catch (err) {
    console.error("Error serving interface:", err);
    res.status(500).send("Error loading interface");
  }
});

/* =====================================================
   START SERVER
   ===================================================== */
const PORT = 3001;
server.listen(PORT, "0.0.0.0", () => {
  // Get local IP
  const nets = os.networkInterfaces();
  let localIP;
  for (const iface of Object.values(nets)) {
    for (const cfg of iface) {
      if (cfg.family === "IPv4" && !cfg.internal) {
        localIP = cfg.address;
        break;
      }
    }
    if (localIP) break;
  }
  
  if (!localIP) localIP = "127.0.0.1";

  const localURL = `http://127.0.0.1:${PORT}`;
  const networkURL = `http://${localIP}:${PORT}`;

  // Print unified startup message
  console.log("\n" + "=".repeat(60));
  console.log("Node.js Interface Server Starting...");
  console.log("=".repeat(60));
  console.log(`Local access:    ${localURL}`);
  console.log(`Network access:  ${networkURL}`);
  console.log("=".repeat(60) + "\n");

  // Generate QR codes
  QRCode.toFile(path.join(__dirname, "access_qr_local.png"), localURL, (err) => {
    if (!err) {
      console.log(`QR code generated: access_qr_local.png (${localURL})`);
    }
  });
  
  QRCode.toFile(path.join(__dirname, "access_qr_network.png"), networkURL, (err) => {
    if (!err) {
      console.log(`QR code generated: access_qr_network.png (${networkURL})`);
    }
  });
});
