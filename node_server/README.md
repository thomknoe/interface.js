# Node.js Interface Server

Node.js-based server for the modular interface system.

## Installation

```bash
npm install
```

## Running

```bash
npm start
# or
node server.js
```

Server runs on port **3001**

Access at: `http://localhost:3001`

## Features

- Express + WebSocket server
- Full modular UI system (ported from Flask)
- JSON message logging and display
- WebSocket-based real-time communication (Socket.IO-compatible API)
- Integration with Unreal Engine WebSocket connections
- **No old UI background or controller UI** - clean interface system only

## Structure

```
node_server/
├── server.js              # Main Node.js server
├── package.json           # Node.js dependencies
├── static/
│   ├── interface.js      # UI logic
│   ├── interface.css     # Styles
│   └── websocket-client.js  # WebSocket client wrapper
└── templates/
    └── interface_index.html  # HTML template
```

## Differences from Flask Version

- Uses native WebSocket instead of Socket.IO
- WebSocket client wrapper provides Socket.IO-compatible API
- No references to old controller UI or ui_background.svg
- Can integrate with Unreal Engine connections via WebSocket
