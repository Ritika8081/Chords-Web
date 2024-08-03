import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useTheme } from "next-themes";
import BandPowerGraph from "./BandPowerGraph";
import webfft from "webfft";

interface FFTGraphProps {
  data: string;
  maxFreq?: number;
}

const FFTGraph: React.FC<FFTGraphProps> = ({ data, maxFreq = 60 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fftData, setFftData] = useState<number[][]>([[], [], [], []]);
  const fftSize = 128;
  const samplingRate = 250;
  const fftBufferRef = useRef<number[][]>([[], [], [], []]);
  const { theme } = useTheme();

  const channelColors = useMemo(() => ["red", "green", "blue", "purple"], []);
  const [maxFrequencies, setMaxFrequencies] = useState<number[]>([0, 0, 0, 0]);

  const removeDCComponent = (buffer: number[]): number[] => {
    const mean = buffer.reduce((sum, val) => sum + val, 0) / buffer.length;
    return buffer.map((val) => val - mean);
  };

  const applyHighPassFilter = (
    buffer: number[],
    cutoffFreq: number
  ): number[] => {
    const rc = 1 / (2 * Math.PI * cutoffFreq);
    const dt = 1 / samplingRate;
    const alpha = rc / (rc + dt);
    let filteredBuffer = new Array(buffer.length);
    filteredBuffer[0] = buffer[0];
    for (let i = 1; i < buffer.length; i++) {
      filteredBuffer[i] =
        alpha * (filteredBuffer[i - 1] + buffer[i] - buffer[i - 1]);
    }
    return filteredBuffer;
  };

  // const fft = useCallback((signal: number[]): { re: number; im: number }[] => {
  //   const n = signal.length;
  //   if (n <= 1) return signal.map((x) => ({ re: x, im: 0 }));

  //   const half = Math.floor(n / 2);
  //   const even = fft(signal.filter((_, i) => i % 2 === 0));
  //   const odd = fft(signal.filter((_, i) => i % 2 === 1));

  //   const a = new Array(n);
  //   for (let k = 0; k < half; k++) {
  //     const kth = (-2 * Math.PI * k) / n;
  //     const wk = { re: Math.cos(kth), im: Math.sin(kth) };
  //     const oddK = odd[k];
  //     const t = {
  //       re: wk.re * oddK.re - wk.im * oddK.im,
  //       im: wk.re * oddK.im + wk.im * oddK.re,
  //     };
  //     a[k] = {
  //       re: even[k].re + t.re,
  //       im: even[k].im + t.im,
  //     };
  //     a[k + half] = {
  //       re: even[k].re - t.re,
  //       im: even[k].im - t.im,
  //     };
  //   }
  //   return a;
  // }, []);
  const fftRef = useRef<webfft | null>(null);

  const performFFT = useCallback(
    (signal: number[], channelIndex: number): number[] => {
      if (!fftRef.current) {
        fftRef.current = new webfft(fftSize);
      }

      const inputArr = new Float32Array(fftSize * 2);
      for (let i = 0; i < fftSize; i++) {
        inputArr[i * 2] = signal[i];
        inputArr[i * 2 + 1] = 0;
      }

      const outputArr = fftRef.current.fft(inputArr);

      const magnitudes = new Array(fftSize / 2);
      let maxMagnitude = 0;
      let maxFrequencyIndex = 0;
      for (let i = 0; i < fftSize / 2; i++) {
        const re = outputArr[i * 2];
        const im = outputArr[i * 2 + 1];
        magnitudes[i] = Math.sqrt(re * re + im * im);
        if (magnitudes[i] > maxMagnitude) {
          maxMagnitude = magnitudes[i];
          maxFrequencyIndex = i;
        }
      }

      const maxFrequency = maxFrequencyIndex * (samplingRate / fftSize);
      setMaxFrequencies((prev) => {
        const newFrequencies = [...prev];
        newFrequencies[channelIndex] = maxFrequency;
        return newFrequencies;
      });

      return magnitudes;
    },
    [fftSize, samplingRate]
  );

  // const performFFT = useCallback(
  //   (signal: number[]): number[] => {
  //     const fft = new webfft(fftSize);

  //     // Create a complex input array (alternating real and imaginary parts)
  //     const inputArr = new Float32Array(fftSize * 2);
  //     for (let i = 0; i < fftSize; i++) {
  //       inputArr[i * 2] = signal[i]; // Real part
  //       inputArr[i * 2 + 1] = 0; // Imaginary part (0 for real signal)
  //     }

  //     const outputArr = fft.fft(inputArr);
  //     fft.dispose();

  //     // Convert complex output to magnitude
  //     const magnitudes = new Array(fftSize / 2);
  //     for (let i = 0; i < fftSize / 2; i++) {
  //       const re = outputArr[i * 2];
  //       const im = outputArr[i * 2 + 1];
  //       magnitudes[i] = Math.sqrt(re * re + im * im);
  //     }
  //     return magnitudes;
  //   },
  //   [fftSize]
  // );

  const applyHannWindow = (buffer: number[]): number[] => {
    return buffer.map(
      (value, index) =>
        value *
        (0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (buffer.length - 1)))
    );
  };

  // const processData = useCallback(
  //   (input: string) => {
  //     const lines = String(input).split("\n");
  //     lines.forEach((line) => {
  //       if (line.trim() !== "") {
  //         const values = line.split(",").map(Number);
  //         if (values.length >= 5) {
  //           for (let i = 0; i < 4; i++) {
  //             let sensorValue = values[i + 1];
  //             if (!isNaN(sensorValue)) {
  //               fftBufferRef.current[i].push(sensorValue);
  //               if (fftBufferRef.current[i].length >= fftSize) {
  //                 let processedBuffer = fftBufferRef.current[i];
  //                 processedBuffer = removeDCComponent(processedBuffer);
  //                 processedBuffer = applyHighPassFilter(processedBuffer, 0.5); // 0.5 Hz cutoff
  //                 const windowedBuffer = applyHannWindow(processedBuffer);
  //                 let fftResult = fft(windowedBuffer);
  //                 const newFftData = fftResult
  //                   .slice(0, fftSize / 2)
  //                   .map((c) => Math.sqrt(c.re * c.re + c.im * c.im));
  //                 setFftData((prevData) => {
  //                   const newData = [...prevData];
  //                   newData[i] = newFftData;
  //                   return newData;
  //                 });
  //                 fftBufferRef.current[i] = [];
  //               }
  //             }
  //           }
  //         }
  //       }
  //     });
  //   },
  //   [fftSize, fft]
  // );

  const processData = useCallback(
    (input: string) => {
      const lines = String(input).split("\n");
      lines.forEach((line) => {
        if (line.trim() !== "") {
          const values = line.split(",").map(Number);
          if (values.length >= 5) {
            for (let i = 0; i < 4; i++) {
              let sensorValue = values[i + 1];
              if (!isNaN(sensorValue)) {
                fftBufferRef.current[i].push(sensorValue);
                if (fftBufferRef.current[i].length >= fftSize) {
                  let processedBuffer = fftBufferRef.current[i];
                  processedBuffer = removeDCComponent(processedBuffer);
                  processedBuffer = applyHighPassFilter(processedBuffer, 0.5);
                  const windowedBuffer = applyHannWindow(processedBuffer);
                  const newFftData = performFFT(windowedBuffer, i);
                  setFftData((prevData) => {
                    const newData = [...prevData];
                    newData[i] = newFftData;
                    return newData;
                  });
                  fftBufferRef.current[i] = [];
                }
              }
            }
          }
        }
      });
    },
    [fftSize, performFFT]
  );

  useEffect(() => {
    if (data) {
      processData(data);
    }
  }, [data, processData]);

  const plotData = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    const width = canvas.width - 20;
    const height = canvas.height;

    const leftMargin = 80;
    const bottomMargin = 50;

    ctx.clearRect(0, 0, canvas.width, height);

    const axisColor = theme === "dark" ? "white" : "black";

    // Draw axes
    ctx.beginPath();
    ctx.moveTo(leftMargin, 10);
    ctx.lineTo(leftMargin, height - bottomMargin);
    ctx.lineTo(width - 10, height - bottomMargin);
    ctx.strokeStyle = axisColor;
    ctx.stroke();

    const freqStep = samplingRate / fftSize;
    const displayPoints = Math.min(Math.ceil(maxFreq / freqStep), fftSize / 2);

    const xScale = (width - leftMargin - 10) / displayPoints;

    const yMax = Math.max(
      ...fftData.flatMap((channel) => channel.slice(0, displayPoints))
    );
    const yScale = (height - bottomMargin - 10) / yMax;

    // Plot the data for each channel
    fftData.forEach((channelData, index) => {
      ctx.beginPath();
      ctx.strokeStyle = channelColors[index];
      for (let i = 0; i < displayPoints; i++) {
        const x = leftMargin + i * xScale;
        const y = height - bottomMargin - channelData[i] * yScale;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });

    // Draw labels and axes
    ctx.fillStyle = axisColor;
    ctx.font = "12px Arial";

    // Y-axis labels
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 5; i++) {
      const labelY =
        height - bottomMargin - (i / 5) * (height - bottomMargin - 10);
      ctx.fillText(((yMax * i) / 5).toFixed(1), leftMargin - 5, labelY);
    }

    // X-axis labels
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const numLabels = Math.min(maxFreq / 10, Math.floor(samplingRate / 2 / 10));
    for (let i = 0; i <= numLabels; i++) {
      const freq = i * 10;
      const labelX = leftMargin + (freq / freqStep) * xScale;
      ctx.fillText(freq.toString(), labelX, height - bottomMargin + 15);
    }

    ctx.font = "14px Arial";
    ctx.fillText("Frequency (Hz)", (width + leftMargin) / 2, height - 15);

    // Y-axis title
    ctx.save();
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Magnitude", -height / 2, 15);
    ctx.restore();
  }, [fftData, theme, maxFreq, samplingRate, fftSize, channelColors]);

  useEffect(() => {
    if (data) {
      processData(data);
    }
  }, [data, processData]);

  useEffect(() => {
    if (fftData.some((channel) => channel.length > 0)) {
      plotData();
    }
  }, [fftData, plotData]);

  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      plotData();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [plotData]);

  return (
    <div className="flex flex-col gap-2 w-full h-full">
      <div className="mt-4">
        <h3 className="text-lg font-semibold">Max Frequencies:</h3>
        <ul>
          {maxFrequencies.map((freq, index) => (
            <li key={index} style={{ color: channelColors[index] }}>
              Channel {index + 1}: {freq.toFixed(2)} Hz
            </li>
          ))}
        </ul>
      </div>
      <div
        ref={containerRef}
        className="w-full flex flex-col h-[300px] max-w-[700px]"
      >
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
      </div>
      <BandPowerGraph fftData={fftData} samplingRate={samplingRate} />
    </div>
  );
};

export default FFTGraph;
