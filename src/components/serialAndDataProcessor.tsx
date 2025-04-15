// serialAndDataProcessor.tsx
import React from "react";
import { Notch, EXGFilter } from "./filters";

/**
 * SerialRefs - A type definition to hold references to the serial port,
 * its reader, and its writer.
 */
export type SerialRefs = {
    portRef: React.MutableRefObject<SerialPort | null>;
    readerRef: React.MutableRefObject<ReadableStreamDefaultReader<Uint8Array> | null>;
    writerRef: React.MutableRefObject<WritableStreamDefaultWriter<Uint8Array> | null>;
};

/**
 * connectSerial - Requests a serial port from the user, opens it with a fixed baud rate,
 * and sets up the reader and writer.
 *
 * @param portRef - A React mutable ref to store the SerialPort instance.
 * @param readerRef - A React mutable ref to store the readable stream's reader.
 * @param writerRef - A React mutable ref to store the writable stream's writer.
 * @returns The opened SerialPort.
 */
export async function connectSerial(
    portRef: React.MutableRefObject<SerialPort | null>,
    readerRef: React.MutableRefObject<ReadableStreamDefaultReader<Uint8Array> | null>,
    writerRef: React.MutableRefObject<WritableStreamDefaultWriter<Uint8Array> | null>
): Promise<SerialPort> {
    try {
        console.log("Requesting port...");
        const port = await navigator.serial.requestPort();
        console.log("Port requested:", port);
        await port.open({ baudRate: 230400 });
        portRef.current = port;
        if (port.readable) {
            readerRef.current = port.readable.getReader();
        }
        if (port.writable) {
            writerRef.current = port.writable.getWriter();
        }
        return port;
    } catch (error: any) {
        if (error.name === "NotFoundError") {
            console.warn("No port selected by user.");
            alert("No device selected. Please choose a port from the prompt.");
        } else {
            console.error("Unhandled serial error:", error);
        }
        throw error; // rethrow or handle based on your logic
    }
}


/**
 * disconnectSerial - Cleans up the serial connection by closing the writer,
 * canceling the reader, closing the port, and resetting the refs.
 *
 * @param portRef - A ref holding the SerialPort instance.
 * @param readerRef - A ref holding the reader.
 * @param writerRef - A ref holding the writer.
 */
export async function disconnectSerial(
    portRef: React.MutableRefObject<SerialPort | null>,
    readerRef: React.MutableRefObject<ReadableStreamDefaultReader<Uint8Array> | null>,
    writerRef: React.MutableRefObject<WritableStreamDefaultWriter<Uint8Array> | null>
): Promise<void> {
    if (writerRef.current) {
        await writerRef.current.close();
    }
    if (readerRef.current) {
        await readerRef.current.cancel();
    }
    if (portRef.current) {
        await portRef.current.close();
    }
    portRef.current = null;
    readerRef.current = null;
    writerRef.current = null;
}

/**
 * processPacket - Extracts valid packets from a raw data buffer, applies EXG and Notch filters,
 * and returns an array of processed data packets.
 *
 * @param buffer - The raw byte array received from the device.
 * @param NUM_CHANNELS - The number of channels in each data packet.
 * @param detectedBits - The ADC resolution (e.g., 10, 12, 14, or 16).
 * @param samplingRate - The sampling rate used by the filters.
 * @param appliedNotch - An object holding notch filter settings per channel.
 * @param appliedEXG - An object holding EXG filter settings per channel.
 * @returns An array where each element is a processed packet (an array of numbers).
 */
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

    // Create filter instances for each channel
    const notchFilters = Array.from({ length: NUM_CHANNELS }, () => new Notch());
    const exgFilters = Array.from({ length: NUM_CHANNELS }, () => new EXGFilter());
    notchFilters.forEach((filter) => filter.setbits(samplingRate));
    exgFilters.forEach((filter) => filter.setbits(detectedBits.toString(), samplingRate));

    const packets: number[][] = [];

    // Loop while there is enough data for at least one full packet.
    while (buffer.length >= PACKET_LENGTH) {
        // Look for sync bytes marking the start of a packet.
        const syncIndex = buffer.findIndex(
            (byte, index) => byte === SYNC_BYTE1 && buffer[index + 1] === SYNC_BYTE2
        );
        if (syncIndex === -1 || syncIndex + PACKET_LENGTH > buffer.length) {
            break;
        }
        const endByteIndex = syncIndex + PACKET_LENGTH - 1;
        // Verify the end byte is correct.
        if (buffer[endByteIndex] !== END_BYTE) {
            // If the packet is invalid, remove up to the sync index.
            buffer.splice(0, syncIndex + 1);
            continue;
        }
        // Extract the packet.
        const packet = buffer.slice(syncIndex, syncIndex + PACKET_LENGTH);
        const channelData: number[] = [packet[2]]; // The third byte is taken as a counter.

        // For each channel, combine two consecutive bytes and process with filters.
        for (let ch = 0; ch < NUM_CHANNELS; ch++) {
            const highByte = packet[ch * 2 + HEADER_LENGTH];
            const lowByte = packet[ch * 2 + HEADER_LENGTH + 1];
            const rawValue = (highByte << 8) | lowByte;
            const filteredEXG = exgFilters[ch].process(rawValue, appliedEXG[ch]);
            const finalValue = notchFilters[ch].process(filteredEXG, appliedNotch[ch]);
            channelData.push(finalValue);
        }

        packets.push(channelData);
        // Remove processed data from the buffer.
        buffer.splice(0, endByteIndex + 1);
    }

    return packets;
}
