import { getLocalDataByKey, setLocalDataByKey } from "marginnote"

const STORAGE_KEY = "mn4-answer-matcher.bindings.v1"
const BACKUP_KEY = "marginnote.extension.mn4-answer-matcher.bindings.v1"

export type Bindings = Record<string, string>

export function loadBindings(): Bindings {
  let value = getLocalDataByKey(STORAGE_KEY)
  if (!value || typeof value !== "object") {
    try {
      value = NSUserDefaults.standardUserDefaults().objectForKey(BACKUP_KEY)
      if (typeof value === "string") value = JSON.parse(value)
      if (value && typeof value === "object") setLocalDataByKey(value, STORAGE_KEY)
    } catch {
      value = undefined
    }
  }
  if (!value || typeof value !== "object") return {}
  return { ...(value as Bindings) }
}

export function saveBindings(bindings: Bindings): void {
  setLocalDataByKey(bindings, STORAGE_KEY)
  try {
    const defaults = NSUserDefaults.standardUserDefaults()
    defaults.setObjectForKey(JSON.stringify(bindings), BACKUP_KEY)
    defaults.synchronize()
  } catch {
    // The add-on local store remains the primary copy on older MarginNote builds.
  }
}

export function backupBindings(): void {
  saveBindings(loadBindings())
}
