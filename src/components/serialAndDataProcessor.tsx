// serialAndDataProcessor.tsx
import React from "react";
import { Notch, EXGFilter } from "./filters";

export type SerialRefs = {
  portRef: React.MutableRefObject<SerialPort | null>;
  readerRef: React.MutableRefObject<ReadableStreamDefaultReader<Uint8Array> | null>;
  writerRef: React.MutableRefObject<WritableStreamDefaultWriter<Uint8Array> | null>;
};

export const DeviceCommands = {
  WHORU: "WHORU\n",
  START: "START\n",
  STOP: "STOP\n"
} as const;

export async function connectSerial(
  portRef: React.MutableRefObject<SerialPort | null>,
  readerRef: React.MutableRefObject<ReadableStreamDefaultReader<Uint8Array> | null>,
  writerRef: React.MutableRefObject<WritableStreamDefaultWriter<Uint8Array> | null>,
  baudRate: number = 230400
): Promise<void> {
  try {
    console.log("Requesting port...");
    const port = await navigator.serial.requestPort();
    console.log("Port selected:", port);

    await port.open({ baudRate, dataBits: 8, stopBits: 1, parity: "none" });
    console.log("Port opened with settings:", {
      readable: !!port.readable,
      writable: !!port.writable,
      signals: port.getSignals ? await port.getSignals() : {}
    });

    portRef.current = port;
    if (!port.readable || !port.writable) {
      throw new Error("Port streams not available after opening");
    }

    readerRef.current = port.readable.getReader();
    writerRef.current = port.writable.getWriter();
  } catch (error: any) {
    console.error("Serial connection error:", error);
    throw error;
  }
}

export async function disconnectSerial(
  portRef: React.MutableRefObject<SerialPort | null>,
  readerRef: React.MutableRefObject<ReadableStreamDefaultReader<Uint8Array> | null>,
  writerRef: React.MutableRefObject<WritableStreamDefaultWriter<Uint8Array> | null>
): Promise<void> {
  if (writerRef.current) await writerRef.current.close();
  if (readerRef.current) await readerRef.current.cancel();
  if (portRef.current) await portRef.current.close();
  portRef.current = null;
  readerRef.current = null;
  writerRef.current = null;
}

export async function sendCommand(
  writerRef: React.MutableRefObject<WritableStreamDefaultWriter<Uint8Array> | null>,
  command: keyof typeof DeviceCommands,
  timeout: number = 1000
): Promise<void> {
  if (!writerRef.current) throw new Error("No writer available to send command");
  const message = new TextEncoder().encode(DeviceCommands[command]);
  await Promise.race([
    writerRef.current.write(message),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Command timeout")), timeout)
    )
  ]);
}

export async function initDevice(
  serialRefs: SerialRefs,
  whoruTimeout: number = 2000,
  startTimeout: number = 2000
): Promise<string> {
  const { portRef, readerRef, writerRef } = serialRefs;

  if (!portRef.current) throw new Error("Serial port reference is missing");
  if (!writerRef.current) throw new Error("Serial writer reference is missing");
  if (!portRef.current.readable) throw new Error("Serial port is not readable");

  if (!readerRef.current) {
    console.warn("Reader not assigned. Attempting to get a reader from the port.");
    readerRef.current = portRef.current.readable?.getReader() ?? null;
  }
  if (!readerRef.current) throw new Error("Serial reader reference is missing");

  console.log("[initDevice] Step 1: Sending WHORU command...");
  try {
    await sendCommand(writerRef, "WHORU");
    console.log("[initDevice] WHORU command sent successfully");
    await new Promise(resolve => setTimeout(resolve, 300));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[initDevice] Failed to send WHORU command:", msg);
    throw new Error(`Failed to send WHORU command: ${msg}`);
  }

  let responseBuffer = "";
  try {
    console.log("[initDevice] Step 2: Waiting for device response...");
    const reader = readerRef.current;
    const startTime = Date.now();

    // Slight delay to give the device time to respond
    await new Promise(resolve => setTimeout(resolve, 50));

      const result = await reader.read();
      console.log(result);

      const { value, done } = result;
      console.log(value);

      if (value) {
        const chunk = new TextDecoder().decode(value);
        console.log("[initDevice] Received:", JSON.stringify(chunk));
        responseBuffer += chunk;
      }

    if (!responseBuffer.trim()) {
      throw new Error("No response received from device (empty response)");
    }

    const lines = responseBuffer.split(/\r?\n/).filter(line => line.trim());
    const lastLine = lines[lines.length - 1] || "";
    const nameMatch = lastLine.match(/[A-Za-z0-9\-_\s]+/);
    const extractedName = nameMatch?.[0]?.trim() || "Unknown Device";

    console.log(`[initDevice] Extracted device name: '${extractedName}'`);

    console.log("[initDevice] Step 3: Sending START command...");
    await sendCommand(writerRef, "START", startTimeout);
    console.log("[initDevice] START command sent successfully");
    await new Promise(resolve => setTimeout(resolve, 100));

    return extractedName;
  } catch (error) {
    console.error("[initDevice] Error during initialization:", error);
    throw error;
  }
}

export async function stopDevice(
  serialRefs: SerialRefs,
  timeout: number = 1000
): Promise<void> {
  await sendCommand(serialRefs.writerRef, "STOP", timeout);
}

export function processPacket(
  buffer: number[],
  NUM_CHANNELS: number,
  detectedBits: number,
  samplingRate: number,
  appliedNotch: { [key: number]: number },
  appliedEXG: { [key: number]: number }
): number[][] {
  const HEADER_LENGTH = 3;
  const SYNC_BYTE1 = 0xc7;
  const SYNC_BYTE2 = 0x7c;
  const END_BYTE = 0x01;
  const PACKET_LENGTH = NUM_CHANNELS * 2 + HEADER_LENGTH + 1;

  const notchFilters = Array.from({ length: NUM_CHANNELS }, () => new Notch());
  const exgFilters = Array.from({ length: NUM_CHANNELS }, () => new EXGFilter());
  notchFilters.forEach(filter => filter.setbits(samplingRate));
  exgFilters.forEach(filter => filter.setbits(detectedBits.toString(), samplingRate));

  const packets: number[][] = [];

  while (buffer.length >= PACKET_LENGTH) {
    const syncIndex = buffer.findIndex((byte, i) => byte === SYNC_BYTE1 && buffer[i + 1] === SYNC_BYTE2);
    if (syncIndex === -1 || syncIndex + PACKET_LENGTH > buffer.length) break;
    const endByteIndex = syncIndex + PACKET_LENGTH - 1;
    if (buffer[endByteIndex] !== END_BYTE) {
      buffer.splice(0, syncIndex + 1);
      continue;
    }
    const packet = buffer.slice(syncIndex, syncIndex + PACKET_LENGTH);
    const channelData: number[] = [packet[2]];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const hi = packet[ch * 2 + HEADER_LENGTH];
      const lo = packet[ch * 2 + HEADER_LENGTH + 1];
      const raw = (hi << 8) | lo;
      const exg = exgFilters[ch].process(raw, appliedEXG[ch]);
      const filtered = notchFilters[ch].process(exg, appliedNotch[ch]);
      channelData.push(filtered);
    }
    packets.push(channelData);
    buffer.splice(0, endByteIndex + 1);
  }
  return packets;
}
