import { delay, select } from "marginnote"

export interface NotebookPickerItem { id: string; title: string }

/**
 * The system selector is stable across MN4 iPad and macOS. A short delay keeps
 * presentation outside the Rails UIWebView navigation-delegate callback.
 */
export async function chooseNotebook(items: NotebookPickerItem[]): Promise<NotebookPickerItem | undefined> {
  await delay(0.08)
  const result = await select(
    items.map((item, index) => `${index + 1}. ${item.title}`),
    "绑定答案脑图",
    "请选择对应的答案脑图",
    true
  )
  return result.index >= 0 ? items[result.index] : undefined
}

// Compatibility no-ops for existing selector registrations and cached add-ons.
export function onNotebookPickerAction(): void {}
export function closeNotebookPicker(): void {}
