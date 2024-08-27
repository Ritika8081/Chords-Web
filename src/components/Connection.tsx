"use client";
import React, { useState, useRef, useCallback } from "react";
import { Button } from "./ui/button";
import { SmoothieChart } from "smoothie";
import { Input } from "./ui/input";
import {
  Cable,
  Circle,
  CircleStop,
  CircleX,
  FileArchive,
  FileDown,
  Infinity,
  ArrowUp,
  Trash2,
  Download,
  Pause,
  Play,
  Grid,
  List,
} from "lucide-react";
import { vendorsList } from "./vendors";
import { BoardsList } from "./UDL_Boards";
import { toast } from "sonner";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { BitSelection } from "./DataPass";

import { Separator } from "./ui/separator";
import { Switch } from "../components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ConnectionProps {
  LineData: Function;
  Connection: (isConnected: boolean) => void;
  selectedBits: BitSelection;
  setSelectedBits: React.Dispatch<React.SetStateAction<BitSelection>>;
  isGridView: boolean;
  setIsGridView: React.Dispatch<React.SetStateAction<boolean>>;
  isDisplay: boolean;
  setIsDisplay: React.Dispatch<React.SetStateAction<boolean>>;
}

const Connection: React.FC<ConnectionProps> = ({
  LineData,
  Connection,
  selectedBits,
  setSelectedBits,
  isGridView,
  setIsGridView,
  isDisplay,
  setIsDisplay,
}) => {
  const [open, setOpen] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean>(false); // State to track if the device is connected
  const isConnectedRef = useRef<boolean>(false); // Ref to track if the device is connected
  const isRecordingRef = useRef<boolean>(false); // Ref to track if the device is recording
  const [isEndTimePopoverOpen, setIsEndTimePopoverOpen] = useState(false);
  const [detectedBits, setDetectedBits] = useState<BitSelection | null>(null); // State to store the detected bits
  const [indexTracker, setIndexTracker] = useState<number[]>([]); //keep track of indexes of files
  const [counter, setCounter] = useState<number>(0);
  const [datasets, setDatasets] = useState<string[][][]>([]); // State to store the recorded datasets
  const [elapsedTime, setElapsedTime] = useState<number>(0); // State to store the recording duration
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null); // Ref to store the timer interval
  const [customTime, setCustomTime] = useState<string>(""); // State to store the custom stop time input
  const endTimeRef = useRef<number | null>(null); // Ref to store the end time of the recording
  const startTimeRef = useRef<number | null>(null); // Ref to store the start time of the recording
  const bufferRef = useRef<string[][]>([]); // Ref to store the data temporary buffer during recording
  const chartRef = useRef<SmoothieChart[]>([]); // Define chartRef using useRef
  const portRef = useRef<SerialPort | null>(null); // Ref to store the serial port
  // const [isPaused, setIsPaused] = useState<boolean>(false); // State to track if the data display is pause
  const readerRef = useRef<
    ReadableStreamDefaultReader<Uint8Array> | null | undefined
  >(null); // Ref to store the reader for the serial port

  const handleTimeSelection = (minutes: number | null) => {
    // Function to handle the time selection
    if (minutes === null) {
      endTimeRef.current = null;
      toast.success("Recording set to no time limit");
    } else {
      // If the time is not null, set the end time
      const newEndTimeSeconds = minutes * 60;
      if (newEndTimeSeconds <= elapsedTime) {
        // Check if the end time is greater than the current elapsed time
        toast.error("End time must be greater than the current elapsed time");
      } else {
        endTimeRef.current = newEndTimeSeconds; // Set the end time
        toast.success(`Recording end time set to ${minutes} minutes`);
      }
    }
  };

  const handleCustomTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Function to handle the custom time input change
    const value = e.target.value.replace(/[^0-9]/g, "");
    setCustomTime(value);
  };
  //Function to delete all saved files
  const deletedataall = () => {
    setDatasets([]);
    deleteDataFromIndexedDB();
  };

  const deleteindividualfiles = (index: number) => {
    const newDatasets = datasets.filter((item, i) => i !== index);
    setDatasets(newDatasets);
    const newRemovedIndexes = indexTracker.filter((item, i) => i !== index);
    // setRemovedIndexes((prevIndexes) => [...prevIndexes, index]);
    setIndexTracker(newRemovedIndexes);
    deleteDataFromIndexedDB();
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
    // Function to format the port info, which includes the board name and product ID in toast message
    (info: SerialPortInfo) => {
      if (!info || !info.usbVendorId) {
        return "Port with no info";
      }

      // First, check if the board exists in BoardsList
      const board = BoardsList.find(
        (b) => parseInt(b.field_pid) === info.usbProductId
      );
      if (board) {
        setDetectedBits(board.bits as BitSelection); // Set the detected bits
        setSelectedBits(board.bits as BitSelection); // Set the selected bits
        return `${board.name} | Product ID: ${info.usbProductId}`; // Return the board name and product ID
      }

      setDetectedBits(null);

      // If not found in BoardsList, fall back to the vendor check
      const vendorName =
        vendorsList.find((d) => parseInt(d.field_vid) === info.usbVendorId)
          ?.name ?? "Unknown Vendor";
      return `${vendorName} | Product ID: ${info.usbProductId}`;
    },
    [setSelectedBits]
  );

  const handleClick = () => {
    // Function to handle toggle for connect/disconnect button
    if (isConnected) {
      disconnectDevice();
    } else {
      connectToDevice();
    }
  };

  const connectToDevice = async () => {
    // Function to connect to the device
    try {
      const port = await navigator.serial.requestPort(); // Request the serial port
      await port.open({ baudRate: 57600}); // Open the port with baud rate 115200
      Connection(true); // Set the connection state to true, which will enable the data visualization as it is getting used is DataPaas
      setIsConnected(true);
      isConnectedRef.current = true;
      portRef.current = port;
      toast.success("Connection Successfull", {
        description: (
          <div className="mt-2 flex flex-col space-y-1">
            <p>Device: {formatPortInfo(portRef.current.getInfo())}</p>
            <p>Baud Rate: 57600</p>
          </div>
        ),
      });
      const reader = port.readable?.getReader();
      readerRef.current = reader;
      readData(); // Start reading the data from the device
      await navigator.wakeLock.request("screen"); // Request the wake lock to keep the screen on
    } catch (error) {
      // If there is an error during connection, disconnect the device
      disconnectDevice();
      isConnectedRef.current = false;
      setIsConnected(false);
      console.error("Error connecting to device:", error);
    }
  };

  const disconnectDevice = async (): Promise<void> => {
    // Function to disconnect the device
    try {
      if (portRef.current && portRef.current.readable) {
        // Check if the port is available and readable
        if (readerRef.current) {
          await readerRef.current.cancel(); // Cancel the reader
          readerRef.current.releaseLock(); // Release the reader lock
        }
        await portRef.current.close();
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
      Connection(false);
      isConnectedRef.current = false;
      isRecordingRef.current = false;
    }
  };

  let packetCounter = 0; // Initialize the packet counter

  const readData = async (): Promise<void> => {
    // Function to read the data from the device
    const packetLength = 17; // Packet length from the Arduino (17 bytes)
    let buffer = new Uint8Array(packetLength); // Buffer to store the received data
    let bufferIndex = 0; // Index to keep track of the buffer position

    while (isConnectedRef.current) {
        // Loop until the device is connected
        try {
            const streamData = await readerRef.current?.read(); // Read the data from the device
            if (streamData?.done) {
                console.log("Thank you for using our app!");
                break;
            }

            const receivedData = streamData?.value; // Received raw data as Uint8Array
            if (receivedData) {
                for (let i = 0; i < receivedData.length; i++) {
                    buffer[bufferIndex++] = receivedData[i]; // Store data in the buffer
                    if (bufferIndex === packetLength) {
                        // If a full packet is received
                        processPacket(buffer); // Process the received packet
                        bufferIndex = 0; // Reset the buffer index
                    }
                }
            }
        } catch (error) {
            console.error("Error reading from device:", error);
            break;
        }
    }
    await disconnectDevice();
};

const processPacket = (buffer: Uint8Array): void => {
  if (buffer.length !== 17) {
      console.error("Invalid packet length");
      return;
  }

  // Extract the 6 ADC channel values from the buffer
  const channelData = [];
  for (let i = 0; i < 6; i++) {
      let highByte = buffer[4 + i * 2];
      let lowByte = buffer[5 + i * 2];
      let value = (highByte << 8) | lowByte; // Combine high and low bytes
      channelData.push(value.toString()); // Convert the number to a string
  }

  console.log("Channels:", channelData); // Log the channel data

  LineData(channelData); // Pass the string array to the LineData function
  if (isRecordingRef.current) {
      bufferRef.current.push(channelData); // Push the string array to the buffer if recording is on
    }
  };

  const columnNames = [
    "Counter",
    "Channel 1",
    "Channel 2",
    "Channel 3",
    "Channel 4",
  ];

  const convertToCSV = (buffer: string[][]): string => {
    // Function to convert the buffer data to CSV
    const headerRow = columnNames.join(",");
    const rows = buffer.map((row) => row.map(Number).join(","));
    const csvData = [headerRow, ...rows].join("\n");
    return csvData;
  };

  const handleRecord = () => {
    if (isConnected) {
      if (isRecordingRef.current) {
        stopRecording(); // Stop the recording if it is already on
      } else {
        isRecordingRef.current = true; // Set the recording state to true
        const now = new Date();
        const nowTime = now.getTime();
        startTimeRef.current = nowTime;
        setElapsedTime(0);
        timerIntervalRef.current = setInterval(checkRecordingTime, 1000);
      }
    } else {
      toast.warning("No device is connected");
    }
  };

  const checkRecordingTime = () => {
    setElapsedTime((prev) => {
      const newElapsedTime = prev + 1; // Increment the elapsed time by 1 second every second
      if (endTimeRef.current !== null && newElapsedTime >= endTimeRef.current) {
        stopRecording();
        return endTimeRef.current;
      }
      return newElapsedTime;
    });
  };

  const formatDuration = (durationInSeconds: number): string => {
    const minutes = Math.floor(durationInSeconds / 60); // Get the minutes
    const seconds = durationInSeconds % 60;
    if (minutes === 0) {
      return `${seconds} second${seconds !== 1 ? "s" : ""}`;
    }
    return `${minutes} minute${minutes !== 1 ? "s" : ""} ${seconds} second${
      seconds !== 1 ? "s" : ""
    }`;
  };

  const stopRecording = () => {
    if (timerIntervalRef.current) {
      // Clear the timer interval if it is set
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (startTimeRef.current === null) {
      // Check if the start time is set properly
      toast.error("Start time was not set properly.");
      return;
    }

    const endTime = new Date();
    const endTimeString = endTime.toLocaleTimeString();
    const startTimeString = new Date(startTimeRef.current).toLocaleTimeString();
    const durationInSeconds = Math.round(
      (endTime.getTime() - startTimeRef.current) / 1000
    );
    if (bufferRef.current.length > 0) {
      const data = [...bufferRef.current]; // Create a copy of the current buffer
      setDatasets((prevDatasets) => {
        const newDatasets = [...prevDatasets, data];
        return newDatasets;
      });
      bufferRef.current = [];
      setIndexTracker((prevIndexes) => [...prevIndexes, counter]); // Clear the buffer ref
      let newCounter = counter + 1;
      setCounter(newCounter);
    }

    toast.success("Recording completed Successfully", {
      description: (
        <div className="mt-2 flex flex-col mb-4">
          <p>Start Time: {startTimeString}</p>
          <p>End Time: {endTimeString}</p>
          <p>Recording Duration: {formatDuration(durationInSeconds)}</p>
          <p>Stored Recorded Files: {datasets.length + 1}</p>
        </div>
      ),
    });

    isRecordingRef.current = false;

    startTimeRef.current = null;
    endTimeRef.current = null;
    setElapsedTime(0);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  // Initialize IndexedDB
  const initIndexedDB = async (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("adcReadings", 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("adcReadings")) {
          db.createObjectStore("adcReadings", {
            keyPath: "id",
            autoIncrement: true,
          });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  };

  // Save buffer data to IndexedDB
  const saveBufferToIndexedDB = async (buffer: string[][]) => {
    if (buffer.length === 0) return;

    try {
      const db = await initIndexedDB();
      const tx = db.transaction(["adcReadings"], "readwrite");
      const store = tx.objectStore("adcReadings");

      buffer.forEach((row) => {
        store.add({
          counter: Number(row[0]),
          channel_1: Number(row[1]),
          channel_2: Number(row[2]),
          channel_3: Number(row[3]),
          channel_4: Number(row[4]),
        });
      });

      tx.oncomplete = () =>
        console.log("Transaction complete: Data saved to IndexedDB");
      tx.onerror = (error) => console.error("Transaction error:", error);
    } catch (error) {
      console.error("Error saving buffer to IndexedDB:", error);
    }
  };

  // Retrieve and display data from IndexedDB
  const displayDataFromIndexedDB = async () => {
    try {
      const db = await initIndexedDB();
      const tx = db.transaction(["adcReadings"], "readonly");
      const store = tx.objectStore("adcReadings");

      const request = store.getAll();
      request.onsuccess = () => {
        const data = request.result;
        console.log("Data currently in IndexedDB:", data);
      };
      request.onerror = (error) => {
        console.error("Error retrieving data from IndexedDB:", error);
      };
    } catch (error) {
      console.error("Error initializing IndexedDB for display:", error);
    }
  };

  // Delete all data from IndexedDB
  const deleteDataFromIndexedDB = async () => {
    try {
      const db = await initIndexedDB();
      const tx = db.transaction(["adcReadings"], "readwrite");
      const store = tx.objectStore("adcReadings");

      const clearRequest = store.clear();
      clearRequest.onsuccess = () =>
        console.log("All data deleted from IndexedDB");
      clearRequest.onerror = (error) =>
        console.error("Error deleting data from IndexedDB:", error);
    } catch (error) {
      console.error("Error initializing IndexedDB for deletion:", error);
    }
  };

  // Save data to IndexedDB and then download it
  const saveData = async () => {
    if (datasets.length === 0) {
      toast.error("No data available to download.");
      return;
    }

    // Save each dataset to IndexedDB
    for (const dataset of datasets) {
      await saveBufferToIndexedDB(dataset);
      await displayDataFromIndexedDB(); // Display data after each save
    }

    // Wait for user confirmation before downloading
    const confirmed = window.confirm("Do you want to download the saved data?");
    if (!confirmed) return;

    // Proceed with saving as CSV or ZIP
    if (datasets.length === 1) {
      const csvData = convertToCSV(datasets[0]);
      const blob = new Blob([csvData], { type: "text/csv;charset=utf-8" });
      saveAs(blob, "data.csv");
      await deleteDataFromIndexedDB(); // Delete data after download
    } else if (datasets.length > 1) {
      const zip = new JSZip();
      datasets.forEach((data, index) => {
        const csvData = convertToCSV(data);
        zip.file(`data${index + 1}.csv`, csvData);
      });
      const zipContent = await zip.generateAsync({ type: "blob" });
      saveAs(zipContent, "datasets.zip");
      await deleteDataFromIndexedDB(); // Delete data after download
    }
  };

  // Save individual dataset and then download it
  const saveDataIndividual = async (index: number) => {
    await saveBufferToIndexedDB(datasets[index]);
    await displayDataFromIndexedDB(); // Display data before download

    // Wait for user confirmation before downloading
    const confirmed = window.confirm("Do you want to download the saved data?");
    if (!confirmed) return;

    const csvData = convertToCSV(datasets[index]);
    const blob = new Blob([csvData], { type: "text/csv;charset=utf-8" });
    saveAs(blob, `data${index + 1}.csv`);
    await deleteDataFromIndexedDB(); // Delete data after download
  };

  return (
    <div className="flex h-14 items-center justify-between px-4">
      <div className="flex-1">
        {isRecordingRef.current && (
          <div className="flex justify-center items-center space-x-1 w-min mx-4">
            <div className="font-medium p-2 w-16 inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm ring-offset-background transition-colors bg-primary text-destructive hover:bg-primary/90">
              {formatTime(elapsedTime)}
            </div>
            <Separator orientation="vertical" className="bg-primary h-9" />
            <div className="">
              <Popover
                open={isEndTimePopoverOpen}
                onOpenChange={setIsEndTimePopoverOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    className="text-lg w-16 h-9 font-medium p-2"
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
      <div className="flex gap-4 flex-1 justify-center">
        <Button className="bg-primary gap-2" onClick={handleClick}>
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
        {isConnected && (
          <div className="flex items-center space-x-2">
            {detectedBits ? (
              <Button
                variant={selectedBits === "auto" ? "outline" : "default"}
                className={`w-36 flex justify-center items-center overflow-hidden`}
                onClick={() =>
                  setSelectedBits(
                    selectedBits === "auto" ? detectedBits : "auto"
                  )
                }
              >
                Autoscale
              </Button>
            ) : (
              <Select
                onValueChange={(value) =>
                  setSelectedBits(value as BitSelection)
                }
                value={selectedBits}
              >
                <SelectTrigger className="w-32 text-background bg-primary">
                  <SelectValue placeholder="Select bits" />
                </SelectTrigger>
                <SelectContent side="top">
                  <SelectItem value="ten">10 bits</SelectItem>
                  <SelectItem value="twelve">12 bits</SelectItem>
                  <SelectItem value="fourteen">14 bits</SelectItem>
                  <SelectItem value="auto">Auto Scale</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        )}
        {isConnected && (
          <TooltipProvider>
            <Tooltip>
              <Button onClick={handleRecord}>
                <TooltipTrigger asChild>
                  {isRecordingRef.current ? (
                    <CircleStop />
                  ) : (
                    <Circle fill="red" />
                  )}
                </TooltipTrigger>
              </Button>
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
        {isConnected && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="bg-primary gap-2"
                  onClick={() => setIsGridView(!isGridView)}
                >
                  {isGridView ? <List size={20} /> : <Grid size={20} />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isGridView ? "Grid" : "List"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {isConnected && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={() => setIsDisplay(!isDisplay)}>
                  {isDisplay ? (
                    <Pause className="h-5 w-5" /> // Show Pause icon when playing
                  ) : (
                    <Play className="h-5 w-5" /> // Show Play icon when paused
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
        )}
        {isConnected && datasets.length >= 0 && (
          <TooltipProvider>
            <Tooltip>
              <div className="flex">
                {datasets.length === 1 && (
                  <TooltipTrigger asChild>
                    <Button className="rounded-r-none" onClick={saveData}>
                      <FileDown className="mr-2" />
                    </Button>
                  </TooltipTrigger>
                )}
                <Separator orientation="vertical" className="h-full" />
                {datasets.length === 1 ? (
                  <Button className="rounded-l-none" onClick={deletedataall}>
                    <Trash2 size={20} />
                  </Button>
                ) : (
                  <>
                    <Popover open={open} onOpenChange={setOpen}>
                      <PopoverTrigger asChild>
                        <Button className="rounded-r-none mr-1">
                          <FileArchive className="mr-2" />
                          <p className="text-lg">{datasets.length}</p>
                        </Button>
                      </PopoverTrigger>
                      <Button
                        className="rounded-l-none"
                        onClick={deletedataall}
                      >
                        <Trash2 size={20} />
                      </Button>
                      <PopoverContent className="w-80">
                        <div className="space-y-4 ">
                          <div className="flex justify-between items-center">
                            <span className="text-red-500">ZipFile</span>
                            <div className="space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={saveData}
                              >
                                <Download size={16} />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={deletedataall}
                              >
                                <Trash2 size={16} />
                              </Button>
                            </div>
                          </div>
                          {datasets.map((dataset, index) => (
                            <div
                              key={index}
                              className="flex justify-between items-center"
                            >
                              <span>File{indexTracker[index]}.csv</span>
                              <div className="space-x-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => saveDataIndividual(index)}
                                >
                                  <Download size={16} />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => deleteindividualfiles(index)}
                                >
                                  <Trash2 size={16} />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </>
                )}
              </div>
              <TooltipContent>
                {datasets.length === 1 ? (
                  <p>Save As CSV</p>
                ) : (
                  <p>Save As Zip</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="flex-1"></div>
    </div>
  );
};

export default Connection;
