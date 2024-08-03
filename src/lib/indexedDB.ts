const DB_NAME = "plot_itDataDB";
const BUFFER_STORE = "DataBuffer";
const DATASET_STORE = "DataSet";
const DB_VERSION = 2;

let db: IDBDatabase | null = null;

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject("IndexedDB initialization failed");

    request.onsuccess = (event) => {
      db = (event.target as IDBOpenDBRequest).result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(BUFFER_STORE)) {
        db.createObjectStore(BUFFER_STORE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(DATASET_STORE)) {
        db.createObjectStore(DATASET_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
  });
};

export const addToBuffer = (data: string[][]): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      initDB()
        .then(() => {
          // Retry the operation after initialization
          addToBuffer(data).then(resolve).catch(reject);
        })
        .catch(reject);
      return;
    }

    const transaction = db.transaction([BUFFER_STORE], "readwrite");
    const store = transaction.objectStore(BUFFER_STORE);
    const request = store.put({ id: "currentBuffer", data });

    request.onerror = () => reject("Error adding to buffer");
    request.onsuccess = () => resolve();
  });
};

export const getBuffer = (): Promise<string[][]> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("Database not initialized");
      return;
    }

    const transaction = db.transaction([BUFFER_STORE], "readonly");
    const store = transaction.objectStore(BUFFER_STORE);
    const request = store.get("currentBuffer");

    request.onerror = () => reject("Error getting buffer");
    request.onsuccess = () =>
      resolve(request.result ? request.result.data : []);
  });
};

export const clearBuffer = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("Database not initialized");
      return;
    }

    const transaction = db.transaction([BUFFER_STORE], "readwrite");
    const store = transaction.objectStore(BUFFER_STORE);
    const request = store.clear();

    request.onerror = () => reject("Error clearing buffer");
    request.onsuccess = () => resolve();
  });
};

export const addToDataset = (data: string[][]): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("Database not initialized");
      return;
    }

    const transaction = db.transaction([DATASET_STORE], "readwrite");
    const store = transaction.objectStore(DATASET_STORE);
    const request = store.add({ data });

    request.onerror = () => reject("Error adding to dataset");
    request.onsuccess = () => resolve();
  });
};

export const getAllDatasets = (): Promise<string[][][]> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("Database not initialized");
      return;
    }

    const transaction = db.transaction([DATASET_STORE], "readonly");
    const store = transaction.objectStore(DATASET_STORE);
    const request = store.getAll();

    request.onerror = () => reject("Error getting all datasets");
    request.onsuccess = () => resolve(request.result.map((item) => item.data));
  });
};

export const clearAllDatasets = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("Database not initialized");
      return;
    }

    const transaction = db.transaction([DATASET_STORE], "readwrite");
    const store = transaction.objectStore(DATASET_STORE);
    const request = store.clear();

    request.onerror = () => reject("Error clearing all datasets");
    request.onsuccess = () => resolve();
  });
};

export const getDatasetCount = (): Promise<number> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("Database not initialized");
      return;
    }

    const transaction = db.transaction([DATASET_STORE], "readonly");
    const store = transaction.objectStore(DATASET_STORE);
    const request = store.count();

    request.onerror = () => reject("Error getting dataset count");
    request.onsuccess = () => resolve(request.result);
  });
};
