// IndexedDB utilities for large file storage
export interface StoredSound {
  id: string
  name: string
  volume: number
  fileData: Blob
  fileSize: number
  mimeType: string
  createdAt: Date
}

export interface StoredSettings {
  masterVolume: number
  equalizerBands: any[]
  nextId: number
  version: string
}

class IndexedDBManager {
  private dbName = "alfie-horeg-db"
  private version = 1
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create sounds store
        if (!db.objectStoreNames.contains("sounds")) {
          const soundsStore = db.createObjectStore("sounds", { keyPath: "id" })
          soundsStore.createIndex("name", "name", { unique: false })
          soundsStore.createIndex("createdAt", "createdAt", { unique: false })
        }

        // Create settings store
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" })
        }
      }
    })
  }

  async saveSound(sound: StoredSound): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["sounds"], "readwrite")
      const store = transaction.objectStore("sounds")
      const request = store.put(sound)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async getSound(id: string): Promise<StoredSound | null> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["sounds"], "readonly")
      const store = transaction.objectStore("sounds")
      const request = store.get(id)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || null)
    })
  }

  async getAllSounds(): Promise<StoredSound[]> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["sounds"], "readonly")
      const store = transaction.objectStore("sounds")
      const request = store.getAll()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || [])
    })
  }

  async deleteSound(id: string): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["sounds"], "readwrite")
      const store = transaction.objectStore("sounds")
      const request = store.delete(id)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async saveSettings(settings: StoredSettings): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["settings"], "readwrite")
      const store = transaction.objectStore("settings")
      const request = store.put({ key: "main", ...settings })

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async getSettings(): Promise<StoredSettings | null> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["settings"], "readonly")
      const store = transaction.objectStore("settings")
      const request = store.get("main")

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const result = request.result
        if (result) {
          const { key, ...settings } = result
          resolve(settings)
        } else {
          resolve(null)
        }
      }
    })
  }

  async clearAll(): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["sounds", "settings"], "readwrite")

      const soundsStore = transaction.objectStore("sounds")
      const settingsStore = transaction.objectStore("settings")

      const clearSounds = soundsStore.clear()
      const clearSettings = settingsStore.clear()

      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => resolve()
    })
  }

  async getStorageUsage(): Promise<{ used: number; available: number }> {
    if ("storage" in navigator && "estimate" in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate()
        return {
          used: estimate.usage || 0,
          available: estimate.quota || 0,
        }
      } catch (error) {
        console.error("Error getting storage estimate:", error)
      }
    }

    // Fallback estimation
    const sounds = await this.getAllSounds()
    const used = sounds.reduce((total, sound) => total + sound.fileSize, 0)
    return {
      used,
      available: 1024 * 1024 * 1024, // 1GB fallback
    }
  }
}

export const dbManager = new IndexedDBManager()
