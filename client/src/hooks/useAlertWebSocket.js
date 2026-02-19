import { useState, useEffect, useCallback, useRef } from 'react';

// WebSocket connects directly to backend port 5000, not through Vite proxy
const WS_URL = `ws://localhost:5000/ws/alerts`;

export const useAlertWebSocket = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      wsRef.current = new WebSocket(WS_URL);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected to alerts');
        setIsConnected(true);
        reconnectAttempts.current = 0;
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected from alerts');
        setIsConnected(false);
        scheduleReconnect();
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      scheduleReconnect();
    }
  }, []);

  const handleMessage = useCallback((message) => {
    switch (message.type) {
      case 'connected':
        console.log('Connected to alert service:', message.payload);
        break;

      case 'alert_created':
        setAlerts((prev) => [message.payload, ...prev]);
        break;

      case 'alert_acknowledged':
      case 'alert_escalated':
      case 'alert_resolved':
      case 'alert_closed':
        setAlerts((prev) =>
          prev.map((alert) =>
            alert.alertId === message.payload.alertId ? message.payload : alert
          )
        );
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectAttempts.current >= maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectAttempts.current++;
      console.log(`Reconnecting... Attempt ${reconnectAttempts.current}`);
      connect();
    }, delay);
  }, [connect]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const subscribe = useCallback((filter) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'subscribe',
        payload: filter
      }));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    isConnected,
    alerts,
    subscribe,
    reconnect: connect,
    disconnect
  };
};

export default useAlertWebSocket;
