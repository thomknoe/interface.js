# Flask Interface Server

## Setup

The virtual environment has been created and dependencies are installed.

### To use the virtual environment:

**Option 1: Use the activation script**
```bash
source activate.sh
python server.py
```

**Option 2: Manual activation**
```bash
source venv/bin/activate  # On Windows: venv\Scripts\activate
python server.py
```

**To deactivate:**
```bash
deactivate
```

### If you need to recreate the virtual environment:

1. Create and activate virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

## Dependencies

- Flask>=2.0.0
- Flask-SocketIO>=5.0.0
- gevent>=20.0.0
- gevent-websocket>=0.10.0
- qrcode[pil]>=7.4.2
