// WebSocket client that mimics Socket.IO API for compatibility
(function() {
  'use strict';

  // Determine WebSocket URL based on current page protocol
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const WS_URL = `${protocol}//${window.location.host}`;
  let ws = null;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 10;
  let reconnectTimeout = null;
  const eventHandlers = new Map();

  function connect() {
    try {
      ws = new WebSocket(WS_URL + '?role=interface');
      
      ws.onopen = function() {
        console.log('WebSocket connected');
        reconnectAttempts = 0;
        // Emit connect event
        emit('connect');
      };

      ws.onmessage = function(event) {
        try {
          const data = JSON.parse(event.data);
          
          // Handle different message types
          if (data.type === 'state') {
            emit('state', data.data);
          } else if (data.type === 'user:module_event') {
            emit('user:module_event', data.data);
          } else if (data.type === 'player:button_press') {
            emit('player:button_press', data.data);
          } else if (data.type === 'player:interaction') {
            emit('player:interaction', data.data);
          } else if (data.type === 'json_message') {
            emit('json_message', data.data);
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = function(error) {
        console.error('WebSocket error:', error);
      };

      ws.onclose = function() {
        console.log('WebSocket closed');
        emit('disconnect');
        
        // Attempt to reconnect
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          reconnectTimeout = setTimeout(() => {
            console.log(`Reconnecting... (attempt ${reconnectAttempts})`);
            connect();
          }, delay);
        } else {
          console.error('Max reconnection attempts reached');
        }
      };
    } catch (err) {
      console.error('Error creating WebSocket:', err);
    }
  }

  function emit(eventName, data) {
    const handlers = eventHandlers.get(eventName) || [];
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (err) {
        console.error(`Error in handler for ${eventName}:`, err);
      }
    });
  }

  // Socket.IO-like API
  window.io = function() {
    return {
      on: function(eventName, handler) {
        if (!eventHandlers.has(eventName)) {
          eventHandlers.set(eventName, []);
        }
        eventHandlers.get(eventName).push(handler);
      },
      
      emit: function(eventName, data) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          const message = {
            type: eventName,
            ...data
          };
          ws.send(JSON.stringify(message));
        } else {
          console.warn('WebSocket not connected, cannot emit:', eventName);
        }
      },
      
      disconnect: function() {
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
        }
        if (ws) {
          ws.close();
        }
      }
    };
  };

  // Create singleton socket instance
  window.socket = window.io();
  
  // Auto-connect
  connect();
})();
