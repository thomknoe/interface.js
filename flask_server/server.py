from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit
import socket
import json
import logging
import sys
import os
import qrcode
from datetime import datetime
from collections import deque

# Disable all HTTP request logging
logging.getLogger('werkzeug').setLevel(logging.CRITICAL)
logging.getLogger('socketio').setLevel(logging.CRITICAL)
logging.getLogger('engineio').setLevel(logging.CRITICAL)
logging.getLogger('eventlet').setLevel(logging.CRITICAL)
logging.getLogger('eventlet.wsgi').setLevel(logging.CRITICAL)

# Suppress WSGI server messages by filtering stdout and stderr
class FilteredStream:
    def __init__(self, original_stream):
        self.original_stream = original_stream
        self.skip_patterns = [
            'wsgi starting up',
            'wsgi starting',
            'accepted (',
            'GET /socket.io',
            'POST /socket.io',
            'GET /static',
            'GET / HTTP',
            ' - - [',
            ') wsgi',
            ') accepted'
        ]
    
    def write(self, text):
        # Skip lines that match any of our patterns
        if text and not any(pattern in text for pattern in self.skip_patterns):
            self.original_stream.write(text)
    
    def flush(self):
        self.original_stream.flush()
    
    def __getattr__(self, name):
        return getattr(self.original_stream, name)

# Apply filtering to both stdout and stderr
sys.stdout = FilteredStream(sys.stdout)
sys.stderr = FilteredStream(sys.stderr)

app = Flask(__name__)
app.config["SECRET_KEY"] = "woz-dev"
socketio = SocketIO(app, cors_allowed_origins="*", max_http_buffer_size=20 * 1024 * 1024, logger=False, engineio_logger=False)

# JSON message log (store last 100 messages)
JSON_MESSAGES = deque(maxlen=100)

# Store player info per session (sid -> player name)
player_registry = {}

# --- Canonical schema: single global surface state ---
LATEST_STATE = {
    "v": 1,
    "surface": {
        "cols": 4,
        "rows": 6,
        "theme": {
            "bg": "#0a0a0d",
            "fg": "#e8e8ee",
            "muted": "#8d8d98",
            "accent": "#b7c7ff",  # single accent
            "glow": 0.9,         # 0..1
            "grain": 0.12,       # 0..1
        },
        "tempo": 0.35,  # 0..1 (affects indicator breathing)
    },
    "modules": [
        # id uses grid coordinates
        # type: "trig" | "fader" | "dial" | "meter"
        {"id": "A1", "type": "trig", "label": "∎", "mode": "momentary", "value": 0, "locked": False},
        {"id": "A2", "type": "fader", "label": "I", "min": 0, "max": 1, "step": 0.01, "value": 0.62, "locked": False},
        {"id": "A3", "type": "dial", "label": "↺", "min": 0, "max": 1, "step": 0.02, "value": 0.18, "locked": False},
        {"id": "A4", "type": "meter", "label": "⋯", "value": 0.4},

        {"id": "B1", "type": "trig", "label": "—", "mode": "toggle", "value": 1, "locked": False},
        {"id": "B2", "type": "meter", "label": "⌁", "value": 0.2},
        {"id": "B3", "type": "fader", "label": "II", "min": 0, "max": 1, "step": 0.01, "value": 0.28, "locked": False},
        {"id": "B4", "type": "dial", "label": "⅓", "min": 0, "max": 1, "step": 0.02, "value": 0.76, "locked": False},
        # You can fill C..F rows similarly; renderer tolerates missing cells.
    ],
}

@app.route("/")
def index():
    return render_template("interface_index.html")

@socketio.on("connect")
def on_connect():
    # Register player with default name
    player_registry[request.sid] = {"playerName": "Player", "connectedAt": datetime.now().isoformat()}
    
    # Count total connected clients
    try:
        # Get all connected clients from the namespace
        namespace = '/'
        total_clients = len(socketio.server.manager.get_participants(namespace, namespace))
    except:
        total_clients = 1  # Fallback if we can't count
    print(f"Interface client connected: {request.sid} (Total: {total_clients})")
    emit("state", LATEST_STATE)

@socketio.on("wizard:push_state")
def wizard_push_state(data):
    """
    Wizard pushes partial or full state:
      { state: {...} }
    We shallow-merge top-level keys; for modules we replace array if provided.
    """
    global LATEST_STATE
    state = (data or {}).get("state")
    if not isinstance(state, dict):
        return

    # Log JSON message
    log_json_message({
        "type": "wizard:push_state",
        "state": state,
        "timestamp": datetime.now().isoformat()
    })

    # Merge: keep unspecified keys
    for k, v in state.items():
        if k == "modules" and isinstance(v, list):
            LATEST_STATE["modules"] = v
        elif k == "surface" and isinstance(v, dict):
            LATEST_STATE["surface"].update(v)
        else:
            LATEST_STATE[k] = v

    emit("state", LATEST_STATE, broadcast=True, include_self=False)

@socketio.on("player:update_name")
def player_update_name(data):
    """Handle player name updates."""
    if not isinstance(data, dict):
        return
    
    new_name = (data.get("name") or "Player").strip() or "Player"
    if request.sid in player_registry:
        player_registry[request.sid]["playerName"] = new_name
    else:
        player_registry[request.sid] = {"playerName": new_name, "connectedAt": datetime.now().isoformat()}
    
    print(f"Player name updated: {new_name} (session: {request.sid[:8]}...)")
    
    log_json_message({
        "type": "player:update_name",
        "player": new_name,
        "timestamp": datetime.now().isoformat()
    })

@socketio.on("player:button_press")
def player_button_press(data):
    """Handle simplified button press messages."""
    if not isinstance(data, dict):
        return
    
    player_info = player_registry.get(request.sid, {"playerName": "Player"})
    player_name = data.get("player") or player_info.get("playerName", "Player")
    movement = data.get("movement", "unknown")
    
    print(f"{player_name}: {movement}")
    
    log_json_message({
        "type": "player:button_press",
        "player": player_name,
        "movement": movement,
        "timestamp": datetime.now().isoformat()
    })
    
    # Broadcast to all other clients
    emit("player:button_press", data, broadcast=True, include_self=False)

@socketio.on("player:interaction")
def player_interaction(data):
    """Handle simplified player interaction messages (legacy format, still supported)."""
    if not isinstance(data, dict):
        return
    
    player_info = player_registry.get(request.sid, {"playerName": "Player"})
    player_name = data.get("player") or player_info.get("playerName", "Player")
    controller = data.get("controller", "controller")
    controller_id = data.get("controllerId", "unknown")
    interaction = data.get("interaction", "unknown")
    value = data.get("value")
    
    print(f"[{player_name}] interacted with {controller} ({controller_id}): {interaction} = {value}")
    
    log_json_message({
        "type": "player:interaction",
        "player": player_name,
        "controller": controller,
        "controllerId": controller_id,
        "interaction": interaction,
        "value": value,
        "timestamp": datetime.now().isoformat()
    })
    
    # Broadcast interaction to all other clients
    emit("player:interaction", data, broadcast=True, include_self=False)

@socketio.on("user:module_event")
def user_module_event(data):
    """
    Phone sends interaction events; wizard can optionally listen.
    We also update the server's stored module values (so late joiners sync).
    Now supports JSON payloads for programmable buttons.
    Legacy format - still supported.
    """
    global LATEST_STATE
    if not isinstance(data, dict):
        print(f"WARNING: Invalid user:module_event data (not a dict): {data}")
        return
    
    player_info = player_registry.get(request.sid, {"playerName": "Player"})
    player_name = player_info.get("playerName", "Player")
    
    mid = data.get("id")
    value = data.get("value")
    etype = data.get("etype")  # "press" | "release" | "change" | "toggle"
    payload = data.get("payload")  # Optional JSON payload for programmable buttons

    # Print to console for debugging
    print(f"[{player_name}] Button Interaction: id={mid}, type={etype}, value={value}")
    if payload:
        print(f"   Payload: {json.dumps(payload, indent=2)}")
    else:
        print(f"   Payload: (none)")

    # Log JSON message
    log_json_message({
        "type": "user:module_event",
        "player": player_name,
        "id": mid,
        "etype": etype,
        "value": value,
        "payload": payload,
        "timestamp": datetime.now().isoformat()
    })

    # Update module value if present
    for m in LATEST_STATE.get("modules", []):
        if m.get("id") == mid and "value" in m and value is not None:
            m["value"] = value
            break

    # Broadcast event to everyone else (e.g., wizard debug)
    # Include payload if present
    event_data = {
        "id": mid,
        "etype": etype,
        "value": value
    }
    if payload is not None:
        event_data["payload"] = payload
    
    emit("user:module_event", event_data, broadcast=True, include_self=False)

@socketio.on("disconnect")
def on_disconnect():
    """Handle client disconnection and clean up player registry."""
    if request.sid in player_registry:
        player_name = player_registry[request.sid].get("playerName", "Player")
        print(f"Player \"{player_name}\" disconnected (session: {request.sid[:8]}...)")
        del player_registry[request.sid]
    else:
        print(f"Interface client disconnected (session: {request.sid[:8]}...)")

def log_json_message(message):
    """Log a JSON message to the message queue."""
    JSON_MESSAGES.append(message)
    # Broadcast to all connected clients (emitting without a room broadcasts by default)
    socketio.emit("json_message", message)

@app.route("/api/json-messages")
def get_json_messages():
    """Get all logged JSON messages."""
    return jsonify(list(JSON_MESSAGES))

def get_local_ip():
    """Get the local IP address of this machine."""
    try:
        # Connect to a remote address to determine local IP
        # This doesn't actually send data, just determines the route
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0)
        try:
            # Try to connect to a non-routable address
            s.connect(('10.254.254.254', 1))
            ip = s.getsockname()[0]
        except Exception:
            ip = '127.0.0.1'
        finally:
            s.close()
        return ip
    except Exception:
        return '127.0.0.1'

if __name__ == "__main__":
    port = 5001
    local_ip = get_local_ip()
    
    local_url = f"http://127.0.0.1:{port}"
    network_url = f"http://{local_ip}:{port}"
    
    # Print startup message only once
    startup_msg = "\n" + "="*60 + "\n" + "Flask Server Starting...\n" + "="*60 + "\n" + \
                  f"Local access:    {local_url}\n" + \
                  f"Network access:  {network_url}\n" + \
                  "="*60 + "\n"
    # Write directly to original stdout to avoid filtering
    sys.__stdout__.write(startup_msg)
    sys.__stdout__.flush()
    
    # Generate QR codes
    try:
        qr_local = qrcode.QRCode(version=1, box_size=10, border=4)
        qr_local.add_data(local_url)
        qr_local.make(fit=True)
        img_local = qr_local.make_image(fill_color="black", back_color="white")
        img_local.save(os.path.join(os.path.dirname(__file__), "access_qr_local.png"))
        sys.__stdout__.write(f"QR code generated: access_qr_local.png ({local_url})\n")
        
        qr_network = qrcode.QRCode(version=1, box_size=10, border=4)
        qr_network.add_data(network_url)
        qr_network.make(fit=True)
        img_network = qr_network.make_image(fill_color="black", back_color="white")
        img_network.save(os.path.join(os.path.dirname(__file__), "access_qr_network.png"))
        sys.__stdout__.write(f"QR code generated: access_qr_network.png ({network_url})\n")
        sys.__stdout__.flush()
    except Exception as e:
        sys.__stdout__.write(f"Warning: Could not generate QR codes: {e}\n")
        sys.__stdout__.flush()
    
    # Run with debug=False to prevent reloader from duplicating output
    socketio.run(app, host="0.0.0.0", port=port, debug=False, use_reloader=False)
