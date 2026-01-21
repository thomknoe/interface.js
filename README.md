# Interface Server - Flask and Node.js Versions

This project contains two separate, self-contained server implementations for the modular interface system.

## Flask Version

**Location:** `flask_server/`

- Flask + Flask-SocketIO
- Port: **5001**
- Uses Socket.IO for real-time communication

See `flask_server/README.md` for details.

## Node.js Version

**Location:** `node_server/`

- Express + WebSocket
- Port: **3001**
- Uses native WebSocket with Socket.IO-compatible wrapper
- **No old UI background or controller UI** - clean interface system only

See `node_server/README.md` for details.

## Quick Start

### Flask Version
```bash
cd flask_server
pip install -r requirements.txt
python server.py
```

### Node.js Version
```bash
cd node_server
npm install
npm start
```
