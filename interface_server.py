from flask import Flask, render_template
from flask_socketio import SocketIO, emit
import socket

app = Flask(__name__)
app.config["SECRET_KEY"] = "woz-dev"
socketio = SocketIO(app, cors_allowed_origins="*", max_http_buffer_size=20 * 1024 * 1024,)

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

    # Merge: keep unspecified keys
    for k, v in state.items():
        if k == "modules" and isinstance(v, list):
            LATEST_STATE["modules"] = v
        elif k == "surface" and isinstance(v, dict):
            LATEST_STATE["surface"].update(v)
        else:
            LATEST_STATE[k] = v

    emit("state", LATEST_STATE, broadcast=True, include_self=False)

@socketio.on("user:module_event")
def user_module_event(data):
    """
    Phone sends interaction events; wizard can optionally listen.
    We also update the server's stored module values (so late joiners sync).
    Now supports JSON payloads for programmable buttons.
    """
    global LATEST_STATE
    if not isinstance(data, dict):
        return
    mid = data.get("id")
    value = data.get("value")
    etype = data.get("etype")  # "press" | "release" | "change" | "toggle"
    payload = data.get("payload")  # Optional JSON payload for programmable buttons

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
    
    print("\n" + "="*60)
    print("Flask Server Starting...")
    print("="*60)
    print(f"Local access:    http://127.0.0.1:{port}")
    print(f"Network access:  http://{local_ip}:{port}")
    print("="*60 + "\n")
    
    socketio.run(app, host="0.0.0.0", port=port, debug=True)
