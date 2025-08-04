"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import {
  Upload,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  MoreVertical,
  Edit,
  FileText,
  Settings,
  Save,
  RotateCcw,
  Download,
  FileUp,
  AlertTriangle,
  Database,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { dbManager, type StoredSound, type StoredSettings } from "@/lib/indexeddb"

interface SoundSlot {
  id: string
  name: string
  file: File | null
  url: string | null
  isPlaying: boolean
  volume: number
  fileSize?: number
  mimeType?: string
}

interface EqualizerBand {
  frequency: number
  gain: number
  label: string
}

interface ExportData {
  sounds: Array<{
    id: string
    name: string
    volume: number
    fileData: string // base64 for export
    fileSize: number
    mimeType: string
  }>
  masterVolume: number
  equalizerBands: EqualizerBand[]
  nextId: number
  version: string
}

export default function SoundPlayer() {
  const [sounds, setSounds] = useState<SoundSlot[]>([])
  const [masterVolume, setMasterVolume] = useState<number>(100)
  const [nextId, setNextId] = useState<number>(1)
  const [editingSound, setEditingSound] = useState<string | null>(null)
  const [newSoundName, setNewSoundName] = useState<string>("")
  const [isEqualizerOpen, setIsEqualizerOpen] = useState<boolean>(false)
  const [storageUsage, setStorageUsage] = useState<{ used: number; available: number }>({ used: 0, available: 0 })
  const [isLoading, setIsLoading] = useState<boolean>(false)

  // Equalizer bands (Hz)
  const [equalizerBands, setEqualizerBands] = useState<EqualizerBand[]>([
    { frequency: 60, gain: 0, label: "60Hz" },
    { frequency: 170, gain: 0, label: "170Hz" },
    { frequency: 310, gain: 0, label: "310Hz" },
    { frequency: 600, gain: 0, label: "600Hz" },
    { frequency: 1000, gain: 0, label: "1kHz" },
    { frequency: 3000, gain: 0, label: "3kHz" },
    { frequency: 6000, gain: 0, label: "6kHz" },
    { frequency: 12000, gain: 0, label: "12kHz" },
    { frequency: 14000, gain: 0, label: "14kHz" },
    { frequency: 16000, gain: 0, label: "16kHz" },
  ])

  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map())
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodesRef = useRef<Map<string, MediaElementAudioSourceNode>>(new Map())
  const filterNodesRef = useRef<Map<string, BiquadFilterNode[]>>(new Map())
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const { toast } = useToast()

  // Constants - Now much higher limits!
  const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB per file
  const WARN_STORAGE_PERCENT = 80 // Warn at 80% usage

  // Initialize Audio Context
  const initAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    return audioContextRef.current
  }

  // Storage utilities
  const updateStorageUsage = async () => {
    try {
      const usage = await dbManager.getStorageUsage()
      setStorageUsage(usage)
    } catch (error) {
      console.error("Error updating storage usage:", error)
    }
  }

  // IndexedDB functions
  const saveToIndexedDB = async () => {
    try {
      setIsLoading(true)

      // Save settings
      const settings: StoredSettings = {
        masterVolume,
        equalizerBands,
        nextId,
        version: "2.0.0",
      }
      await dbManager.saveSettings(settings)

      toast({
        title: "Tersimpan",
        description: "Data berhasil disimpan ke database lokal",
      })

      await updateStorageUsage()
    } catch (error: any) {
      console.error("Error saving to IndexedDB:", error)
      toast({
        title: "Error",
        description: error.message || "Gagal menyimpan data",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const loadFromIndexedDB = async () => {
    try {
      setIsLoading(true)

      // Load settings
      const settings = await dbManager.getSettings()
      if (settings) {
        setMasterVolume(settings.masterVolume)
        setEqualizerBands(settings.equalizerBands)
        setNextId(settings.nextId)
      }

      // Load sounds
      const storedSounds = await dbManager.getAllSounds()
      const loadedSounds: SoundSlot[] = storedSounds.map((stored) => {
        const url = URL.createObjectURL(stored.fileData)
        return {
          id: stored.id,
          name: stored.name,
          file: null,
          url,
          isPlaying: false,
          volume: stored.volume,
          fileSize: stored.fileSize,
          mimeType: stored.mimeType,
        }
      })

      setSounds(loadedSounds)
      await updateStorageUsage()

      if (loadedSounds.length > 0) {
        toast({
          title: "Dimuat",
          description: `${loadedSounds.length} sound berhasil dimuat dari database`,
        })
      }
    } catch (error) {
      console.error("Error loading from IndexedDB:", error)
      toast({
        title: "Error",
        description: "Gagal memuat data tersimpan",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const clearIndexedDB = async () => {
    try {
      setIsLoading(true)
      await dbManager.clearAll()

      setSounds([])
      setMasterVolume(100)
      setEqualizerBands([
        { frequency: 60, gain: 0, label: "60Hz" },
        { frequency: 170, gain: 0, label: "170Hz" },
        { frequency: 310, gain: 0, label: "310Hz" },
        { frequency: 600, gain: 0, label: "600Hz" },
        { frequency: 1000, gain: 0, label: "1kHz" },
        { frequency: 3000, gain: 0, label: "3kHz" },
        { frequency: 6000, gain: 0, label: "6kHz" },
        { frequency: 12000, gain: 0, label: "12kHz" },
        { frequency: 14000, gain: 0, label: "14kHz" },
        { frequency: 16000, gain: 0, label: "16kHz" },
      ])
      setNextId(1)

      await updateStorageUsage()

      toast({
        title: "Dihapus",
        description: "Semua data berhasil dihapus dari database",
      })
    } catch (error) {
      console.error("Error clearing IndexedDB:", error)
      toast({
        title: "Error",
        description: "Gagal menghapus data",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Export/Import functions
  const exportData = async () => {
    try {
      setIsLoading(true)

      const storedSounds = await dbManager.getAllSounds()
      const soundsForExport = await Promise.all(
        storedSounds.map(async (sound) => {
          // Convert blob to base64 for export
          const arrayBuffer = await sound.fileData.arrayBuffer()
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

          return {
            id: sound.id,
            name: sound.name,
            volume: sound.volume,
            fileData: `data:${sound.mimeType};base64,${base64}`,
            fileSize: sound.fileSize,
            mimeType: sound.mimeType,
          }
        }),
      )

      const dataToExport: ExportData = {
        sounds: soundsForExport,
        masterVolume,
        equalizerBands,
        nextId,
        version: "2.0.0",
      }

      const jsonString = JSON.stringify(dataToExport, null, 2)
      const blob = new Blob([jsonString], { type: "application/json" })
      const url = URL.createObjectURL(blob)

      const a = document.createElement("a")
      a.href = url
      a.download = `alfie-horeg-backup-${new Date().toISOString().split("T")[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: "Berhasil Export",
        description: "Data berhasil diexport ke file JSON",
      })
    } catch (error) {
      console.error("Error exporting data:", error)
      toast({
        title: "Error",
        description: "Gagal export data",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const importData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setIsLoading(true)

      const reader = new FileReader()
      const jsonData = await new Promise<ExportData>((resolve, reject) => {
        reader.onload = (e) => {
          try {
            const data = JSON.parse(e.target?.result as string)
            resolve(data)
          } catch (error) {
            reject(new Error("Format file tidak valid"))
          }
        }
        reader.onerror = () => reject(new Error("Gagal membaca file"))
        reader.readAsText(file)
      })

      // Validate data structure
      if (!jsonData.sounds || !Array.isArray(jsonData.sounds)) {
        throw new Error("Format file tidak valid")
      }

      // Clear existing data
      await dbManager.clearAll()

      // Import sounds to IndexedDB
      for (const soundData of jsonData.sounds) {
        try {
          // Convert base64 back to blob
          const response = await fetch(soundData.fileData)
          const blob = await response.blob()

          const storedSound: StoredSound = {
            id: soundData.id,
            name: soundData.name,
            volume: soundData.volume,
            fileData: blob,
            fileSize: soundData.fileSize,
            mimeType: soundData.mimeType,
            createdAt: new Date(),
          }

          await dbManager.saveSound(storedSound)
        } catch (error) {
          console.error(`Error importing sound ${soundData.name}:`, error)
        }
      }

      // Import settings
      const settings: StoredSettings = {
        masterVolume: jsonData.masterVolume || 100,
        equalizerBands: jsonData.equalizerBands || equalizerBands,
        nextId: jsonData.nextId || 1,
        version: "2.0.0",
      }
      await dbManager.saveSettings(settings)

      // Reload data
      await loadFromIndexedDB()

      toast({
        title: "Berhasil Import",
        description: `${jsonData.sounds.length} sound berhasil diimport`,
      })
    } catch (error: any) {
      console.error("Error importing data:", error)
      toast({
        title: "Error",
        description: error.message || "Gagal import data",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }

    // Reset input
    if (event.target) {
      event.target.value = ""
    }
  }

  // Auto-save when data changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (sounds.length > 0 || masterVolume !== 100 || equalizerBands.some((band) => band.gain !== 0)) {
        saveToIndexedDB()
      }
    }, 3000) // 3 seconds for IndexedDB

    return () => clearTimeout(timeoutId)
  }, [masterVolume, equalizerBands]) // Removed sounds from deps to avoid too frequent saves

  // Load data on component mount
  useEffect(() => {
    loadFromIndexedDB()
  }, [])

  const addNewSoundSlot = () => {
    const newSound: SoundSlot = {
      id: `sound-${nextId}`,
      name: `Sound ${nextId}`,
      file: null,
      url: null,
      isPlaying: false,
      volume: 100,
    }
    setSounds((prev) => [...prev, newSound])
    setNextId((prev) => prev + 1)
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    setIsLoading(true)

    try {
      for (const file of files) {
        if (!file.type.startsWith("audio/")) {
          toast({
            title: "Error",
            description: `${file.name} bukan file audio yang valid`,
            variant: "destructive",
          })
          continue
        }

        // Check file size - now 500MB limit!
        if (file.size > MAX_FILE_SIZE) {
          toast({
            title: "File Terlalu Besar",
            description: `${file.name} melebihi batas 500MB`,
            variant: "destructive",
          })
          continue
        }

        const soundId = `sound-${nextId + files.indexOf(file)}`
        const url = URL.createObjectURL(file)

        // Save to IndexedDB
        const storedSound: StoredSound = {
          id: soundId,
          name: file.name,
          volume: 100,
          fileData: file, // Store the actual file blob
          fileSize: file.size,
          mimeType: file.type,
          createdAt: new Date(),
        }

        await dbManager.saveSound(storedSound)

        // Add to UI state
        const newSound: SoundSlot = {
          id: soundId,
          name: file.name,
          file,
          url,
          isPlaying: false,
          volume: 100,
          fileSize: file.size,
          mimeType: file.type,
        }

        setSounds((prev) => [...prev, newSound])
      }

      setNextId((prev) => prev + files.length)
      await updateStorageUsage()

      toast({
        title: "Berhasil",
        description: `${files.length} sound berhasil diupload dan disimpan`,
      })
    } catch (error: any) {
      console.error("Error uploading files:", error)
      toast({
        title: "Error",
        description: error.message || "Gagal upload file",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }

    // Reset input
    if (event.target) {
      event.target.value = ""
    }
  }

  const setupAudioFilters = (soundId: string, audio: HTMLAudioElement) => {
    const audioContext = initAudioContext()

    if (!sourceNodesRef.current.has(soundId)) {
      const source = audioContext.createMediaElementSource(audio)
      sourceNodesRef.current.set(soundId, source)

      // Create filter chain
      const filters: BiquadFilterNode[] = []

      equalizerBands.forEach((band, index) => {
        const filter = audioContext.createBiquadFilter()
        filter.type = index === 0 ? "lowshelf" : index === equalizerBands.length - 1 ? "highshelf" : "peaking"
        filter.frequency.value = band.frequency
        filter.gain.value = band.gain
        if (filter.type === "peaking") {
          filter.Q.value = 1
        }
        filters.push(filter)
      })

      // Connect filters in chain
      let previousNode: AudioNode = source
      filters.forEach((filter) => {
        previousNode.connect(filter)
        previousNode = filter
      })

      // Connect to destination
      previousNode.connect(audioContext.destination)

      filterNodesRef.current.set(soundId, filters)
    }
  }

  const updateEqualizer = (bandIndex: number, gain: number) => {
    setEqualizerBands((prev) => prev.map((band, index) => (index === bandIndex ? { ...band, gain } : band)))

    // Update all active audio filters
    filterNodesRef.current.forEach((filters) => {
      if (filters[bandIndex]) {
        filters[bandIndex].gain.value = gain
      }
    })
  }

  const resetEqualizer = () => {
    const resetBands = equalizerBands.map((band) => ({ ...band, gain: 0 }))
    setEqualizerBands(resetBands)

    // Reset all filters
    filterNodesRef.current.forEach((filters) => {
      filters.forEach((filter) => {
        filter.gain.value = 0
      })
    })
  }

  const playSound = async (soundId: string) => {
    const sound = sounds.find((s) => s.id === soundId)
    if (!sound || !sound.url) return

    const audio = audioRefs.current.get(soundId)
    if (!audio) return

    try {
      // Resume audio context if suspended
      const audioContext = initAudioContext()
      if (audioContext.state === "suspended") {
        await audioContext.resume()
      }

      if (sound.isPlaying) {
        // Pause current sound
        audio.pause()
        audio.currentTime = 0
        setSounds((prev) => prev.map((s) => (s.id === soundId ? { ...s, isPlaying: false } : s)))
      } else {
        // Stop all other sounds
        audioRefs.current.forEach((otherAudio, otherId) => {
          if (otherId !== soundId) {
            otherAudio.pause()
            otherAudio.currentTime = 0
          }
        })

        // Update states
        setSounds((prev) =>
          prev.map((s) => ({
            ...s,
            isPlaying: s.id === soundId ? true : false,
          })),
        )

        // Setup audio filters if not already done
        setupAudioFilters(soundId, audio)

        // Play current sound
        await audio.play()
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Gagal memutar sound",
        variant: "destructive",
      })
    }
  }

  const updateSoundVolume = (soundId: string, volume: number) => {
    setSounds((prev) => prev.map((sound) => (sound.id === soundId ? { ...sound, volume } : sound)))

    const audio = audioRefs.current.get(soundId)
    if (audio) {
      audio.volume = (volume / 100) * (masterVolume / 100)
    }
  }

  const updateMasterVolume = (volume: number) => {
    setMasterVolume(volume)

    // Update all audio elements
    audioRefs.current.forEach((audio, soundId) => {
      const sound = sounds.find((s) => s.id === soundId)
      if (sound) {
        audio.volume = (sound.volume / 100) * (volume / 100)
      }
    })
  }

  const removeSound = async (soundId: string) => {
    try {
      const audio = audioRefs.current.get(soundId)
      if (audio) {
        audio.pause()
        audio.src = ""
      }
      audioRefs.current.delete(soundId)
      sourceNodesRef.current.delete(soundId)
      filterNodesRef.current.delete(soundId)

      // Remove from IndexedDB
      await dbManager.deleteSound(soundId)

      setSounds((prev) => {
        const sound = prev.find((s) => s.id === soundId)
        if (sound?.url) {
          URL.revokeObjectURL(sound.url)
        }
        return prev.filter((s) => s.id !== soundId)
      })

      await updateStorageUsage()

      toast({
        title: "Dihapus",
        description: "Sound berhasil dihapus",
      })
    } catch (error) {
      console.error("Error removing sound:", error)
      toast({
        title: "Error",
        description: "Gagal menghapus sound",
        variant: "destructive",
      })
    }
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  const triggerImportInput = () => {
    importInputRef.current?.click()
  }

  // Setup audio elements
  useEffect(() => {
    sounds.forEach((sound) => {
      if (sound.url && !audioRefs.current.has(sound.id)) {
        const audio = new Audio(sound.url)
        audio.volume = (sound.volume / 100) * (masterVolume / 100)
        audio.crossOrigin = "anonymous"

        const handleEnded = () => {
          setSounds((prev) => prev.map((s) => (s.id === sound.id ? { ...s, isPlaying: false } : s)))
        }

        audio.addEventListener("ended", handleEnded)
        audioRefs.current.set(sound.id, audio)
      }
    })
  }, [sounds, masterVolume])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Ctrl+S for manual save
      if (event.ctrlKey && event.key === "s") {
        event.preventDefault()
        saveToIndexedDB()
        return
      }

      const key = Number.parseInt(event.key)
      if (key >= 1 && key <= sounds.length) {
        const sound = sounds[key - 1]
        if (sound) {
          playSound(sound.id)
        }
      }
    }

    window.addEventListener("keydown", handleKeyPress)
    return () => window.removeEventListener("keydown", handleKeyPress)
  }, [sounds])

  const startRenaming = (soundId: string, currentName: string) => {
    setEditingSound(soundId)
    setNewSoundName(currentName)
  }

  const saveNewName = async (soundId: string) => {
    if (newSoundName.trim()) {
      try {
        // Update in IndexedDB
        const storedSound = await dbManager.getSound(soundId)
        if (storedSound) {
          storedSound.name = newSoundName.trim()
          await dbManager.saveSound(storedSound)
        }

        // Update UI state
        setSounds((prev) =>
          prev.map((sound) => (sound.id === soundId ? { ...sound, name: newSoundName.trim() } : sound)),
        )
      } catch (error) {
        console.error("Error updating sound name:", error)
      }
    }
    setEditingSound(null)
    setNewSoundName("")
  }

  const cancelRenaming = () => {
    setEditingSound(null)
    setNewSoundName("")
  }

  const editSound = async (soundId: string) => {
    // Trigger file input for this specific sound
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "audio/*"
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file && file.type.startsWith("audio/")) {
        // Check file size
        if (file.size > MAX_FILE_SIZE) {
          toast({
            title: "File Terlalu Besar",
            description: `File melebihi batas 500MB`,
            variant: "destructive",
          })
          return
        }

        try {
          setIsLoading(true)
          const url = URL.createObjectURL(file)

          // Update in IndexedDB
          const storedSound: StoredSound = {
            id: soundId,
            name: file.name,
            volume: sounds.find((s) => s.id === soundId)?.volume || 100,
            fileData: file,
            fileSize: file.size,
            mimeType: file.type,
            createdAt: new Date(),
          }
          await dbManager.saveSound(storedSound)

          setSounds((prev) =>
            prev.map((sound) => {
              if (sound.id === soundId) {
                // Revoke old URL
                if (sound.url) {
                  URL.revokeObjectURL(sound.url)
                }
                // Clean up old audio nodes
                audioRefs.current.delete(soundId)
                sourceNodesRef.current.delete(soundId)
                filterNodesRef.current.delete(soundId)

                return { ...sound, file, url, name: file.name, fileSize: file.size, mimeType: file.type }
              }
              return sound
            }),
          )

          await updateStorageUsage()

          toast({
            title: "Berhasil",
            description: "Sound berhasil diperbarui dan disimpan",
          })
        } catch (error) {
          console.error("Error updating sound:", error)
          toast({
            title: "Error",
            description: "Gagal memperbarui sound",
            variant: "destructive",
          })
        } finally {
          setIsLoading(false)
        }
      }
    }
    input.click()
  }

  // Format storage size
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const storagePercent = storageUsage.available > 0 ? (storageUsage.used / storageUsage.available) * 100 : 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-2 sm:p-4">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
        <div className="text-center space-y-2 relative">
          <h1 className="text-4xl font-bold text-gray-900">Alfie King Horeg</h1>
          <p className="text-gray-600">tugas sekolah king</p>

          {/* Save Controls - Positioned at top right */}
          <div className="absolute top-0 right-0 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={saveToIndexedDB}
              disabled={isLoading}
              className="bg-white/80"
              title={`Storage: ${formatBytes(storageUsage.used)} / ${formatBytes(storageUsage.available)} (${storagePercent.toFixed(1)}%)`}
            >
              <Database className="w-3 h-3 mr-1" />
              <span className="hidden sm:inline text-xs">{isLoading ? "..." : "Simpan"}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="bg-white/80" disabled={isLoading}>
                  <MoreVertical className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={saveToIndexedDB} disabled={isLoading}>
                  <Save className="w-4 h-4 mr-2" />
                  Simpan Manual (Ctrl+S)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportData} disabled={isLoading}>
                  <Download className="w-4 h-4 mr-2" />
                  Export ke File
                </DropdownMenuItem>
                <DropdownMenuItem onClick={triggerImportInput} disabled={isLoading}>
                  <FileUp className="w-4 h-4 mr-2" />
                  Import dari File
                </DropdownMenuItem>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} disabled={isLoading}>
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reset Semua
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Yakin ingin reset semua?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tindakan ini akan menghapus semua sound, pengaturan volume, dan equalizer dari database lokal.
                        Data tidak dapat dikembalikan setelah dihapus.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Batal</AlertDialogCancel>
                      <AlertDialogAction onClick={clearIndexedDB} className="bg-red-600 hover:bg-red-700">
                        Ya, Hapus Semua
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Hidden import input */}
          <Input ref={importInputRef} type="file" accept=".json" onChange={importData} className="hidden" />
        </div>

        {/* Storage Warning */}
        {storagePercent > WARN_STORAGE_PERCENT && (
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-orange-800">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">
                  <strong>Peringatan:</strong> Penyimpanan hampir penuh ({formatBytes(storageUsage.used)} /{" "}
                  {formatBytes(storageUsage.available)} - {storagePercent.toFixed(1)}%). Export data Anda atau hapus
                  beberapa sound.
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Master Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Volume2 className="w-5 h-5" />
                Kontrol Utama
              </span>
              <Dialog open={isEqualizerOpen} onOpenChange={setIsEqualizerOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Equalizer</span>
                    <span className="sm:hidden">EQ</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Equalizer Audio</DialogTitle>
                    <DialogDescription>
                      Sesuaikan pita frekuensi untuk menyesuaikan pengalaman audio Anda
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-6">
                    {/* Equalizer Presets */}
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => resetEqualizer()}>
                        Reset
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Bass Boost preset
                          const bassBoost = [8, 6, 4, 2, 0, 0, 0, 0, 0, 0]
                          bassBoost.forEach((gain, index) => updateEqualizer(index, gain))
                        }}
                      >
                        Bass Boost
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Treble Boost preset
                          const trebleBoost = [0, 0, 0, 0, 0, 2, 4, 6, 8, 8]
                          trebleBoost.forEach((gain, index) => updateEqualizer(index, gain))
                        }}
                      >
                        Treble Boost
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Rock preset
                          const rock = [4, 2, -2, -1, 1, 2, 3, 4, 4, 4]
                          rock.forEach((gain, index) => updateEqualizer(index, gain))
                        }}
                      >
                        Rock
                      </Button>
                    </div>

                    {/* Equalizer Bands */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-4">
                      {equalizerBands.map((band, index) => (
                        <div key={band.frequency} className="space-y-2">
                          <div className="text-center">
                            <label className="text-xs font-medium">{band.label}</label>
                            <div className="text-xs text-gray-500">
                              {band.gain > 0 ? "+" : ""}
                              {band.gain}dB
                            </div>
                          </div>
                          <div className="h-32 flex items-center justify-center">
                            <Slider
                              orientation="vertical"
                              value={[band.gain]}
                              onValueChange={(value) => updateEqualizer(index, value[0])}
                              max={12}
                              min={-12}
                              step={1}
                              className="h-full"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-6">
            {/* Master Volume */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Volume Utama</label>
                <span className="text-sm text-gray-500">{masterVolume}%</span>
              </div>
              <div className="flex items-center gap-3">
                <VolumeX className="w-4 h-4 text-gray-400" />
                <Slider
                  value={[masterVolume]}
                  onValueChange={(value) => updateMasterVolume(value[0])}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <Volume2 className="w-4 h-4 text-gray-400" />
              </div>
            </div>

            {/* Upload Controls */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button onClick={triggerFileInput} className="flex-1" disabled={isLoading}>
                <Upload className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">{isLoading ? "Uploading..." : "Pilih sound KING"}</span>
                <span className="sm:hidden">{isLoading ? "..." : "Upload"}</span>
              </Button>
              <Button
                onClick={addNewSoundSlot}
                variant="outline"
                className="sm:w-auto bg-transparent"
                disabled={isLoading}
              >
                <Plus className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Tambah</span>
                <span className="sm:hidden">Tambah</span>
              </Button>
            </div>

            {/* Storage Info */}
            <div className="text-xs text-gray-500 text-center">
              <div className="flex items-center justify-center gap-2">
                <Database className="w-3 h-3" />
                <span>
                  Database: {formatBytes(storageUsage.used)} / {formatBytes(storageUsage.available)} (
                  {storagePercent.toFixed(1)}% terpakai)
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sound Grid */}
        {sounds.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Database className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Belum ada sound king</h3>
              <p className="text-gray-500 mb-4">
                {"Tambahkan sound dulu lek"}
              </p>
              <Button onClick={triggerFileInput} disabled={isLoading}>
                <Upload className="w-4 h-4 mr-2" />
                {isLoading ? "Loading..." : "Pilih sound"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {sounds.map((sound, index) => (
              <Card key={sound.id} className="relative">
                <CardHeader className="pb-2 sm:pb-3">
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
                      <div className="w-5 h-5 sm:w-6 sm:h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">
                        {index + 1}
                      </div>
                      {editingSound === sound.id ? (
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          <Input
                            value={newSoundName}
                            onChange={(e) => setNewSoundName(e.target.value)}
                            className="h-5 sm:h-6 text-xs"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveNewName(sound.id)
                              if (e.key === "Escape") cancelRenaming()
                            }}
                            autoFocus
                          />
                          <Button size="sm" onClick={() => saveNewName(sound.id)} className="h-5 sm:h-6 px-1 text-xs">
                            ✓
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelRenaming}
                            className="h-5 sm:h-6 px-1 bg-transparent text-xs"
                          >
                            ✕
                          </Button>
                        </div>
                      ) : (
                        <span
                          className="text-xs leading-tight break-words overflow-hidden flex-1 min-w-0"
                          style={{
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            wordBreak: "break-word",
                            hyphens: "auto",
                          }}
                          title={sound.name}
                        >
                          {sound.name}
                        </span>
                      )}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-5 w-5 sm:h-6 sm:w-6 p-0 flex-shrink-0 ml-1">
                          <MoreVertical className="w-3 h-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => startRenaming(sound.id, sound.name)}>
                          <FileText className="w-4 h-4 mr-2" />
                          Ganti Nama
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => editSound(sound.id)}>
                          <Edit className="w-4 h-4 mr-2" />
                          Edit Sound
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => removeSound(sound.id)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Hapus
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {sound.fileSize ? formatBytes(sound.fileSize) : "Tersimpan"}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-2 sm:space-y-3 p-3 sm:p-4">
                  {/* Play Controls */}
                  <Button
                    onClick={() => playSound(sound.id)}
                    disabled={!sound.url}
                    className="w-full text-xs h-7 sm:h-8"
                    variant={sound.isPlaying ? "secondary" : "default"}
                  >
                    {sound.isPlaying ? (
                      <>
                        <Pause className="w-3 h-3 mr-1" />
                        Berhenti
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3 mr-1" />
                        Putar
                      </>
                    )}
                  </Button>

                  {/* Volume Control */}
                  <div className="space-y-1 sm:space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium">Volume</label>
                      <span className="text-xs text-gray-500">{sound.volume}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <VolumeX className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      <Slider
                        value={[sound.volume]}
                        onValueChange={(value) => updateSoundVolume(sound.id, value[0])}
                        max={100}
                        step={1}
                        className="flex-1"
                        disabled={!sound.url}
                      />
                      <Volume2 className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    </div>
                  </div>

                  {/* Progress indicator */}
                  {sound.isPlaying && (
                    <div className="w-full bg-gray-200 rounded-full h-1">
                      <div className="bg-primary h-1 rounded-full animate-pulse"></div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
