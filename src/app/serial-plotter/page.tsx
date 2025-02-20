"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { WebglPlot, WebglLine, ColorRGBA } from "webgl-plot";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";

interface DataPoint {
    time: number;
    values: number[];
}

const channelColors = ["#F5A3B1", "#86D3ED", "#7CD6C8", "#C2B4E2", "#48d967", "#FFFF8C"];

const SerialPlotter = () => {
    const maxChannels = 0;
    const [data, setData] = useState<DataPoint[]>([]);
    const [port, setPort] = useState<SerialPort | null>(null);
    const [reader, setReader] = useState<ReadableStreamDefaultReader | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [rawData, setRawData] = useState<string>("");
    const [selectedChannels, setSelectedChannels] = useState<number[]>(Array.from({ length: maxChannels }, (_, i) => i));
    const selectedChannelsRef = useRef<number[]>([]);
    const rawDataRef = useRef<HTMLDivElement | null>(null);
    const maxPoints = 1000;
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const wglpRef = useRef<WebglPlot | null>(null);
    const linesRef = useRef<WebglLine[]>([]);
    const [showCommandInput, setShowCommandInput] = useState(false);
    const [command, setCommand] = useState("");
    const [boardName, setBoardName] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<"monitor" | "plotter" | "both">("both");
    const baudRateref = useRef<number>(115200);
    const bitsref = useRef<number>(10);
    const channelsref = useRef<number>(1);
    const sweepPositions = useRef<number[]>(new Array(channelsref.current).fill(0)); // Array for sweep positions
    const currentScaleRef = useRef({ yMin: -1, yMax: 1 });
    const dataRef = useRef<DataPoint[]>([]);

    useEffect(() => {
        if (rawDataRef.current) {
            rawDataRef.current.scrollTop = rawDataRef.current.scrollHeight;
        }
    }, [rawData]);

    const maxRawDataLines = 1000; // Limit for raw data lines

    // ✅ RE-INITIALIZE WebGL when `selectedChannels` updates
    useEffect(() => {
        if (!canvasRef.current || selectedChannels.length === 0) return;

        const canvas = canvasRef.current;
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;

        const wglp = new WebglPlot(canvas);
        wglpRef.current = wglp;

        // Clear old lines
        linesRef.current = [];

        selectedChannels.forEach((_, i) => {
            const line = new WebglLine(getLineColor(i), maxPoints);
            line.lineSpaceX(-1, 2 / maxPoints);
            wglp.addLine(line);
            linesRef.current.push(line);
        });

        wglp.update();
    }, [selectedChannels]);

    useEffect(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;

        // Only (re)initialize if viewMode or selectedChannels change
        const wglp = new WebglPlot(canvas);
        wglpRef.current = wglp;
        linesRef.current = [];

        selectedChannels.forEach((_, i) => {
            const line = new WebglLine(getLineColor(i), maxPoints);
            line.lineSpaceX(-1, 2 / maxPoints);
            wglp.addLine(line);
            linesRef.current.push(line);
        });
        // You can call wglp.update() here once for the initial setup.
        wglp.update();
    }, [selectedChannels, viewMode, isConnected]);

    useEffect(() => {
        const smoothingFactor = 0.5; // Adjust this between 0 (no change) and 1 (immediate change)
        // Update frequently for a continuous effect (e.g., every 50ms)
        const interval = setInterval(() => {
            if (!wglpRef.current || linesRef.current.length === 0 || dataRef.current.length === 0) return;

            // Compute the new autoscale parameters from the full data window
            const allValues = dataRef.current.flatMap(dp => dp.values);
            const MIN_POINTS_FOR_SCALING = 10;
            let newYMin = -1, newYMax = 1;
            if (allValues.length >= MIN_POINTS_FOR_SCALING) {
                newYMin = Math.min(...allValues);
                newYMax = Math.max(...allValues);
            }

            // Smoothly interpolate between the current scale and the new scale
            currentScaleRef.current.yMin += smoothingFactor * (newYMin - currentScaleRef.current.yMin);
            currentScaleRef.current.yMax += smoothingFactor * (newYMax - currentScaleRef.current.yMax);

            const currentYMin = currentScaleRef.current.yMin;
            const currentYMax = currentScaleRef.current.yMax;
            const yRange = currentYMax - currentYMin || 1;

            // Update every point in the buffer using the smoothed scale
            linesRef.current.forEach((line, channelIndex) => {
                const numPoints = dataRef.current.length;
                for (let j = 0; j < numPoints; j++) {
                    const value = dataRef.current[j].values[channelIndex];
                    if (value === undefined) continue;
                    const scaledY = ((value - currentYMin) / yRange) * 2 - 1;
                    try {
                        line.setY(j, scaledY);
                    } catch (e) {
                        console.error(`Error autoscaling channel ${channelIndex} at point ${j}:`, e);
                    }
                }
            });

            if (wglpRef.current) {
                wglpRef.current.update();
            }
        }, 10); // Update every 50ms for a continuous, smooth effect

        return () => clearInterval(interval);
    }, []);


    const getLineColor = (index: number): ColorRGBA => {
        const hex = channelColors[index % channelColors.length];
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return new ColorRGBA(r, g, b, 1);
    };

    const connectToSerial = useCallback(async () => {
        try {
            const ports = await (navigator as any).serial.getPorts();
            let selectedPort = ports.length > 0 ? ports[0] : null;

            if (!selectedPort) {
                selectedPort = await (navigator as any).serial.requestPort();
            }

            await selectedPort.open({ baudRate: baudRateref.current });
            setPort(selectedPort);
            setIsConnected(true);
            setRawData("");
            wglpRef.current = null;
            linesRef.current = [];
            selectedChannelsRef.current = [];
            readSerialData(selectedPort);

            setTimeout(() => {
                sweepPositions.current = new Array(6).fill(0);
            }, 6000);
        } catch (err) {
            console.error("Error connecting to serial:", err);
        }
    }, [baudRateref.current, setPort, setIsConnected, setRawData]);

    const readSerialData = async (serialPort: SerialPort) => {
        try {
            const serialReader = serialPort.readable?.getReader();
            if (!serialReader) return;
            setReader(serialReader);

            let buffer = "";
            let receivedData = false;

            // Timeout: If no data in 3 sec, show command input
            setTimeout(() => {
                if (!receivedData) {
                    setShowCommandInput(true);
                }
            }, 3000);

            while (true) {
                const { value, done } = await serialReader.read();
                if (done) break;
                if (value) {
                    receivedData = true;
                    setShowCommandInput(false);

                    buffer += new TextDecoder().decode(value);
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || ""; // Store incomplete line for next read

                    let newData: DataPoint[] = [];
                    lines.forEach((line) => {
                        setRawData((prev) => {
                            const newRawData = prev.split("\n").concat(line.trim().replace(/\s+/g, " "));
                            return newRawData.slice(-maxRawDataLines).join("\n");
                        });

                        // Detect Board Name
                        if (line.includes("BOARD:")) {
                            setBoardName(line.split(":")[1].trim());
                            setShowCommandInput(true);
                        }

                        // Convert to numeric data
                        const values = line.trim().split(/\s+/).map(parseFloat).filter((v) => !isNaN(v));
                        if (values.length > 0) {
                            newData.push({ time: Date.now(), values });
                            channelsref.current = values.length;
                            // ✅ Ensure `selectedChannels` updates before plotting
                            setSelectedChannels((prevChannels) => {
                                if (prevChannels.length !== values.length) {
                                    return Array.from({ length: values.length }, (_, i) => i);
                                }
                                return prevChannels;
                            });
                        }
                    });

                    if (newData.length > 0) {
                        // Update the ref synchronously
                        dataRef.current = [...dataRef.current, ...newData].slice(-maxPoints);
                        updateWebGLPlot(newData, dataRef.current);
                        setData(dataRef.current);
                    }
                }
            }
            serialReader.releaseLock();
        } catch (err) {
            console.error("Error reading serial data:", err);
        }
    };

    useEffect(() => {
        let isMounted = true;

        const animate = () => {
            if (!isMounted) return;
            requestAnimationFrame(animate);
            requestAnimationFrame(() => {
                if (wglpRef.current) {
                    wglpRef.current.update();
                }
            });
        };

        requestAnimationFrame(animate); // Ensure continuous updates

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        const checkPortStatus = async () => {
            if (port) {
                try {
                    await port.getInfo(); // This may throw an error if the device is disconnected
                } catch {
                    setIsConnected(false);
                    setPort(null);
                    console.warn("Serial device disconnected.");
                }
            }
        };

        const interval = setInterval(checkPortStatus, 3000);
        return () => clearInterval(interval);
    }, [port]);

    const updateWebGLPlot = (newData: DataPoint[], windowData: DataPoint[]) => {
        if (!wglpRef.current || linesRef.current.length === 0 || newData.length === 0) return;

        // Use the smoothed scale from currentScaleRef for the new data
        const { yMin, yMax } = currentScaleRef.current;
        const yRange = yMax - yMin || 1;

        newData.forEach((dataPoint) => {
            linesRef.current.forEach((line, channelIndex) => {
                if (channelIndex >= dataPoint.values.length) return;
                const yValue = ((dataPoint.values[channelIndex] - yMin) / yRange) * 2 - 1;
                const currentPos = sweepPositions.current[channelIndex] % line.numPoints;
                try {
                    line.setY(currentPos, yValue);
                } catch (error) {
                    console.error(`Error plotting data for line ${channelIndex} at pos ${currentPos}:`, error);
                }
                // Advance the circular buffer pointer
                sweepPositions.current[channelIndex] = (currentPos + 1) % line.numPoints;
            });
        });

        requestAnimationFrame(() => {
            if (wglpRef.current) wglpRef.current.update();
        });
    };



    const disconnectSerial = async () => {
        if (reader) {
            await reader.cancel();
            reader.releaseLock();
            setReader(null);
        }
        if (port) {
            await port.close();
            setPort(null);
        }

        setIsConnected(false);

        // Clear WebGL Plot
        if (wglpRef.current) {
            wglpRef.current.clear();
            wglpRef.current = null;
        }
        linesRef.current = [];
        setData([]);
    };
    const handleBaudRateChange = async (newBaudRate: number) => {
        if (isConnected && port) {
            await disconnectSerial(); // Disconnect current connection
        }
        baudRateref.current = newBaudRate;
        setTimeout(() => {
            connectToSerial(); // Reconnect with the new baud rate
        }, 500);
    };
    const sendCommand = async () => {
        if (!port?.writable || !command.trim()) return;

        try {
            const writer = port.writable.getWriter(); // Get writer
            await writer.write(new TextEncoder().encode(command + "\n"));
            writer.releaseLock(); // Release writer after writing
        } catch (err) {
            console.error("Error sending command:", err);
        }
    };

    return (
        <div className="w-full h-screen mx-auto border rounded-2xl shadow-xl flex flex-col gap- overflow-hidden px-4">
            <Navbar isDisplay={true} />

            <div className="w-full flex flex-col gap-2 flex-grow overflow-hidden">

                {/* Plotter - Adjusts Height Dynamically */}
                {viewMode !== "monitor" && (
                    <div className="w-full flex flex-col flex-grow min-h-[40vh]">
                        <div className="border rounded-xl shadow-lg bg-[#1a1a2e] p-2 w-full h-full flex flex-col">
                            {/* Canvas Container */}
                            <div className="canvas-container w-full h-full flex items-center justify-center overflow-hidden">
                                <canvas ref={canvasRef} className="w-full h-full rounded-xl" />
                            </div>
                        </div>
                    </div>
                )}
                {/* Monitor - Adjusts Height Dynamically */}
                {viewMode !== "plotter" && (
                    <div
                        ref={rawDataRef}
                        className="w-full border rounded-xl shadow-lg bg-[#1a1a2e] text-white overflow-auto flex flex-col"
                        style={{
                            height: viewMode === "monitor" ? "calc(100vh - 100px)" : "35vh",
                            maxHeight: viewMode === "monitor" ? "calc(100vh - 100px)" : "35vh",
                            minHeight: "35vh",
                        }}
                    >
                        {/* Title Bar with Input and Buttons */}
                        <div className="sticky top-0 flex items-center justify-between bg-[#1a1a2e] p-2 z-10">
                            {/* Input Box (Full Width) */}
                            <input
                                type="text"
                                value={command}
                                onChange={(e) => setCommand(e.target.value)}
                                placeholder="Enter command"
                                className="w-full p-2 text-xs font-semibold rounded bg-gray-800 text-white border border-gray-600"
                                style={{ height: '36px' }}
                            />

                            {/* Buttons (Shifted Left) */}
                            <div className="flex items-center space-x-2 mr-auto">
                                <Button
                                    onClick={sendCommand}
                                    className="px-4 py-2 text-xs font-semibold bg-gray-500 rounded shadow-md hover:bg-gray-500 transition ml-2"
                                    style={{ height: '36px' }}
                                >
                                    Send
                                </Button>
                                <button
                                    onClick={() => setRawData("")}
                                    className="px-4 py-2 text-xs bg-red-600 text-white rounded shadow-md hover:bg-red-700 transition"
                                    style={{ height: '36px' }}
                                >
                                    Clear
                                </button>
                            </div>
                        </div>

                        {/* Data Display */}
                        <pre className="text-xs whitespace-pre-wrap break-words px-4 pb-4 flex-grow overflow-auto rounded-xl">
                            {rawData}
                        </pre>
                    </div>
                )}
            </div>

            {/* Footer Section */}
            <footer className="flex flex-col gap-2 sm:flex-row py-2 m-2 w-full shrink-0 items-center justify-center px-2 md:px-4">
                {/* Connection Button */}
                <div className="flex justify-center">
                    <Button
                        onClick={isConnected ? disconnectSerial : connectToSerial}
                        className={`px-4 py-2 text-sm font-semibold transition rounded-xl ${isConnected ? "text-sm" : "text-sm"}`}
                    >
                        {isConnected ? "Disconnect" : "Connect"}
                    </Button>
                </div>

                {/* View Mode Selector */}
                <div className="flex items-center gap-0.5 mx-0 px-0">
                    {(["monitor", "plotter", "both"] as const).map((mode, index, arr) => (
                        <Button
                            key={mode}
                            onClick={() => setViewMode(mode)}
                            className={`px-4 py-2 text-sm transition font-semibold
                ${viewMode === mode
                                    ? "bg-primary text-white dark:text-gray-900 shadow-md"
                                    : "bg-gray-500 text-gray-900 hover:bg-gray-300"}
                ${index === 0 ? "rounded-xl rounded-r-none" : ""}
                ${index === arr.length - 1 ? "rounded-xl rounded-l-none" : ""}
                ${index !== 0 && index !== arr.length - 1 ? "rounded-none" : ""}`}
                        >
                            {mode.charAt(0).toUpperCase() + mode.slice(1)}
                        </Button>
                    ))}
                </div>

                {/* Baud Rate Selector */}
                <div className="flex items-center space-x-2">
                    <label className="text-sm font-semibold">Baud Rate:</label>
                    <select
                        value={baudRateref.current}
                        onChange={(e) => handleBaudRateChange(Number(e.target.value))}
                        className="p-1 border rounded bg-gray-800 text-white text-sm"
                    >
                        {[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map((rate) => (
                            <option key={rate} value={rate}>{rate}</option>
                        ))}
                    </select>
                </div>
            </footer>
        </div>
    );
};

export default SerialPlotter;
