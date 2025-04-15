import React from "react";

export type SavedDevice = {
    usbVendorId: number;
    usbProductId: number;
    baudRate: number;
    serialTimeout: number;
    selectedChannels: number[];
    deviceName?: string;
};

export function getSavedDevices(): SavedDevice[] {
    return JSON.parse(localStorage.getItem("savedDevices") || "[]");
}

export function saveDevice(device: SavedDevice): void {
    const saved = getSavedDevices();
    const index = saved.findIndex(
        (d) =>
            d.usbProductId === device.usbProductId &&
            d.deviceName === device.deviceName
    );
    if (index !== -1) {
        saved[index] = device;
    } else {
        saved.push(device);
    }
    localStorage.setItem("savedDevices", JSON.stringify(saved));
}

export function getDeviceByProductId(productId: number): SavedDevice | undefined {
    return getSavedDevices().find((d) => d.usbProductId === productId);
}

export function getDeviceChannels(deviceName: string): number[] {
    const saved = getSavedDevices();
    const found = saved.find((d) => d.deviceName === deviceName);
    return found?.selectedChannels || [1];
}
