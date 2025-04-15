"use client";
import React, { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { EXGFilter, Notch } from './filters';
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation"; // Import useRouter
import { getCustomColor, lightThemeColors } from './Colors';

import {
    Cable,
    Circle,
    CircleStop,
    CircleX,
    Infinity,
    Trash2,
    Download,
    FileArchive,
    Pause,
    Play,
    CircleOff,
    ReplaceAll,
    Heart,
    Brain,
    Eye,
    BicepsFlexed,
    ArrowRightToLine,
    ArrowLeftToLine,
    Settings,
    Loader
} from "lucide-react";
import { BoardsList } from "./boards";
import { toast } from "sonner";
import { saveAs } from "file-saver";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "./ui/tooltip";
import { BitSelection } from "./DataPass";
import { Separator } from "./ui/separator";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "../components/ui/popover";

// Import the new helper files:
import { processPacket } from "./serialAndDataProcessor";
// Import deviceStorage (remains separate)
import { getDeviceChannels } from "./deviceStorage";

interface ConnectionProps {
    onPauseChange: (pause: boolean) => void; // Callback to pass pause state to parent
    datastream: (data: number[]) => void;
    Connection: (isDeviceConnected: boolean) => void;
    FFT: (isDeviceConnected: boolean) => void;
    selectedBits?: BitSelection; // Add `?` if it's optional
    setSelectedBits: React.Dispatch<React.SetStateAction<BitSelection>>;
    isDisplay: boolean;
    setIsDisplay: React.Dispatch<React.SetStateAction<boolean>>;
    setCanvasCount: React.Dispatch<React.SetStateAction<number>>; // Specify type for setCanvasCount
    canvasCount: number;
    selectedChannels: number[]; // Array of selected channel indices
    setSelectedChannels: React.Dispatch<React.SetStateAction<number[]>>; // State updater for selectedChannels
    channelCount: number;
    timeBase: number;
    setTimeBase: React.Dispatch<React.SetStateAction<number>>;
    SetZoom: React.Dispatch<React.SetStateAction<number>>;
    SetCurrentSnapshot: React.Dispatch<React.SetStateAction<number>>;
    currentSamplingRate: number;
    setCurrentSamplingRate: React.Dispatch<React.SetStateAction<number>>;
    currentSnapshot: number;
    Zoom: number;
    snapShotRef: React.RefObject<boolean[]>;
}

const Connection: React.FC<ConnectionProps> = ({
    onPauseChange,
    datastream,
    Connection,
    FFT,
    setSelectedBits,
    isDisplay,
    setIsDisplay,
    setCanvasCount,
    canvasCount,
    setSelectedChannels,
    selectedChannels,
    SetCurrentSnapshot,
    currentSnapshot,
    snapShotRef,
    SetZoom,
    Zoom,
    timeBase,
    setTimeBase,
    currentSamplingRate,
    setCurrentSamplingRate
}) => {

    // States and Refs for Connection & Recording
    const [isDeviceConnected, setIsDeviceConnected] = useState<boolean>(false); // Track if the device is connected
    const [FFTDeviceConnected, setFFTDeviceConnected] = useState<boolean>(false); // Track if the device is connected
    const isDeviceConnectedRef = useRef<boolean>(false); // Ref to track if the device is connected
    const isRecordingRef = useRef<boolean>(false); // Ref to track if the device is recording

    // UI States for Popovers and Buttons
    const [isEndTimePopoverOpen, setIsEndTimePopoverOpen] = useState(false);
    const [isAllEnabledChannelSelected, setIsAllEnabledChannelSelected] = useState(false);
    const [isSelectAllDisabled, setIsSelectAllDisabled] = useState(false);
    const [isRecordButtonDisabled, setIsRecordButtonDisabled] = useState(false);
    const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
    const [manuallySelected, setManuallySelected] = useState(false); // New state to track manual selection

    // Data States
    const [detectedBits, setDetectedBits] = useState<BitSelection | null>(null); // State to store the detected bits
    const detectedBitsRef = React.useRef<BitSelection>(10);
    const [datasets, setDatasets] = useState<any[]>([]);
    const [recordingElapsedTime, setRecordingElapsedTime] = useState<number>(0); // State to store the recording duration
    const [customTimeInput, setCustomTimeInput] = useState<string>(""); // State to store the custom stop time input
    const [leftArrowClickCount, setLeftArrowClickCount] = useState(0); // Track how many times the left arrow is clicked
    const [popoverVisible, setPopoverVisible] = useState(false);
    const [selectedBitsValue, setSelectedBitsValue] = useState<BitSelection>(10);
    const existingRecordRef = useRef<any | undefined>(undefined);
    const devicenameref = useRef<string>("");
    const [deviceReady, setDeviceReady] = useState(false);
    const sampingrateref = useRef<number>(0);
    const [open, setOpen] = useState(false);
    const [isPauseSate, setIsPauseState] = useState(false);

    // UI Themes & Modes
    const { theme } = useTheme(); // Current theme of the app
    const isDarkModeEnabled = theme === "dark"; // Boolean to check if dark mode is enabled
    const router = useRouter(); // Use Next.js router for navigation
    // Determine the current theme without redeclaring 'theme'
    const activeTheme: 'light' | 'dark' = isDarkModeEnabled ? 'dark' : 'light';
    // Time and End Time Tracking
    const recordingStartTimeRef = useRef<number>(0);
    const endTimeRef = useRef<number | null>(null); // Ref to store the end time of the recording

    // Serial Port refs for connection using our helper functions
    const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
    const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
    const portRef = useRef<SerialPort | null>(null);


    // Canvas Settings & Channels
    const canvasElementCountRef = useRef<number>(1);
    const maxCanvasElementCountRef = useRef<number>(1);
    const channelNames = Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => `CH${i + 1}`);
    const currentFileNameRef = useRef<string>("");
    const initialSelectedChannelsRef = useRef<any[]>([1]);

    // Buffer Management
    const buffer: number[] = []; // Buffer to store incoming data
    const NUM_BUFFERS = 4;
    const MAX_BUFFER_SIZE = 500;
    const recordingBuffers = Array(NUM_BUFFERS)
        .fill(null)
        .map(() => [] as number[][]);
    const fillingindex = useRef<number>(0); // Initialize useRef with 0

    // Loading State
    const [isLoading, setIsLoading] = useState(false); // Track loading state for asynchronous operations
    const [isfftLoading, setIsfftLoading] = useState(false); // Track loading state for asynchronous operations


    let activeBufferIndex = 0;
    const togglePause = () => {
        const newPauseState = !isDisplay;
        setIsDisplay(newPauseState);
        onPauseChange(newPauseState); // Notify parent about the change
        SetCurrentSnapshot(0);
        setLeftArrowClickCount(0);
        setIsPauseState(!newPauseState); // <-- Fix: use the new state
    };


    const enabledClicks = (snapShotRef.current?.filter(Boolean).length ?? 0) - 1;

    // Enable/Disable left arrow button
    const handlePrevSnapshot = () => {
        if (leftArrowClickCount < enabledClicks) {
            setLeftArrowClickCount((prevCount) => prevCount + 1); // Use functional update
        }

        if (currentSnapshot < 4) {
            SetCurrentSnapshot((prevSnapshot) => prevSnapshot + 1); // Use functional update
        }
    };

    useEffect(() => {
        if (!deviceReady || !devicenameref.current || maxCanvasElementCountRef.current === undefined) return;

        const enabledChannels = Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i + 1);

        // Retrieve saved devices from localStorage
        const savedPorts = JSON.parse(localStorage.getItem("savedDevices") || "[]");

        let initialSelectedChannelsRefs: number[] = []; // Default to channel 1


        // Ensure port info is available
        const portInfo = portRef.current?.getInfo();
        if (portInfo) {
            const { usbVendorId, usbProductId } = portInfo;
            const deviceIndex = savedPorts.findIndex(
                (saved: SavedDevice) =>
                    saved.usbVendorId === usbVendorId && saved.usbProductId === usbProductId
            );

            if (deviceIndex !== -1) {
                // Load saved channels from localStorage
                const savedChannels = savedPorts[deviceIndex]?.selectedChannels || [];
                initialSelectedChannelsRefs = savedChannels.length > 0 ? savedChannels : enabledChannels;
            }
        }

        setSelectedChannels(initialSelectedChannelsRefs);

        // Determine "Select All" state
        const allSelected = initialSelectedChannelsRefs.length === enabledChannels.length;
        setIsAllEnabledChannelSelected(allSelected);
        setIsSelectAllDisabled(initialSelectedChannelsRefs.length === enabledChannels.length - 1);

    }, [deviceReady, maxCanvasElementCountRef.current, portRef.current]);


    useEffect(() => {
        const enabledChannels = Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i + 1);

        const allSelected = selectedChannels.length === enabledChannels.length;
        const onlyOneLeft = selectedChannels.length === enabledChannels.length - 1;

        setIsSelectAllDisabled((allSelected && manuallySelected) || onlyOneLeft);

        // Update the "Select All" button state
        setIsAllEnabledChannelSelected(allSelected);
    }, [selectedChannels, maxCanvasElementCountRef.current, manuallySelected]);

    const handleSelectAllToggle = () => {
        const enabledChannels = Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i + 1);

        if (!isAllEnabledChannelSelected) {
            // Programmatic selection of all channels
            setManuallySelected(false); // Mark as not manual
            setSelectedChannels(enabledChannels); // Select all channels
        } else {
            // RESET functionality
            const savedPorts = JSON.parse(localStorage.getItem('savedDevices') || '[]');
            const portInfo = portRef.current?.getInfo();
            let initialSelectedChannelsRefs: number[] = []; // Default to channel 1 if no saved channels are found

            if (portInfo) {

                // Find the device by usbVendorId and usbProductId in savedPorts
                const deviceIndex = savedPorts.findIndex(
                    (saved: SavedDevice) =>
                        saved.deviceName === devicenameref.current
                );

                if (deviceIndex !== -1) {
                    // Get the saved channels for the device
                    const savedChannels = savedPorts[deviceIndex].selectedChannels;
                    initialSelectedChannelsRefs = savedChannels.length > 0 ? savedChannels : [1]; // Load saved channels or default to [1]
                }
            }

            // Set the channels back to saved values
            setSelectedChannels(initialSelectedChannelsRefs); // Reset to saved channels
        }

        // Toggle the "Select All" button state
        setIsAllEnabledChannelSelected((prevState) => !prevState);
    };

    const toggleChannel = (channelIndex: number) => {
        setSelectedChannels((prevSelected) => {
            setManuallySelected(true);
            const updatedChannels = prevSelected.includes(channelIndex)
                ? prevSelected.filter((ch) => ch !== channelIndex)
                : [...prevSelected, channelIndex];

            const sortedChannels = updatedChannels.sort((a, b) => a - b);

            if (sortedChannels.length === 0) {
                sortedChannels.push(1);
            }

            // Retrieve saved devices from localStorage
            const savedPorts = JSON.parse(localStorage.getItem('savedDevices') || '[]');
            const portInfo = portRef.current?.getInfo();

            if (portInfo) {
                const deviceIndex = savedPorts.findIndex(
                    (saved: SavedDevice) => saved.deviceName === devicenameref.current
                );

                if (deviceIndex !== -1) {
                    savedPorts[deviceIndex].selectedChannels = sortedChannels;
                    localStorage.setItem('savedDevices', JSON.stringify(savedPorts));

                }
            }

            return sortedChannels;
        });
    };

    // Handle right arrow click (reset count and disable button if needed)
    const handleNextSnapshot = () => {
        if (leftArrowClickCount > 0) {
            setLeftArrowClickCount((prevCount) => prevCount - 1); // Use functional update for more clarity
        }
        if (currentSnapshot > 0) {
            SetCurrentSnapshot((prevSnapshot) => prevSnapshot - 1); // Use functional update for more clarity
        }
    };

    // Added useEffect to sync canvasCount state with the canvasElementCountRef and re-render when isRecordingRef changes
    useEffect(() => {
        canvasElementCountRef.current = canvasCount; // Sync the ref with the state
    }, [canvasCount, isRecordingRef]);


    const handleTimeSelection = (minutes: number | null) => {
        // Function to handle the time selection
        if (minutes === null) {
            endTimeRef.current = null;
            toast.success("Recording set to no time limit");
        } else {
            // If the time is not null, set the end time
            const newEndTimeSeconds = minutes * 60 * 1000;
            if (newEndTimeSeconds <= recordingElapsedTime) {
                // Check if the end time is greater than the current elapsed time
                toast.error("End time must be greater than the current elapsed time");
            } else {
                endTimeRef.current = newEndTimeSeconds; // Set the end time
                toast.success(`Recording end time set to ${minutes} minutes`);
            }
        }
    };

    //////////////////////////////////
    const workerRef = useRef<Worker | null>(null);

    const initializeWorker = () => {
        if (!workerRef.current) {
            workerRef.current = new Worker(new URL('../../workers/indexedDBWorker.ts', import.meta.url), {
                type: 'module',
            });
        }
    };
    const setCanvasCountInWorker = (canvasCount: number) => {
        if (!workerRef.current) {
            initializeWorker();
        }
        setCanvasCount(selectedChannels.length)
        // Send canvasCount independently to the worker
        workerRef.current?.postMessage({ action: 'setCanvasCount', canvasCount: canvasElementCountRef.current });
    };
    setCanvasCountInWorker(canvasElementCountRef.current);

    const setSelectedChannelsInWorker = (selectedChannels: number[]) => {
        if (!workerRef.current) {
            initializeWorker();
        }

        // Send selectedChannels independently to the worker
        workerRef.current?.postMessage({
            action: 'setSelectedChannels',
            selectedChannels: selectedChannels,
        });

    };
    setSelectedChannelsInWorker(selectedChannels)

    const processBuffer = async (bufferIndex: number, canvasCount: number, selectChannel: number[]) => {
        if (!workerRef.current) {
            initializeWorker();
        }

        // If the buffer is empty, return early
        if (recordingBuffers[bufferIndex].length === 0) return;

        const data = recordingBuffers[bufferIndex];
        const filename = currentFileNameRef.current;

        if (filename) {
            // Check if the record already exists
            workerRef.current?.postMessage({ action: 'checkExistence', filename, canvasCount, selectChannel });
            writeToIndexedDB(data, filename, canvasCount, selectChannel);
        }
    };

    const writeToIndexedDB = (data: number[][], filename: string, canvasCount: number, selectChannel: number[]) => {
        workerRef.current?.postMessage({ action: 'write', data, filename, canvasCount, selectChannel });
    };

    const saveAllDataAsZip = async () => {
        try {
            if (workerRef.current) {
                workerRef.current.postMessage({ action: 'saveAsZip', canvasCount, selectedChannels });

                workerRef.current.onmessage = async (event) => {
                    const { zipBlob, error } = event.data;

                    if (zipBlob) {
                        saveAs(zipBlob, 'ChordsWeb.zip');
                    } else if (error) {
                        console.error(error);
                    }
                };
            }
        } catch (error) {
            console.error('Error while saving ZIP file:', error);
        }
    };

    // Function to handle saving data by filename
    const saveDataByFilename = async (filename: string, canvasCount: number, selectChannel: number[]) => {
        if (workerRef.current) {
            workerRef.current.postMessage({ action: "saveDataByFilename", filename, canvasCount, selectChannel });
            workerRef.current.onmessage = (event) => {
                const { blob, error } = event.data;

                if (blob) {
                    saveAs(blob, filename); // FileSaver.js
                    toast.success("File downloaded successfully.");
                } else (error: any) => {
                    console.error("Worker error:", error);
                    toast.error(`Error during file download: ${error.message}`);
                }
            };

            workerRef.current.onerror = (error) => {
                console.error("Worker error:", error);
                toast.error("An unexpected worker error occurred.");
            };
        } else {
            console.error("Worker reference is null.");
            toast.error("Worker is not available.");
        }

    };

    const deleteFileByFilename = async (filename: string) => {
        if (!workerRef.current) initializeWorker();

        return new Promise<void>((resolve, reject) => {
            workerRef.current?.postMessage({ action: 'deleteFile', filename });

            workerRef.current!.onmessage = (event) => {
                const { success, action, error } = event.data;

                if (action === 'deleteFile') {
                    if (success) {
                        toast.success(`File '${filename}' deleted successfully.`);

                        setDatasets((prev) => prev.filter((file) => file !== filename)); // Update datasets
                        resolve();
                    } else {
                        console.error(`Failed to delete file '${filename}': ${error}`);
                        reject(new Error(error));
                    }
                }
            };
        });
    };

    const deleteAllDataFromIndexedDB = async () => {
        if (!workerRef.current) initializeWorker();

        return new Promise<void>((resolve, reject) => {
            workerRef.current?.postMessage({ action: 'deleteAll' });

            workerRef.current!.onmessage = (event) => {
                const { success, action, error } = event.data;

                if (action === 'deleteAll') {
                    if (success) {
                        toast.success(`All files deleted successfully.`);
                        setDatasets([]); // Clear all datasets from state
                        resolve();
                    } else {
                        console.error('Failed to delete all files:', error);
                        reject(new Error(error));
                    }
                }
            };
        });
    };



    //////////////////////////////////////////

    const handlecustomTimeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Update custom time input with only numeric values
        setCustomTimeInput(e.target.value.replace(/\D/g, ""));
    };

    const handlecustomTimeInputSet = () => {
        // Parse and validate the custom time input
        const time = parseInt(customTimeInput, 10);

        if (time > 0) {
            handleTimeSelection(time); // Proceed with valid time
        } else {
            toast.error("Please enter a valid time in minutes"); // Show error for invalid input
        }

        // Clear the input field after handling
        setCustomTimeInput("");
    };


    const formatPortInfo = useCallback(
        (info: SerialPortInfo, deviceName: string, fieldPid?: number) => {
            if (!info?.usbVendorId) {
                return {
                    formattedInfo: "Port with no info",
                    adcResolution: null,
                    channelCount: null,
                    baudRate: null,
                    serialTimeout: null,
                    usbProductId: null, // Add usbProductId to the return value
                };
            }

            // Find the board matching the device name and optionally fieldPid
            const board = BoardsList.find(
                (b) =>
                    b.chords_id.toLowerCase() === deviceName.toLowerCase() &&
                    (!fieldPid || b.field_pid === fieldPid)
            );

            if (board) {
                const {
                    adc_resolution,
                    channel_count,
                    sampling_rate,
                    baud_Rate,
                    serial_timeout,
                    device_name,
                } = board;

                // Update state and refs
                const bitSelection = adc_resolution as BitSelection;
                setSelectedBitsValue(bitSelection);
                setSelectedBits(bitSelection);
                detectedBitsRef.current = bitSelection;
                maxCanvasElementCountRef.current = channel_count || 0;

                if (sampling_rate) {
                    setCurrentSamplingRate(sampling_rate);
                    sampingrateref.current = sampling_rate;
                }

                return {
                    formattedInfo: (
                        <>
                            {device_name}
                        </>
                    ),
                    adcResolution: adc_resolution,
                    channelCount: channel_count,
                    baudRate: baud_Rate,
                    serialTimeout: serial_timeout,
                    usbProductId: info.usbProductId, // Return usbProductId as well
                };
            }

            // Handle case where no matching board is found
            setDetectedBits(null);
            return {
                formattedInfo: `${deviceName}`,
                adcResolution: null,
                channelCount: null,
                baudRate: null,
                serialTimeout: null,
                usbProductId: info.usbProductId, // Return the usbProductId even if no matching board is found
            };
        },
        [] // Dependency array
    );


    // Updated connectToSerialDevice:
    type SavedDevice = {
        usbVendorId: number;
        usbProductId: number;
        baudRate: number;
        serialTimeout: number;
        selectedChannels: number[];
        deviceName?: string;
    };

    type ConnectOptions = {
        onSuccess: () => void;
        setLoading: (state: boolean) => void;
        isFFT?: boolean;
    };


    const connectToSerialDevice = async ({ onSuccess, setLoading, isFFT = false }: ConnectOptions) => {
        try {
            if (portRef.current && portRef.current.readable) {
                await disconnectDevice();
            }

            setLoading(true);

            const savedPorts = JSON.parse(localStorage.getItem("savedDevices") || "[]");
            const ports = await navigator.serial.getPorts();

            let port: SerialPort | null = ports.find((p) => {
                const info = p.getInfo();
                return savedPorts.some((saved: SavedDevice) => saved.usbProductId === info.usbProductId);
            }) || null;

            if (isFFT) {
                handleFrequencySelectionEXG(0, 3);
            }

            let baudRate: number;
            let serialTimeout: number;

            // If user needs to select a new port
            if (!port) {
                console.log("Requesting port...");
                port = await navigator.serial.requestPort();
                console.log("Port selected:", port);

                const newPortInfo = await port.getInfo();
                const usbProductId = newPortInfo.usbProductId ?? 0;

                const board = BoardsList.find((b) => b.field_pid === usbProductId);
                baudRate = board?.baud_Rate ?? 230400;
                serialTimeout = board?.serial_timeout ?? 2000;

            } else {
                const info = port.getInfo();
                const savedDevice = savedPorts.find((saved: SavedDevice) => saved.usbProductId === info.usbProductId);
                baudRate = savedDevice?.baudRate || 230400;
                serialTimeout = savedDevice?.serialTimeout || 2000;
            }

            // Only open the port once here
            if (port.readable === null) {
                await port.open({ baudRate });
            }

            // Setup serial refs (reader/writer)
            portRef.current = port;
            if (port.readable) {
                readerRef.current = port.readable.getReader();
            }
            if (port.writable) {
                writerRef.current = port.writable.getWriter();
            }

            // Send "WHORU\n" command to get device identity
            if (writerRef.current) {
                const whoAreYouMessage = new TextEncoder().encode("WHORU\n");
                setTimeout(() => writerRef.current?.write(whoAreYouMessage), serialTimeout);
            }

            let responseBuffer = "";
            if (readerRef.current) {
                while (true) {
                    const { value, done } = await readerRef.current.read();
                    if (done) break;
                    if (value) {
                        responseBuffer += new TextDecoder().decode(value);
                        if (responseBuffer.includes("\n")) break;
                    }
                }
            }

            const response = responseBuffer.trim().split("\n").pop();
            const extractedName = response?.match(/[A-Za-z0-9\-_\s]+$/)?.[0]?.trim() || "Unknown Device";
            devicenameref.current = extractedName;

            const currentPortInfo = port.getInfo();
            const usbProductId = currentPortInfo.usbProductId ?? 0;

            const lastSelectedChannels = getDeviceChannels(extractedName);
            setSelectedChannels(lastSelectedChannels);

            // Save device if not already stored
            if (!savedPorts.find((saved: SavedDevice) => saved.deviceName === extractedName)) {
                savedPorts.push({
                    deviceName: extractedName,
                    usbProductId,
                    baudRate,
                    serialTimeout,
                    selectedChannels,
                    usbVendorId: currentPortInfo.usbVendorId,
                });
                localStorage.setItem("savedDevices", JSON.stringify(savedPorts));
            }

            // Format and display device info
            const {
                formattedInfo,
                adcResolution,
                channelCount,
                baudRate: extractedBaudRate,
                serialTimeout: extractedSerialTimeout,
            } = formatPortInfo(currentPortInfo, extractedName, usbProductId);

            if (channelCount) {
                maxCanvasElementCountRef.current = channelCount;
            }

            const allSelected = initialSelectedChannelsRef.current.length === channelCount;
            setIsAllEnabledChannelSelected(!allSelected);

            baudRate = extractedBaudRate ?? baudRate;
            serialTimeout = extractedSerialTimeout ?? serialTimeout;

            toast.success("Connection Successful", {
                description: (
                    <div className="mt-2 flex flex-col space-y-1">
                        <p>Device: {formattedInfo}</p>
                        <p>Product ID: {usbProductId}</p>
                        <p>Baud Rate: {baudRate}</p>
                        {adcResolution && <p>Resolution: {adcResolution} bits</p>}
                        {channelCount && <p>Channel: {channelCount}</p>}
                    </div>
                ),
            });

            // Send START command to begin data stream
            if (writerRef.current) {
                const startMessage = new TextEncoder().encode("START\n");
                setTimeout(() => writerRef.current?.write(startMessage), 2000);
            }

            setSelectedChannels(initialSelectedChannelsRef.current);
            setIsDeviceConnected(true);
            setIsDisplay(true);
            setCanvasCount(1);
            isDeviceConnectedRef.current = true;

            const data = await getFileCountFromIndexedDB();
            setDatasets(data);

          
            readData();

            await navigator.wakeLock.request("screen");

            onSuccess();

        } catch (error) {
            await disconnectDevice();
            console.error("Error connecting to device:", error);
            toast.error("Failed to connect to device.");
        } finally {
            setLoading(false);
        }
    };

    const connectToDevice = () => {
        connectToSerialDevice({
            onSuccess: () => {
                Connection(true);
                onPauseChange(true);
            },
            setLoading: setIsLoading,
            isFFT: false,
        });
    };

    const connectToDevicefft = () => {
        connectToSerialDevice({
            onSuccess: () => {
                FFT(true);
                setFFTDeviceConnected(true);
            },
            setLoading: setIsfftLoading,
            isFFT: true,
        });
    };

    const getFileCountFromIndexedDB = async (): Promise<any[]> => {
        if (!workerRef.current) {
            initializeWorker();
        }

        return new Promise((resolve, reject) => {
            if (workerRef.current) {
                workerRef.current.postMessage({ action: 'getFileCountFromIndexedDB' });

                workerRef.current.onmessage = (event) => {
                    if (event.data.allData) {
                        resolve(event.data.allData);
                    } else if (event.data.error) {
                        reject(event.data.error);
                    }
                };

                workerRef.current.onerror = (error) => {
                    reject(`Error in worker: ${error.message}`);
                };
            } else {
                reject('Worker is not initialized');
            }
        });
    };


    // disconnectDevice now calls disconnectSerial from our merged helper.
    const disconnectDevice = async (): Promise<void> => {
        try {
            if (portRef.current) {
                if (writerRef.current) {
                    const stopMessage = new TextEncoder().encode("STOP\n");
                    try {
                        await writerRef.current.write(stopMessage);
                    } catch (error) {
                        console.error("Failed to send STOP command:", error);
                    }
                    writerRef.current.releaseLock();
                    writerRef.current = null;
                }
                snapShotRef.current?.fill(false);
                if (readerRef.current) {
                    try {
                        await readerRef.current.cancel();
                    } catch (error) {
                        console.error("Failed to cancel reader:", error);
                    }
                    readerRef.current.releaseLock();
                    readerRef.current = null;
                }
                if (portRef.current.readable) {
                    await portRef.current.close();
                }
                portRef.current = null;
                setIsDeviceConnected(false);
                setFFTDeviceConnected(false);
                FFT(false);
                toast("Disconnected from device", {
                    action: {
                        label: "Reconnect",
                        onClick: () => connectToDevice(),
                    },
                });
            }
        } catch (error) {
            console.error("Error during disconnection:", error);
        } finally {
            setIsDeviceConnected(false);
            isDeviceConnectedRef.current = false;
            isRecordingRef.current = false;
            Connection(false);
        }
    };

    const appliedFiltersRef = React.useRef<{ [key: number]: number }>({});
    const appliedEXGFiltersRef = React.useRef<{ [key: number]: number }>({});
    const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
    const [, forceEXGUpdate] = React.useReducer((x) => x + 1, 0);

    const removeEXGFilter = (channelIndex: number) => {
        delete appliedEXGFiltersRef.current[channelIndex]; // Remove the filter for the channel
        forceEXGUpdate(); // Trigger re-render

    };

    // Function to handle frequency selection
    const handleFrequencySelectionEXG = (channelIndex: number, frequency: number) => {
        appliedEXGFiltersRef.current[channelIndex] = frequency; // Update the filter for the channel
        forceEXGUpdate(); //Trigger re-render

    };

    // Function to set the same filter for all channels
    const applyEXGFilterToAllChannels = (channels: number[], frequency: number) => {
        channels.forEach((channelIndex) => {
            appliedEXGFiltersRef.current[channelIndex] = frequency; // Set the filter for the channel
        });
        forceEXGUpdate(); // Trigger re-render

    };
    // Function to remove the filter for all channels
    const removeEXGFilterFromAllChannels = (channels: number[]) => {
        channels.forEach((channelIndex) => {
            delete appliedEXGFiltersRef.current[channelIndex]; // Remove the filter for the channel
        });
        forceEXGUpdate(); // Trigger re-render

    };
    const removeNotchFilter = (channelIndex: number) => {
        delete appliedFiltersRef.current[channelIndex]; // Remove the filter for the channel
        forceUpdate(); // Trigger re-render
    };
    // Function to handle frequency selection
    const handleFrequencySelection = (channelIndex: number, frequency: number) => {
        appliedFiltersRef.current[channelIndex] = frequency; // Update the filter for the channel
        forceUpdate(); //Trigger re-render
    };

    // Function to set the same filter for all channels
    const applyFilterToAllChannels = (channels: number[], frequency: number) => {
        channels.forEach((channelIndex) => {
            appliedFiltersRef.current[channelIndex] = frequency; // Set the filter for the channel
        });
        forceUpdate(); // Trigger re-render
    };

    // Function to remove the filter for all channels
    const removeNotchFromAllChannels = (channels: number[]) => {
        channels.forEach((channelIndex) => {
            delete appliedFiltersRef.current[channelIndex]; // Remove the filter for the channel
        });
        forceUpdate(); // Trigger re-render
    };
    useEffect(() => {
        setSelectedChannels(selectedChannels)

    }, [selectedChannels]);

    const readData = async (): Promise<void> => {
        const HEADER_LENGTH = 3;
        const NUM_CHANNELS = maxCanvasElementCountRef.current;
        const PACKET_LENGTH = NUM_CHANNELS * 2 + HEADER_LENGTH + 1;
        let previousCounter: number | null = null;
        try {
            while (isDeviceConnectedRef.current) {
                const streamData = await readerRef.current?.read();
                if (streamData?.done) {
                    console.log("Stream ended.");
                    break;
                }
                if (streamData?.value) {
                    buffer.push(...streamData.value);
                }
                // Use processPacket from serialAndDataProcessor.tsx to decode valid packets.
                const packets = processPacket(
                    buffer,
                    NUM_CHANNELS,
                    detectedBitsRef.current,
                    sampingrateref.current,
                    appliedFiltersRef.current,
                    appliedEXGFiltersRef.current
                );
                for (const channelData of packets) {
                    datastream(channelData);
                    // (Recording and counter-check logic remains unchanged)
                    if (isRecordingRef.current) {
                        const chData = channelData
                            .slice(0, canvasElementCountRef.current + 1)
                            .map((val) => (val !== undefined ? val : null))
                            .filter((val): val is number => val !== null);
                        recordingBuffers[activeBufferIndex][fillingindex.current] = chData;
                        if (fillingindex.current >= MAX_BUFFER_SIZE - 1) {
                            processBuffer(activeBufferIndex, canvasElementCountRef.current, selectedChannels);
                            activeBufferIndex = (activeBufferIndex + 1) % NUM_BUFFERS;
                            fillingindex.current = 0;
                        } else {
                            fillingindex.current++;
                        }
                        const elapsedTime = Date.now() - recordingStartTimeRef.current;
                        setRecordingElapsedTime((prev) => {
                            if (endTimeRef.current !== null && elapsedTime >= endTimeRef.current) {
                                stopRecording();
                                return endTimeRef.current;
                            }
                            return elapsedTime;
                        });
                    }
                    const counter = channelData[0];
                    if (previousCounter !== null) {
                        const expectedCounter: number = (previousCounter + 1) % 256;
                        if (counter !== expectedCounter) {
                            console.warn(`Data loss detected! Previous counter: ${previousCounter}, Current counter: ${counter}`);
                        }
                    }
                    previousCounter = counter;
                }
            }
        } catch (error) {
            console.error("Error reading from device:", error);
        } finally {
            await disconnectDevice();
        }
    };

    // Function to handle the recording process
    const handleRecord = async () => {
        if (isRecordingRef.current) {
            // Stop the recording if it is currently active
            stopRecording();

        } else {
            // Start a new recording session
            isRecordingRef.current = true;
            const now = new Date();
            recordingStartTimeRef.current = Date.now();
            setRecordingElapsedTime(Date.now());
            setIsRecordButtonDisabled(true);

            const filename = `ChordsWeb-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-` +
                `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}.csv`;

            currentFileNameRef.current = filename;
        }
    };

    const stopRecording = async () => {
        if (!recordingStartTimeRef) {
            toast.error("Recording start time was not captured.");
            return;
        }
        isRecordingRef.current = false;
        setRecordingElapsedTime(0);
        setIsRecordButtonDisabled(false);
        setIsDisplay(true);

        recordingStartTimeRef.current = 0;
        existingRecordRef.current = undefined;
        // Re-fetch datasets from IndexedDB after recording stops
        const fetchData = async () => {
            const data = await getFileCountFromIndexedDB();
            setDatasets(data); // Update datasets with the latest data
        };
        // Call fetchData after stopping the recording
        fetchData();
    };

    // Function to format time from seconds into a "MM:SS" string format
    const formatTime = (milliseconds: number): string => {
        const date = new Date(milliseconds);
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(date.getUTCSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    };


    return (
        <div className="flex-none items-center justify-center pb-4 bg-g">
            {/* Left-aligned section */}
            <div className="absolute left-4 flex items-center mx-0 px-0 space-x-1">
                {isRecordingRef.current && (
                    <div className="flex items-center space-x-1 w-min">
                        <button className="flex items-center justify-center px-1 py-2   select-none min-w-20 bg-primary text-destructive whitespace-nowrap rounded-xl"
                        >
                            {formatTime(recordingElapsedTime)}
                        </button>
                        <Separator orientation="vertical" className="bg-primary h-9 " />
                        <div>
                            <Popover
                                open={isEndTimePopoverOpen}
                                onOpenChange={setIsEndTimePopoverOpen}
                            >
                                <PopoverTrigger asChild>
                                    <Button
                                        className="flex items-center justify-center px-1 py-2   select-none min-w-10  text-destructive whitespace-nowrap rounded-xl"
                                        variant="destructive"
                                    >
                                        {endTimeRef.current === null ? (
                                            <Infinity className="h-5 w-5 text-primary" />
                                        ) : (
                                            <div className="text-sm text-primary font-medium">
                                                {formatTime(endTimeRef.current)}
                                            </div>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64 p-4 mx-4">
                                    <div className="flex flex-col space-y-4">
                                        <div className="text-sm font-medium">
                                            Set End Time (minutes)
                                        </div>
                                        <div className="grid grid-cols-4 gap-2">
                                            {[1, 10, 20, 30].map((time) => (
                                                <Button
                                                    key={time}
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleTimeSelection(time)}
                                                >
                                                    {time}
                                                </Button>
                                            ))}
                                        </div>
                                        <div className="flex space-x-2 items-center">
                                            <Input
                                                type="text"
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                placeholder="Custom"
                                                value={customTimeInput}
                                                onBlur={handlecustomTimeInputSet}
                                                onKeyDown={(e) =>
                                                    e.key === "Enter" && handlecustomTimeInputSet()
                                                }
                                                onChange={handlecustomTimeInputChange}
                                                className="w-20"
                                            />
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleTimeSelection(null)}
                                            >
                                                <Infinity className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                )}
            </div>

            {/* Center-aligned buttons */}
            <div className="flex gap-3 items-center justify-center">
                {/* Connection button with tooltip */}
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Popover open={open} onOpenChange={setOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        className="flex items-center gap-1 py-2 px-4 rounded-xl font-semibold"
                                        onClick={() => (isDeviceConnected ? disconnectDevice() : connectToDevice())}
                                        disabled={isLoading}
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader size={17} className="animate-spin" />
                                                Connecting...
                                            </>
                                        ) : isDeviceConnected ? (
                                            <>
                                                Disconnect
                                                <CircleX size={17} />
                                            </>
                                        ) : (
                                            <>
                                                Chords Visualizer
                                                <Cable size={17} />
                                            </>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                {!isDeviceConnected && (
                                    <Button
                                        className="py-2 px-4 rounded-xl font-semibold"
                                        onClick={() => {
                                            localStorage.setItem("autoConnectSerial", "true"); // Auto-connect flag
                                            router.push("/serial-plotter");
                                        }}
                                    >
                                        Serial Wizard
                                    </Button>
                                )}
                                {!isDeviceConnected && (
                                    <Button
                                        className="flex items-center gap-1 py-2 px-4 rounded-xl font-semibold"
                                        onClick={() => (isDeviceConnected ? disconnectDevice() : connectToDevicefft())}
                                        disabled={isfftLoading}
                                    >
                                        {isfftLoading ? (
                                            <>
                                                <Loader size={17} className="animate-spin" />
                                                Connecting...
                                            </>
                                        ) : isDeviceConnected ? (
                                            <>
                                                Disconnect
                                                <CircleX size={17} />
                                            </>
                                        ) : (
                                            <>
                                                FFT Visualizer
                                                <Cable size={17} />
                                            </>
                                        )}
                                    </Button>
                                )}
                                {!isDeviceConnected && (
                                    <Button
                                        className="py-2 px-4 rounded-xl font-semibold"
                                        onClick={() => {
                                            router.push("/npg-lite");
                                        }}
                                    >
                                        NPG-Lite
                                    </Button>
                                )}
                            </Popover>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{isDeviceConnected ? "Disconnect Device" : "Connect Device"}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                {/* Display (Play/Pause) button with tooltip */}
                {isDeviceConnected && !FFTDeviceConnected && (
                    <div className="flex items-center gap-0.5 mx-0 px-0">
                        <Button
                            className="rounded-xl rounded-r-none"
                            onClick={handlePrevSnapshot}
                            disabled={isDisplay || leftArrowClickCount >= enabledClicks}

                        >
                            <ArrowLeftToLine size={16} />
                        </Button>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button className="rounded-xl rounded-l-none rounded-r-none" onClick={togglePause} disabled={isRecordingRef.current}>
                                        {isDisplay ? (
                                            <Pause className="h-5 w-5" />
                                        ) : (
                                            <Play className="h-5 w-5" />
                                        )}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>
                                        {isDisplay ? "Pause Data Display" : "Resume Data Display"}
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <Button
                            className="rounded-xl rounded-l-none"
                            onClick={handleNextSnapshot}
                            disabled={isDisplay || leftArrowClickCount == 0}
                        >
                            <ArrowRightToLine size={16} />
                        </Button>
                    </div>
                )}

                {/* Record button with tooltip */}
                {isDeviceConnected && (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    className="rounded-xl"
                                    onClick={handleRecord}
                                    disabled={isPauseSate}
                                >
                                    {isRecordingRef.current ? (
                                        <CircleStop />
                                    ) : (
                                        <Circle fill="red" />
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>
                                    {!isRecordingRef.current
                                        ? "Start Recording"
                                        : "Stop Recording"}
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}

                {/* Save/Delete data buttons with tooltip */}
                {isDeviceConnected && (
                    <TooltipProvider>
                        <div className="flex">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button className="rounded-xl p-4">
                                        <FileArchive size={16} />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="p-4 text-base shadow-lg rounded-xl w-full">
                                    <div className="space-y-4">
                                        {/* List each file with download and delete actions */}
                                        {datasets.length > 0 ? (
                                            datasets.map((dataset) => (
                                                <div key={dataset} className="flex justify-between items-center">
                                                    {/* Display the filename directly */}
                                                    <span className=" mr-4">
                                                        {dataset}
                                                    </span>

                                                    <div className="flex space-x-2">
                                                        {/* Save file by filename */}
                                                        <Button
                                                            onClick={() => saveDataByFilename(dataset, canvasCount, selectedChannels)}
                                                            className="rounded-xl px-4"
                                                        >
                                                            <Download size={16} />
                                                        </Button>

                                                        {/* Delete file by filename */}
                                                        <Button
                                                            onClick={() => {
                                                                deleteFileByFilename(dataset);
                                                            }}
                                                            className="rounded-xl px-4"
                                                        >
                                                            <Trash2 size={16} />
                                                        </Button>

                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-base ">No datasets available</p>
                                        )}
                                        {/* Download all as ZIP and delete all options */}
                                        {datasets.length > 0 && (
                                            <div className="flex justify-between mt-4">
                                                <Button
                                                    onClick={saveAllDataAsZip}
                                                    className="rounded-xl p-2 w-full mr-2"
                                                >
                                                    Download All as Zip
                                                </Button>
                                                <Button
                                                    onClick={deleteAllDataFromIndexedDB}
                                                    className="rounded-xl p-2 w-full"
                                                >
                                                    Delete All
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </TooltipProvider>
                )}
                {isDeviceConnected && !FFTDeviceConnected && (
                    <Popover
                        open={isFilterPopoverOpen}
                        onOpenChange={setIsFilterPopoverOpen}
                    >
                        <PopoverTrigger asChild>
                            <Button
                                className="flex items-center justify-center px-3 py-2 select-none min-w-12 whitespace-nowrap rounded-xl"
                                disabled={isPauseSate}
                            >
                                Filter
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-50 p-4 mx-4 mb-2">
                            <div className="flex flex-col max-h-80 overflow-y-auto">
                                <div className="flex items-center pb-2 ">
                                    {/* Filter Name */}
                                    <div className="text-sm font-semibold w-12"><ReplaceAll size={20} /></div>
                                    {/* Buttons */}
                                    <div className="flex space-x-2">
                                        <div className="flex items-center border border-input rounded-xl mx-0 px-0">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => removeEXGFilterFromAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i))}
                                                className={`rounded-xl rounded-r-none border-0
                        ${Object.keys(appliedEXGFiltersRef.current).length === 0
                                                        ? "bg-red-700 hover:bg-white-500 hover:text-white text-white" // Disabled background
                                                        : "bg-white-500" // Active background
                                                    }`}
                                            >
                                                <CircleOff size={17} />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => applyEXGFilterToAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i), 4)}
                                                className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                        ${Object.keys(appliedEXGFiltersRef.current).length === maxCanvasElementCountRef.current && Object.values(appliedEXGFiltersRef.current).every((value) => value === 4)
                                                        ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                        : "bg-white-500" // Active background
                                                    }`}
                                            >
                                                <BicepsFlexed size={17} />
                                            </Button> <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => applyEXGFilterToAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i), 3)}
                                                className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                        ${Object.keys(appliedEXGFiltersRef.current).length === maxCanvasElementCountRef.current && Object.values(appliedEXGFiltersRef.current).every((value) => value === 3)
                                                        ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                        : "bg-white-500" // Active background
                                                    }`}
                                            >
                                                <Brain size={17} />
                                            </Button> <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => applyEXGFilterToAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i), 1)}
                                                className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                        ${Object.keys(appliedEXGFiltersRef.current).length === maxCanvasElementCountRef.current && Object.values(appliedEXGFiltersRef.current).every((value) => value === 1)
                                                        ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                        : "bg-white-500" // Active background
                                                    }`}
                                            >
                                                <Heart size={17} />
                                            </Button> <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => applyEXGFilterToAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i), 2)}
                                                className={`rounded-xl rounded-l-none border-0
                        ${Object.keys(appliedEXGFiltersRef.current).length === maxCanvasElementCountRef.current && Object.values(appliedEXGFiltersRef.current).every((value) => value === 2)
                                                        ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                        : "bg-white-500" // Active background
                                                    }`}
                                            >
                                                <Eye size={17} />
                                            </Button>
                                        </div>
                                        <div className="flex border border-input rounded-xl items-center mx-0 px-0">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => removeNotchFromAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i))}
                                                className={`rounded-xl rounded-r-none border-0
                          ${Object.keys(appliedFiltersRef.current).length === 0
                                                        ? "bg-red-700 hover:bg-white-500 hover:text-white text-white" // Disabled background
                                                        : "bg-white-500" // Active background
                                                    }`}
                                            >
                                                <CircleOff size={17} />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => applyFilterToAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i), 1)}
                                                className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                          ${Object.keys(appliedFiltersRef.current).length === maxCanvasElementCountRef.current && Object.values(appliedFiltersRef.current).every((value) => value === 1)
                                                        ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                        : "bg-white-500" // Active background
                                                    }`}
                                            >
                                                50Hz
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => applyFilterToAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i), 2)}
                                                className={`rounded-xl rounded-l-none border-0
                          ${Object.keys(appliedFiltersRef.current).length === maxCanvasElementCountRef.current && Object.values(appliedFiltersRef.current).every((value) => value === 2)
                                                        ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                        : "bg-white-500" // Active background
                                                    }`}
                                            >
                                                60Hz
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col space-y-2">
                                    {channelNames.map((filterName, index) => (
                                        <div key={filterName} className="flex items-center">
                                            {/* Filter Name */}
                                            <div className="text-sm font-semibold w-12">{filterName}</div>
                                            {/* Buttons */}
                                            <div className="flex space-x-2">
                                                <div className="flex border border-input rounded-xl items-center mx-0 px-0">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => removeEXGFilter(index)}
                                                        className={`rounded-xl rounded-r-none border-l-none border-0
                                                        ${appliedEXGFiltersRef.current[index] === undefined
                                                                ? "bg-red-700 hover:bg-white-500 hover:text-white text-white" // Disabled background
                                                                : "bg-white-500" // Active background
                                                            }`}
                                                    >
                                                        <CircleOff size={17} />
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleFrequencySelectionEXG(index, 4)}
                                                        className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                                                        ${appliedEXGFiltersRef.current[index] === 4
                                                                ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                                : "bg-white-500" // Active background
                                                            }`}
                                                    >
                                                        <BicepsFlexed size={17} />
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleFrequencySelectionEXG(index, 3)}
                                                        className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                                                      ${appliedEXGFiltersRef.current[index] === 3
                                                                ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                                : "bg-white-500" // Active background
                                                            }`}
                                                    >
                                                        <Brain size={17} />
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleFrequencySelectionEXG(index, 1)}
                                                        className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                                                        ${appliedEXGFiltersRef.current[index] === 1
                                                                ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                                : "bg-white-500" // Active background
                                                            }`}
                                                    >
                                                        <Heart size={17} />
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleFrequencySelectionEXG(index, 2)}
                                                        className={`rounded-xl rounded-l-none border-0
                                                        ${appliedEXGFiltersRef.current[index] === 2
                                                                ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                                : "bg-white-500" // Active background
                                                            }`}
                                                    >
                                                        <Eye size={17} />
                                                    </Button>
                                                </div>
                                                <div className="flex border border-input rounded-xl items-center mx-0 px-0">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => removeNotchFilter(index)}
                                                        className={`rounded-xl rounded-r-none border-0
                                                        ${appliedFiltersRef.current[index] === undefined
                                                                ? "bg-red-700 hover:bg-white-500 hover:text-white text-white" // Disabled background
                                                                : "bg-white-500" // Active background
                                                            }`}
                                                    >
                                                        <CircleOff size={17} />
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleFrequencySelection(index, 1)}
                                                        className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                                                        ${appliedFiltersRef.current[index] === 1
                                                                ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                                : "bg-white-500" // Active background
                                                            }`}
                                                    >
                                                        50Hz
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleFrequencySelection(index, 2)}
                                                        className={
                                                            `rounded-xl rounded-l-none border-0 ${appliedFiltersRef.current[index] === 2
                                                                ? "bg-green-700 hover:bg-white-500 text-white hover:text-white "
                                                                : "bg-white-500 animate-fade-in-right"
                                                            }`
                                                        }
                                                    >
                                                        60Hz
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                )}

                {FFTDeviceConnected && (
                    <Popover open={isFilterPopoverOpen} onOpenChange={setIsFilterPopoverOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                className="flex items-center justify-center px-3 py-2 select-none min-w-12 whitespace-nowrap rounded-xl"
                                disabled={!isDisplay}
                            >
                                Filter
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-50 p-4 mx-4 mb-2">
                            <div className="flex flex-col max-h-80 overflow-y-auto">
                                <div className="flex items-center">
                                    <div className="text-sm font-semibold w-12">{channelNames[0]}</div>
                                    <div className="flex space-x-2">
                                        <div className="flex border border-input rounded-xl items-center mx-0 px-0">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => removeNotchFilter(0)}
                                                className={`rounded-xl rounded-r-none border-0
                                                        ${appliedFiltersRef.current[0] === undefined
                                                        ? "bg-red-700 hover:bg-white-500 hover:text-white text-white" // Disabled background
                                                        : "bg-white-500" // Active background
                                                    }`}
                                            >
                                                <CircleOff size={17} />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleFrequencySelection(0, 1)}
                                                className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                                                        ${appliedFiltersRef.current[0] === 1
                                                        ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                        : "bg-white-500" // Active background
                                                    }`}
                                            >
                                                50Hz
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleFrequencySelection(0, 2)}
                                                className={
                                                    `rounded-xl rounded-l-none border-0 ${appliedFiltersRef.current[0] === 2
                                                        ? "bg-green-700 hover:bg-white-500 text-white hover:text-white "
                                                        : "bg-white-500 animate-fade-in-right"
                                                    }`
                                                }
                                            >
                                                60Hz
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </PopoverContent>
                    </Popover>
                )}

                {isDeviceConnected && !FFTDeviceConnected && (
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button className="flex items-center justify-center select-none whitespace-nowrap rounded-lg" >
                                <Settings size={16} />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[30rem] p-4 rounded-md shadow-md text-sm">
                            <TooltipProvider>
                                <div className={`space-y-6 ${!isDisplay ? "flex justify-center" : ""}`}>
                                    {/* Channel Selection */}
                                    {isDisplay && !isRecordingRef.current && (
                                        <div className="flex items-center justify-center rounded-lg ">
                                            <div className="w-full">
                                                {/* Channels Count & Select All Button */}
                                                <div className="flex items-center justify-between " >
                                                    <h3 className="text-xs font-semibold text-gray-500">
                                                        <span className="font-bold text-gray-600">Channels Count:</span> {selectedChannels.length}
                                                    </h3>
                                                    {!(selectedChannels.length === maxCanvasElementCountRef.current && manuallySelected) && (
                                                        <button
                                                            onClick={handleSelectAllToggle}
                                                            className={`px-4 py-1 text-xs font-light rounded-lg transition m-2 ${isSelectAllDisabled
                                                                ? "text-gray-400 bg-gray-200 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed"
                                                                : "text-white bg-black hover:bg-gray-700 dark:bg-white dark:text-black dark:border dark:border-gray-500 dark:hover:bg-primary/70"
                                                                }`}
                                                            disabled={isSelectAllDisabled}
                                                        >
                                                            {isAllEnabledChannelSelected ? "RESET" : "Select All"}
                                                        </button>
                                                    )}
                                                </div>
                                                {/* Channel Buttons Grid */}
                                                <div id="button-container" className="relative space-y-2 rounded-lg">
                                                    {Array.from({ length: 2 }).map((_, container) => (
                                                        <div key={container} className="grid grid-cols-8 gap-2">
                                                            {Array.from({ length: 8 }).map((_, col) => {
                                                                const index = container * 8 + col;
                                                                const isChannelDisabled = index >= maxCanvasElementCountRef.current;
                                                                const isSelected = selectedChannels.includes(index + 1);
                                                                const buttonStyle = isChannelDisabled
                                                                    ? isDarkModeEnabled
                                                                        ? { backgroundColor: "#030c21", color: "gray" }
                                                                        : { backgroundColor: "#e2e8f0", color: "gray" }
                                                                    : isSelected
                                                                        ? { backgroundColor: getCustomColor(index, activeTheme), color: "white" }
                                                                        : { backgroundColor: "white", color: "black" };
                                                                const isFirstInRow = col === 0;
                                                                const isLastInRow = col === 7;
                                                                const isFirstContainer = container === 0;
                                                                const isLastContainer = container === 1;
                                                                const roundedClass = `
                                                                ${isFirstInRow && isFirstContainer ? "rounded-tl-lg" : ""} 
                                                                ${isLastInRow && isFirstContainer ? "rounded-tr-lg" : ""} 
                                                                ${isFirstInRow && isLastContainer ? "rounded-bl-lg" : ""} 
                                                                ${isLastInRow && isLastContainer ? "rounded-br-lg" : ""}
                                                                     `;

                                                                return (
                                                                    <button
                                                                        key={index}
                                                                        onClick={() => !isChannelDisabled && toggleChannel(index + 1)}
                                                                        disabled={isChannelDisabled}
                                                                        style={buttonStyle}
                                                                        className={`w-full h-8 text-xs font-medium py-1 border border-gray-300 dark:border-gray-600 transition-colors duration-200 ${roundedClass}`}
                                                                    >
                                                                        {`CH${index + 1}`}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Zoom Controls */}
                                    <div className={`relative w-full flex flex-col ${!isDisplay ? "" : "items-start"} text-sm`}>
                                        {/* Zoom Level label positioned at top left with margin/padding */}
                                        <p className="text-xs justify-start font-semibold text-gray-500 ">
                                            <span className="font-bold text-gray-600">Zoom Level:</span> {Zoom}x
                                        </p>
                                        <div className="relative w-[28rem] flex items-center rounded-lg py-2 border border-gray-300 dark:border-gray-600 mb-4">
                                            {/* Button for setting Zoom to 1 */}
                                            <button
                                                className="text-gray-700 dark:text-gray-400 mx-1 px-2 py-1 border rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                                                onClick={() => SetZoom(1)}
                                            >
                                                1
                                            </button>

                                            <input
                                                type="range"
                                                min="1"
                                                max="10"
                                                value={Zoom}
                                                onChange={(e) => SetZoom(Number(e.target.value))}
                                                style={{
                                                    background: `linear-gradient(to right, rgb(101, 136, 205) ${((Zoom - 1) / 9) * 100}%, rgb(165, 165, 165) ${((Zoom - 1) / 9) * 11}%)`,
                                                }}
                                                className="flex-1 h-[0.15rem] rounded-full appearance-none bg-gray-800 focus:outline-none focus:ring-0 slider-input"
                                            />

                                            {/* Button for setting Zoom to 10 */}
                                            <button
                                                className="text-gray-700 dark:text-gray-400 mx-2 px-2 py-1 border rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                                                onClick={() => SetZoom(10)}
                                            >
                                                10
                                            </button>
                                            <style jsx>{` input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 15px; height: 15px;
                                            background-color: rgb(101, 136, 205); border-radius: 50%; cursor: pointer; } `}</style>
                                        </div>
                                    </div>

                                    {/* Time-Base Selection */}
                                    {isDisplay && (
                                        <div className="relative w-full flex flex-col items-start  text-sm">
                                            <p className="text-xs font-semibold text-gray-500 ">
                                                <span className="font-bold text-gray-600">Time Base:</span> {timeBase} Seconds
                                            </p>
                                            <div className="relative w-[28rem] flex items-center rounded-lg py-2 border border-gray-300 dark:border-gray-600">
                                                {/* Buttons & Slider */}
                                                <button
                                                    className="text-gray-700 dark:text-gray-400 mx-1 px-2 py-1 border rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                                                    onClick={() => setTimeBase(1)}
                                                >
                                                    1
                                                </button>
                                                <input
                                                    type="range"
                                                    min="1"
                                                    max="10"
                                                    value={timeBase}
                                                    onChange={(e) => setTimeBase(Number(e.target.value))}
                                                    style={{
                                                        background: `linear-gradient(to right, rgb(101, 136, 205) ${((timeBase - 1) / 9) * 100}%, rgb(165, 165, 165) ${((timeBase - 1) / 9) * 11}%)`,
                                                    }}
                                                    className="flex-1 h-[0.15rem] rounded-full appearance-none bg-gray-200 focus:outline-none focus:ring-0 slider-input"
                                                />
                                                <button
                                                    className="text-gray-700 dark:text-gray-400 mx-2 px-2 py-1 border rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                                                    onClick={() => setTimeBase(10)}
                                                >
                                                    10
                                                </button>
                                                <style jsx>{` input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none;appearance: none; width: 15px; height: 15px;
                                                background-color: rgb(101, 136, 205); border-radius: 50%; cursor: pointer; }`}</style>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </TooltipProvider>
                        </PopoverContent>
                    </Popover>
                )}
            </div>
        </div>
    );
};

export default Connection;