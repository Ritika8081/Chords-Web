"use client";
import React, { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { EXGFilter, Notch } from './filters';
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
  Settings
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

interface ConnectionProps {
  onPauseChange: (pause: boolean) => void; // Callback to pass pause state to parent
  datastream: (data: number[]) => void;
  Connection: (isConnected: boolean) => void;
  selectedBits: BitSelection;
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
  SetcurrentSnapshot: React.Dispatch<React.SetStateAction<number>>;
  currentSamplingRate:number;
  setCurrentSamplingRate :React.Dispatch<React.SetStateAction<number>>;
  currentSnapshot: number;
  Zoom: number;
  snapShotRef: React.RefObject<boolean[]>;
}

const Connection: React.FC<ConnectionProps> = ({
  onPauseChange,
  datastream,
  Connection,
  setSelectedBits,
  isDisplay,
  setIsDisplay,
  setCanvasCount,
  canvasCount,
  setSelectedChannels,
  selectedChannels,
  SetcurrentSnapshot,
  currentSnapshot,
  snapShotRef,
  SetZoom,
  Zoom,
  timeBase,
  setTimeBase,
  currentSamplingRate,
  setCurrentSamplingRate
}) => {
  const [isConnected, setIsConnected] = useState<boolean>(false); // State to track if the device is connected
  const isConnectedRef = useRef<boolean>(false); // Ref to track if the device is connected
  const isRecordingRef = useRef<boolean>(false); // Ref to track if the device is recording
  const [isEndTimePopoverOpen, setIsEndTimePopoverOpen] = useState(false);
  const [detectedBits, setDetectedBits] = useState<BitSelection | null>(null); // State to store the detected bits
  const detectedBitsRef = React.useRef<BitSelection>("ten");
  const [datasets, setDatasets] = useState<any[]>([]);
  const currentFilenameRef = useRef<string>("");
  const [isRecordButtonDisabled, setIsRecordButtonDisabled] = useState(false);
  const [recordingElapsedTime, setRecordingElapsedTime] = useState<number>(0); // State to store the recording duration
  const recordingStartTime = useRef<number>(0);
  const [customTime, setCustomTime] = useState<string>(""); // State to store the custom stop time input
  const [clickCount, setClickCount] = useState(0); // Track how many times the left arrow is clicked
  const endTimeRef = useRef<number | null>(null); // Ref to store the end time of the recording
  const [popoverVisible, setPopoverVisible] = useState(false);
  const portRef = useRef<SerialPort | null>(null); // Ref to store the serial port
  const [ifBits, setifBits] = useState<BitSelection>("auto");
  const canvasnumbersRef = useRef<number>(1);
  const maxCanvasCountRef = useRef<number>(1);
  const readerRef = useRef<
    ReadableStreamDefaultReader<Uint8Array> | null | undefined
  >(null); // Ref to store the reader for the serial port
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(
    null
  );
  const buffer: number[] = []; // Buffer to store incoming data
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const NUM_BUFFERS = 4;
  const MAX_BUFFER_SIZE = 500;
  const recordingBuffers = Array(NUM_BUFFERS)
    .fill(null)
    .map(() => [] as number[][]);
  const fillingindex = useRef<number>(0); // Initialize useRef with 0

  let activeBufferIndex = 0;
  const togglePause = () => {
    const newPauseState = !isDisplay;
    setIsDisplay(newPauseState);
    onPauseChange(newPauseState); // Notify parent about the change
    SetcurrentSnapshot(0);
    setClickCount(0);

  };

  const enabledClicks = (snapShotRef.current?.filter(Boolean).length ?? 0) - 1;

  // Enable/Disable left arrow button
  const handlePrevSnapshot = () => {
    if (clickCount < enabledClicks) {
      setClickCount(clickCount + 1);
    }

    if (currentSnapshot < 4) {
      SetcurrentSnapshot(currentSnapshot + 1);
    }
  };

  const toggleChannel = (channelIndex: number) => {
    setSelectedChannels((prevSelected) =>
      prevSelected.includes(channelIndex)
        ? prevSelected.filter((ch) => ch !== channelIndex)
        : [...prevSelected, channelIndex]
    );
  };
  useEffect(() => {
    setSelectedChannels(selectedChannels)
  }, [selectedChannels])

  // Handle right arrow click (reset count and disable button if needed)
  const handleNextSnapshot = () => {
    if (clickCount > 0) {
      setClickCount(clickCount - 1); // Reset count after right arrow click
    }
    if (currentSnapshot > 0) {
      SetcurrentSnapshot(currentSnapshot - 1);
    }
  };


  // const selectChannel = (channel: number) => {
  //   // Handle the channel selection logic here
  //   console.log(`Channel ${channel} selected`);
  //   setCanvasCount(channel);
  // };


  useEffect(() => {
    canvasnumbersRef.current = canvasCount; // Sync the ref with the state
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
    // Send canvasCount independently to the worker
    workerRef.current?.postMessage({ action: 'setCanvasCount', canvasCount: canvasnumbersRef.current });
  };
  setCanvasCountInWorker(canvasnumbersRef.current);

  const processBuffer = async (bufferIndex: number, canvasCount: number) => {
    if (!workerRef.current) {
      initializeWorker();
    }

    // If the buffer is empty, return early
    if (recordingBuffers[bufferIndex].length === 0) return;

    const data = recordingBuffers[bufferIndex];
    const filename = currentFilenameRef.current;

    if (filename) {
      // Check if the record already exists
      workerRef.current?.postMessage({ action: 'checkExistence', filename, canvasCount });
      writeToIndexedDB(data, filename, canvasCount);
    }
  };

  const writeToIndexedDB = (data: number[][], filename: string, canvasCount: number) => {
    workerRef.current?.postMessage({ action: 'write', data, filename, canvasCount });
  };

  const saveAllDataAsZip = async () => {
    try {
      if (workerRef.current) {
        workerRef.current.postMessage({ action: 'saveAsZip', canvasCount });

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
  const saveDataByFilename = async (filename: string, canvasCount: number) => {
    if (workerRef.current) {
      workerRef.current.postMessage({ action: "saveDataByFilename", filename, canvasCount });
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

  //////////////////////////////////////////

  const handleCustomTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Function to handle the custom time input change
    const value = e.target.value.replace(/[^0-9]/g, "");
    setCustomTime(value);
  };

  const handleCustomTimeSet = () => {
    // Function to handle the custom time input set
    const time = parseInt(customTime);
    if (!isNaN(time) && time > 0) {
      handleTimeSelection(time);
    } else {
      toast.error("Please enter a valid time in minutes");
    }
    setCustomTime("");
  };

  const formatPortInfo = useCallback(
    (info: SerialPortInfo, deviceName: string, fieldPid?: number) => {
      if (!info || !info.usbVendorId) {
        return { formattedInfo: "Port with no info", bits: null, channel: null };
      }
  
      // Find the board matching both name and field_pid
      const board = BoardsList.find(
        (b) =>
          b.name.toLowerCase() === deviceName.toLowerCase() &&
          (!fieldPid || parseInt(b.field_pid, 10) === fieldPid) // Match field_pid if provided
      );
    
      if (board) {
        setifBits(board.bits as BitSelection);
        setSelectedBits(board.bits as BitSelection);
        detectedBitsRef.current = board.bits as BitSelection;
  
        const channel = board.channel ? parseInt(board.channel, 10) : 0;
        maxCanvasCountRef.current = channel;
  
        if (board.sampling_rate) {
          setCurrentSamplingRate(parseInt(board.sampling_rate, 10));
        }
  
        return {
          formattedInfo: (
            <>
              {board.device_name} <br /> Product ID: {info.usbProductId}
            </>
          ),
          bits: board.bits,
          channel: board.channel,
        };
      }
  
      setDetectedBits(null);
      return { formattedInfo: `${deviceName}`, bits: null, channel: null };
    },
    []
  );
  
  const handleClick = () => {
    // Function to handle toggle for connect/disconnect button
    if (isConnected) {
      disconnectDevice();
    } else {
      connectToDevice();
    }
  };

  interface SavedDevice {
    usbVendorId: number;
    usbProductId: number;
    baudRate: number;
  }

  const connectToDevice = async () => {
    try {
      if (portRef.current && portRef.current.readable) {
        await disconnectDevice();
      }
  
      const savedPorts: SavedDevice[] = JSON.parse(localStorage.getItem('savedDevices') || '[]');
      let port: SerialPort | null = null;
      let baudRate = 230400; // Default baud rate
  
      const ports = await navigator.serial.getPorts();
      console.log(ports);
      // Check for saved ports
      if (savedPorts.length > 0) {
        port = ports.find((p) => {
          const info = p.getInfo();
          return savedPorts.some(
            (saved: SavedDevice) =>
              saved.usbVendorId === (info.usbVendorId ?? 0) &&
              saved.usbProductId === (info.usbProductId ?? 0)
          );
        }) || null;
      }
  
      if (!port) {
        port = await navigator.serial.requestPort();
        const newPortInfo = await port.getInfo();
  
        const usbVendorId = newPortInfo.usbVendorId ?? 0;
        const usbProductId = newPortInfo.usbProductId ?? 0;
  
        if (usbProductId === 29987 ) {
          baudRate = 115200;
        }
  
        const existingDevice = savedPorts.find(
          (saved) =>
            saved.usbVendorId === usbVendorId && saved.usbProductId === usbProductId
        );
  
        if (!existingDevice) {
          savedPorts.push({ usbVendorId, usbProductId, baudRate });
          localStorage.setItem('savedDevices', JSON.stringify(savedPorts));
          console.log(`New device saved: Vendor ${usbVendorId}, Product ${usbProductId}, Baud Rate ${baudRate}`);
        }
  
        await port.open({ baudRate });
      } else {
        const newPortInfo = port.getInfo();
        const usbProductId = newPortInfo.usbProductId ?? 0;
  
        if (usbProductId === 29987 ) {
          baudRate = 115200;
        }
  
        await port.open({ baudRate });
      }
  
      if (port.readable) {
        const reader = port.readable.getReader();
        readerRef.current = reader;
        const writer = port.writable?.getWriter();
        if (writer) {
          // Query the board for its name
          writerRef.current = writer;
  
          const whoAreYouMessage = new TextEncoder().encode("WHORU\n");
          await writerRef.current.write(whoAreYouMessage);
          setTimeout(() => writer.write(whoAreYouMessage), 2000);
  
          let buffer = "";
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
  
            if (value) {
              buffer += new TextDecoder().decode(value);
              if (buffer.includes("\n")) break;
            }
          }
  
          // Extract the device name
          const response: string | undefined = buffer.trim().split("\n").pop();
          const extractedName = response?.match(/[A-Za-z0-9\-]+$/)?.[0] ?? "Unknown Device";
          
          const currentPortInfo = port.getInfo(); // Ensure correct variable name and scope
          const usbProductId = currentPortInfo.usbProductId ?? 0; // Access usbProductId correctly
  
          // Pass the name and field_pid to formatPortInfo
          const { formattedInfo, bits, channel } = formatPortInfo(
            currentPortInfo,
            extractedName,
            usbProductId
          );
  
          toast.success("Connection Successful", {
            description: (
              <div className="mt-2 flex flex-col space-y-1">
                <p>Device: {formattedInfo}</p>
                <p>Baud Rate: {baudRate}</p>
                {bits && <p>Resolution: {bits} bits</p>}
                {channel && <p>Channel: {channel}</p>}
              </div>
            ),
          });
  
          const startMessage = new TextEncoder().encode("START\n");
          setTimeout(() => writer.write(startMessage), 2000);
        } else {
          console.error("Writable stream not available");
        }
      } else {
        console.error("Readable stream not available");
      }
  
      Connection(true);
      setIsConnected(true);
  
      onPauseChange(true);
      setIsDisplay(true);
      setCanvasCount(1);
      isConnectedRef.current = true;
      portRef.current = port;
  
      const data = await getFileCountFromIndexedDB();
      setDatasets(data); // Update datasets with the latest data
      readData();
      await navigator.wakeLock.request("screen");
    } catch (error) {
      await disconnectDevice();
      console.error("Error connecting to device:", error);
      toast.error("Failed to connect to device.");
    }
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
          if (writerRef.current) {
            writerRef.current.releaseLock();
            writerRef.current = null;
          }
        }
        snapShotRef.current?.fill(false);
        if (readerRef.current) {
          try {
            await readerRef.current.cancel();
          } catch (error) {
            console.error("Failed to cancel reader:", error);
          }
          if (readerRef.current) {
            readerRef.current.releaseLock();
            readerRef.current = null;
          }
        }

        // Close port
        if (portRef.current.readable) {
          await portRef.current.close();
        }
        portRef.current = null;

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
      setIsConnected(false);
      isConnectedRef.current = false;
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
  // Function to read data from a connected device and process it
  const readData = async (): Promise<void> => {
    const HEADER_LENGTH = 3; // Length of the packet header
    const NUM_CHANNELS = maxCanvasCountRef.current; // Number of channels in the data packet
    const PACKET_LENGTH = NUM_CHANNELS * 2 + HEADER_LENGTH + 1; // Total length of each packet
    const SYNC_BYTE1 = 0xc7; // First synchronization byte to identify the start of a packet
    const SYNC_BYTE2 = 0x7c; // Second synchronization byte
    const END_BYTE = 0x01; // End byte to signify the end of a packet
    let previousCounter: number | null = null; // Variable to store the previous counter value for loss detection
    const notchFilters = Array.from({ length: NUM_CHANNELS }, () => new Notch());
    const EXGFilters = Array.from({ length: NUM_CHANNELS }, () => new EXGFilter());

    notchFilters.forEach((filter) => {
      filter.setbits(detectedBitsRef.current); // Set the bits value for all instances
    });
    EXGFilters.forEach((filter) => {
      filter.setbits(detectedBitsRef.current); // Set the bits value for all instances
    });

    try {
      while (isConnectedRef.current) {
        const streamData = await readerRef.current?.read(); // Read data from the device
        if (streamData?.done) {
          // Check if the data stream has ended
          console.log("Thank you for using our app!"); // Log a message when the stream ends
          break; // Exit the loop if the stream is done
        }
        if (streamData) {
          const { value } = streamData; // Destructure the stream data to get its value
          buffer.push(...value); // Add the incoming data to the buffer
        }

        // Process packets while the buffer contains at least one full packet
        while (buffer.length >= PACKET_LENGTH) {
          // Find the index of the synchronization bytes in the buffer
          const syncIndex = buffer.findIndex(
            (byte, index) =>
              byte === SYNC_BYTE1 && buffer[index + 1] === SYNC_BYTE2
          );

          if (syncIndex === -1) {
            // If no sync bytes are found, clear the buffer and continue
            buffer.length = 0; // Clear the buffer
            continue;
          }

          if (syncIndex + PACKET_LENGTH <= buffer.length) {
            // Check if a full packet is available in the buffer
            const endByteIndex = syncIndex + PACKET_LENGTH - 1; // Calculate the index of the end byte

            if (
              buffer[syncIndex] === SYNC_BYTE1 &&
              buffer[syncIndex + 1] === SYNC_BYTE2 &&
              buffer[endByteIndex] === END_BYTE
            ) {
              const packet = buffer.slice(syncIndex, syncIndex + PACKET_LENGTH);
              const channelData: number[] = [packet[2]]; // Counter value

              selectedChannels
                .filter((channelIndex) => channelIndex >= 0 && channelIndex < NUM_CHANNELS)
                .forEach((channelIndex) => {
                  const dataStart = HEADER_LENGTH + channelIndex * 2;
                  if (dataStart + 1 < packet.length) {
                    const highByte = packet[dataStart];
                    const lowByte = packet[dataStart + 1];
                    const rawValue = (highByte << 8) | lowByte;
                    const filteredValue = notchFilters[channelIndex].process(
                      EXGFilters[channelIndex].process(
                        rawValue,
                        appliedEXGFiltersRef.current[channelIndex]
                      ),
                      appliedFiltersRef.current[channelIndex]
                    );
                    channelData.push(filteredValue);
                  } else {
                    console.error(`Invalid channel index ${channelIndex}`);
                  }
                });

              datastream(channelData); // Pass the filtered channel data
              buffer.splice(0, endByteIndex + 1);
            } else {
              buffer.splice(0, syncIndex + 1); // Remove until sync byte if packet is incomplete
            }
          } else {
            break; // Exit loop if packet is not fully available
          }
        }
      }
    } catch (error) {
      console.error("Error reading from device:", error); // Handle errors
    } finally {
      await disconnectDevice(); // Ensure the device is disconnected
    }
  };

  const existingRecordRef = useRef<any | undefined>(undefined);
  // Function to handle the recording process
  const handleRecord = async () => {
    if (isRecordingRef.current) {
      // Stop the recording if it is currently active
      stopRecording();
    } else {
      // Start a new recording session
      isRecordingRef.current = true;
      const now = new Date();
      recordingStartTime.current = Date.now();
      setRecordingElapsedTime(Date.now());
      setIsRecordButtonDisabled(true);

      const filename = `ChordsWeb-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-` +
        `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}.csv`;

      currentFilenameRef.current = filename;
    }
  };

  const stopRecording = async () => {
    if (!recordingStartTime) {
      toast.error("Recording start time was not captured.");
      return;
    }
    isRecordingRef.current = false;
    setRecordingElapsedTime(0);
    setIsRecordButtonDisabled(false);
    // setRecordingStartTime(0);
    recordingStartTime.current = 0;
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

  const deleteFilesByFilename = async (filename: string) => {
    try {
      const dbRequest = indexedDB.open("ChordsRecordings");

      dbRequest.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = db.transaction("ChordsRecordings", "readwrite");
        const store = transaction.objectStore("ChordsRecordings");

        // Check if the "filename" index exists
        if (!store.indexNames.contains("filename")) {
          console.error("Index 'filename' does not exist.");
          toast.error("Unable to delete files: index not found.");
          return;
        }

        const index = store.index("filename");
        const deleteRequest = index.openCursor(IDBKeyRange.only(filename));

        // Make this callback async
        deleteRequest.onsuccess = async (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

          if (cursor) {
            cursor.delete(); // Delete the current record
            // Fetch the updated data and update state
            const data = await getFileCountFromIndexedDB();
            setDatasets(data); // Update datasets with the latest data
          } else {
            console.log(`No file found with filename: ${filename}`);
            toast.success("File deleted successfully.");
          }
        };

        deleteRequest.onerror = () => {
          console.error("Error during delete operation.");
          toast.error("Failed to delete the file. Please try again.");
        };

        transaction.oncomplete = () => {
          console.log("File deletion transaction completed.");
        };

        transaction.onerror = () => {
          console.error("Transaction failed during deletion.");
          toast.error("Failed to delete the file. Please try again.");
        };
      };

      dbRequest.onerror = () => {
        console.error("Failed to open IndexedDB database.");
        toast.error("An error occurred while accessing the database.");
      };
    } catch (error) {
      console.error("Error occurred during file deletion:", error);
      toast.error("An unexpected error occurred. Please try again.");
    }
  };

  // Function to delete all data from IndexedDB (for ZIP files or clear all)
  const deleteAllDataFromIndexedDB = async () => {
    return new Promise<void>((resolve, reject) => {
      try {
        const dbRequest = indexedDB.open("ChordsRecordings", 2);

        dbRequest.onerror = (error) => {
          console.error("Failed to open IndexedDB:", error);
          reject(new Error("Failed to open database"));
        };

        dbRequest.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;

          // Start a transaction and get the object store
          const transaction = db.transaction(["ChordsRecordings"], "readwrite");
          const store = transaction.objectStore("ChordsRecordings");

          // Clear all records from the store
          const clearRequest = store.clear();

          clearRequest.onsuccess = () => {
            // Close the database connection
            db.close();

            setDatasets([]);
            setPopoverVisible(false);
            toast.success("All files deleted successfully.");
            resolve();
          };

          clearRequest.onerror = (error) => {
            console.error("Failed to clear IndexedDB store:", error);
            toast.error("Failed to delete all files. Please try again.");
            reject(error);
          };

          transaction.onerror = (error) => {
            console.error("Transaction failed:", error);
            toast.error("Failed to delete all files. Please try again.");
            reject(error);
          };
        };

        dbRequest.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;

          // Create the object store if it doesn't exist
          if (!db.objectStoreNames.contains("ChordsRecordings")) {
            const store = db.createObjectStore("ChordsRecordings", {
              keyPath: "filename",

            });
            store.createIndex("filename", "filename", { unique: false });

          }
        };

      } catch (error) {
        console.error("Error in deleteAllDataFromIndexedDB:", error);
        reject(error);
      }
    });
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
                        value={customTime}
                        onBlur={handleCustomTimeSet}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleCustomTimeSet()
                        }
                        onChange={handleCustomTimeChange}
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
              <Button className="flex items-center justify-center gap-1 py-2 px-2 sm:py-3 sm:px-4 rounded-xl font-semibold" onClick={handleClick}>
                {isConnected ? (
                  <>
                    Disconnect
                    <CircleX size={17} />
                  </>
                ) : (
                  <>
                    Connect
                    <Cable size={17} />
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isConnected ? "Disconnect Device" : "Connect Device"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {/* Display (Play/Pause) button with tooltip */}
        {isConnected && (
          <div className="flex items-center gap-0.5 mx-0 px-0">
            <Button
              className="rounded-xl rounded-r-none"
              onClick={handlePrevSnapshot}
              disabled={isDisplay || clickCount >= enabledClicks}

            >
              <ArrowLeftToLine size={16} />
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button className="rounded-xl rounded-l-none rounded-r-none" onClick={togglePause}>
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
              disabled={isDisplay || clickCount == 0}
            >
              <ArrowRightToLine size={16} />
            </Button>
          </div>
        )}

        {/* Record button with tooltip */}
        {isConnected && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="rounded-xl"
                  onClick={handleRecord}

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
        {isConnected && (
          <TooltipProvider>
            <div className="flex">
              <Popover>
                <PopoverTrigger asChild>
                  <Button className="rounded-xl p-4">
                    <FileArchive size={16} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-4 bg-white shadow-lg rounded-xl w-full">
                  <div className="space-y-4">
                    {/* List each file with download and delete actions */}
                    {datasets.length > 0 ? (
                      datasets.map((dataset) => (
                        <div key={dataset} className="flex justify-between items-center">
                          {/* Display the filename directly */}
                          <span className="font-medium mr-4 text-black">
                            {dataset}
                          </span>

                          <div className="flex space-x-2">
                            {/* Save file by filename */}
                            <Button
                              onClick={() => saveDataByFilename(dataset, canvasCount)}
                              className="rounded-xl px-4"
                            >
                              <Download size={16} />
                            </Button>

                            {/* Delete file by filename */}
                            <Button
                              onClick={() => {
                                deleteFilesByFilename(dataset);
                              }}
                              className="rounded-xl px-4"
                            >
                              <Trash2 size={16} />
                            </Button>

                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-black ">No datasets available</p>
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

        {isConnected && (
          <Popover
            open={isFilterPopoverOpen}
            onOpenChange={setIsFilterPopoverOpen}
          >
            <PopoverTrigger asChild>
              <Button
                className="flex items-center justify-center px-3 py-2 select-none min-w-12 whitespace-nowrap rounded-xl"
                disabled={!isDisplay}

              >
                Filter
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-50 p-4 mx-4 mb-2">
              <div className="flex flex-col ">
                <div className="flex items-center pb-2 ">
                  {/* Filter Name */}
                  <div className="text-sm font-semibold w-12"><ReplaceAll size={20} /></div>
                  {/* Buttons */}
                  <div className="flex space-x-2">
                    <div className="flex items-center border border-input rounded-xl mx-0 px-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeEXGFilterFromAllChannels([0, 1, 2, 3, 4, 5])}
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
                        onClick={() => applyEXGFilterToAllChannels([0, 1, 2, 3, 4, 5], 4)}
                        className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                        ${Object.keys(appliedEXGFiltersRef.current).length === 6 && Object.values(appliedEXGFiltersRef.current).every((value) => value === 4)
                            ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                            : "bg-white-500" // Active background
                          }`}
                      >
                        <BicepsFlexed size={17} />
                      </Button> <Button
                        variant="outline"
                        size="sm"
                        onClick={() => applyEXGFilterToAllChannels([0, 1, 2, 3, 4, 5], 3)}
                        className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                        ${Object.keys(appliedEXGFiltersRef.current).length === 6 && Object.values(appliedEXGFiltersRef.current).every((value) => value === 3)
                            ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                            : "bg-white-500" // Active background
                          }`}
                      >
                        <Brain size={17} />
                      </Button> <Button
                        variant="outline"
                        size="sm"
                        onClick={() => applyEXGFilterToAllChannels([0, 1, 2, 3, 4, 5], 1)}
                        className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                        ${Object.keys(appliedEXGFiltersRef.current).length === 6 && Object.values(appliedEXGFiltersRef.current).every((value) => value === 1)
                            ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                            : "bg-white-500" // Active background
                          }`}
                      >
                        <Heart size={17} />
                      </Button> <Button
                        variant="outline"
                        size="sm"
                        onClick={() => applyEXGFilterToAllChannels([0, 1, 2, 3, 4, 5], 2)}
                        className={`rounded-xl rounded-l-none border-0
                        ${Object.keys(appliedEXGFiltersRef.current).length === 6 && Object.values(appliedEXGFiltersRef.current).every((value) => value === 2)
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
                        onClick={() => removeNotchFromAllChannels([0, 1, 2, 3, 4, 5])}
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
                        onClick={() => applyFilterToAllChannels([0, 1, 2, 3, 4, 5], 1)}
                        className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                          ${Object.keys(appliedFiltersRef.current).length === 6 && Object.values(appliedFiltersRef.current).every((value) => value === 1)
                            ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                            : "bg-white-500" // Active background
                          }`}
                      >
                        50Hz
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => applyFilterToAllChannels([0, 1, 2, 3, 4, 5], 2)}
                        className={`rounded-xl rounded-l-none border-0
                          ${Object.keys(appliedFiltersRef.current).length === 6 && Object.values(appliedFiltersRef.current).every((value) => value === 2)
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
                  {["CH1", "CH2", "CH3", "CH4", "CH5", "CH6"].map((filterName, index) => (
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
        {isConnected && (
          <Popover>
            <PopoverTrigger asChild>
              <Button className="flex items-center justify-center select-none whitespace-nowrap rounded-xl">
                <Settings size={16} />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[43rem] p-6 rounded-lg shadow-lg  text-base">

              <TooltipProvider>
                <div className="space-y-8">

                  {/* Channel Selection */}
                  <div className="flex items-center justify-center bg-gray-100">
                    {/* Curved Container */}
                    <div className="relative rounded-xl bg-gray-300 w-full py-2">
                      {/* Background overlay */}
                      <div className="absolute inset-0 rounded-xl bg-gray-100 opacity-50 pointer-events-none"></div>

                      {/* Buttons */}
                      <div id="button-container" className="relative space-y-4">
                        {Array.from({ length: 2 }).map((_, row) => (
                          <div key={row} className="grid grid-cols-8 gap-4">
                            {Array.from({ length: 8 }).map((_, col) => {
                              const index = row * 8 + col;
                              const isFaded = index >= maxCanvasCountRef.current;

                              return (
                                <button
                                  key={index}
                                  onClick={() => !isFaded && toggleChannel(index + 1)}
                                  disabled={isFaded || isRecordButtonDisabled}
                                  className={`
            w-15 h-10 rounded-lg text-sm font-medium m-2
            ${isFaded
                                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                      : selectedChannels.includes(index + 1)
                                        ? 'bg-gray-500 text-white'
                                        : 'bg-gray-300 text-gray-700'
                                    }
          `}
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

                  {/* Zoom Controls */}
                  <div className="relative flex flex-col items-start w-full">
                    {/* Label */}
                    <p className="absolute top-[-1.5rem] left-0 text-base font-semibold text-[0.7rem] text-gray-500">
                      <span className="font-bold text-gray-700">ZOOM LEVEL:</span> {Zoom} X
                    </p>

                    {/* Slider with min and max values */}
                    <div className="relative w-[40rem] flex items-center rounded-xl bg-gray-100 py-3">
                      {/* Min value */}
                      <p className="text-gray-800 mx-2 px-2">1</p>

                      {/* Slider */}
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={Zoom}
                        onChange={(e) => SetZoom(Number(e.target.value))}
                        className="flex-1 h-[0.2rem] appearance-none bg-gray-200 focus:outline-none focus:ring-0 slider-input"
                      />

                      {/* Max value */}
                      <p className="text-gray-800 mx-2 px-2">10</p>

                      <style jsx>{`
      input[type="range"] {
        background: linear-gradient(
          to
right,rgb(79, 80, 82) ${(Zoom - 1) * 11.11}%,
rgb(161, 159, 159) ${(Zoom - 1) * 11.11}%
        );
      }

      input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 15px;
        height: 15px;
        background-color: rgb(73, 74, 75);
        border-radius: 50%;
      }
    `}</style>
                    </div>
                  </div>

                  {/* Value Selection */}
                  <div className="relative w-full flex flex-col items-start mt-4">
                    {/* Label */}
                    <p className="absolute top-[-1.5rem] left-0 text-[0.60rem] font-semibold text-gray-500">
                      <span className="font-bold text-gray-700">TIME BASE:</span> {timeBase} SECONDS
                    </p>

                    {/* Slider with curved container and faded colors */}
                    <div className="relative w-[40rem] flex items-center rounded-xl bg-gray-100 py-3">
                      {/* Min value */}
                      <p className="text-gray-800 mx-2 px-2">1</p>

                      {/* Slider */}
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={timeBase}
                        onChange={(e) => setTimeBase(Number(e.target.value))}
                        style={{
                          background: `linear-gradient(to right,rgb(76, 76, 78) ${((timeBase - 1) / 9) * 100
                            }%, rgb(161, 159, 159) ${((timeBase - 1) / 9) * 11}%)`,
                        }}
                        className="flex-1 h-[0.2rem] rounded-full appearance-none focus:outline-none focus:ring-0"
                      />

                      {/* Max value */}
                      <p className="text-gray-800 mx-2 px-2">10</p>

                      {/* Custom thumb color */}
                      <style jsx>{`
      input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 15px;
        height: 15px;
        background-color: rgb(76, 76, 79); /* Custom color */
        border-radius: 50%;
        cursor: pointer;
      }
    `}</style>
                    </div>
                  </div>

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

