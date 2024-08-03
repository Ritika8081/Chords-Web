import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "./ui/button";
import { toast } from "sonner";

interface WebSocketMessage {
  type:
    | "port_detected"
    | "port_detached"
    | "stream_status"
    | "serial_data"
    | "error";
  port?: string;
  status?: "started" | "stopped";
  data?: string;
  message?: string;
}

interface ConnectionProps {
  LineData: Function;
  Connection: (isConnected: boolean) => void;
}

const ConnectionWS: React.FC<ConnectionProps> = ({ LineData, Connection }) => {
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const socketRef = useRef<WebSocket | null>(null);

  const connectWebSocket = useCallback(() => {
    socketRef.current = new WebSocket("ws://localhost:8000/ws/arduino/");

    socketRef.current.onopen = () => {
      console.log("WebSocket connection established");
      toast.success("WebSocket connection established");
    };

    socketRef.current.onmessage = (event: MessageEvent) => {
      const data: WebSocketMessage = JSON.parse(event.data);

      switch (data.type) {
        case "port_detected":
          toast.success(`Port Detected: ${data.port}`);
          break;
        case "stream_status":
          setIsStreaming(data.status === "started");
          data.status === "started" ? Connection(true) : Connection(false);
          console.log("Stream Status:", data.status);
          toast(
            data.status === "started" ? "Stream Started" : "Stream Stopped"
          );
          break;
        case "port_detached":
          console.log("Port Detached:", data.message);
          toast.error(data.message);
          break;
        case "serial_data":
          console.log("Serial Data:", data.data);
          LineData(Array(data.data));
          break;
        case "error":
          console.error("Error:", data.message);
          toast.error(data.message);
          break;
      }
    };

    socketRef.current.onclose = () => {
      console.log("WebSocket connection closed");
      setIsStreaming(false);
    };
  }, [LineData, Connection]);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connectWebSocket]);

  const sendCommand = useCallback((command: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ command }));
      console.log(`Sent command: ${command}`);
    } else {
      console.error("WebSocket is not connected");
    }
  }, []);

  const handleStreamToggle = useCallback(() => {
    const command = isStreaming ? "stop" : "start";
    sendCommand(command);
    // Let the backend control the streaming state
  }, [isStreaming, sendCommand]);

  const handleDisconnect = useCallback(() => {
    sendCommand("disconnect");
    if (socketRef.current) {
      socketRef.current.close();
    }
  }, [sendCommand]);

  return (
    <div className="flex h-14 items-center justify-between px-4">
      <Button onClick={handleStreamToggle} disabled={!Connection}>
        {isStreaming ? "Stop Stream" : "Start Stream"}
      </Button>
      <Button
        onClick={handleDisconnect}
        disabled={!Connection}
        variant="destructive"
      >
        Disconnect
      </Button>
    </div>
  );
};

export default ConnectionWS;
