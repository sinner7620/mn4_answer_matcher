import { CGRect, MN } from "marginnote"

export interface NotebookPickerItem {
  id: string
  title: string
}

const ROW_HEIGHT = 52
const HEADER_HEIGHT = 72
const FOOTER_HEIGHT = 58

function removeView(view: any): void {
  try {
    view?.removeFromSuperview()
  } catch {
    // The view may already have been removed by MarginNote while closing a notebook.
  }
}

function closePicker(result?: NotebookPickerItem): void {
  const resolve = self.notebookPickerResolve as
    | ((item: NotebookPickerItem | undefined) => void)
    | undefined
  removeView(self.notebookPickerOverlay)
  self.notebookPickerOverlay = undefined
  self.notebookPickerPanel = undefined
  self.notebookPickerItems = undefined
  self.notebookPickerResolve = undefined
  self.notebookPickerPage = 0
  if (resolve) resolve(result)
}

function label(text: string, frame: CGRect, size: number, bold = false): UILabel {
  const view = new UILabel()
  view.frame = frame
  view.text = text
  view.font = bold ? UIFont.boldSystemFontOfSize(size) : UIFont.systemFontOfSize(size)
  view.textColor = UIColor.colorWithHexString("#1C1C1E")
  view.backgroundColor = UIColor.clearColor()
  view.numberOfLines = 1
  return view
}

function button(title: string, frame: CGRect, tag: number, primary = false): UIButton {
  const view = UIButton.buttonWithType(0)
  view.frame = frame
  view.tag = tag
  view.setTitleForState(title, 0)
  view.setTitleColorForState(primary ? UIColor.whiteColor() : UIColor.colorWithHexString("#1C1C1E"), 0)
  view.backgroundColor = primary
    ? UIColor.colorWithHexString("#3478F6")
    : UIColor.colorWithHexString("#F2F2F7")
  view.layer.cornerRadius = 8
  view.layer.masksToBounds = true
  view.titleLabel.font = UIFont.systemFontOfSize(15)
  view.titleLabel.adjustsFontSizeToFitWidth = false
  view.titleLabel.lineBreakMode = 4
  ;(view as any).contentHorizontalAlignment = 1
  view.titleEdgeInsets = { top: 0, left: 10, bottom: 0, right: 10 }
  view.addTargetActionForControlEvents(self, "onNotebookPickerAction:", 64)
  return view
}

function renderPicker(): void {
  const host = MN.studyController.view
  const bounds = host.bounds
  const items = (self.notebookPickerItems ?? []) as NotebookPickerItem[]
  const pageSize = Math.max(3, Math.min(8, Math.floor((bounds.height - 190) / ROW_HEIGHT)))
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.max(0, Math.min(Number(self.notebookPickerPage) || 0, pageCount - 1))
  self.notebookPickerPage = page

  removeView(self.notebookPickerOverlay)
  const overlay = new UIView({ x: 0, y: 0, width: bounds.width, height: bounds.height })
  overlay.backgroundColor = UIColor.blackColor().colorWithAlphaComponent(0.28)

  const width = Math.max(320, Math.min(620, bounds.width - 40))
  const height = HEADER_HEIGHT + pageSize * ROW_HEIGHT + FOOTER_HEIGHT
  const panel = new UIView({
    x: Math.max(20, (bounds.width - width) / 2),
    y: Math.max(20, (bounds.height - height) / 2),
    width,
    height
  })
  panel.backgroundColor = UIColor.whiteColor()
  panel.layer.cornerRadius = 12
  panel.layer.masksToBounds = true
  overlay.addSubview(panel)

  panel.addSubview(label("绑定答案脑图", { x: 18, y: 12, width: width - 36, height: 28 }, 20, true))
  panel.addSubview(label(
    `请选择对应脑图 · 第 ${page + 1}/${pageCount} 页`,
    { x: 18, y: 40, width: width - 36, height: 22 },
    13
  ))

  const start = page * pageSize
  for (let row = 0; row < pageSize; row++) {
    const index = start + row
    if (index >= items.length) break
    const item = items[index]
    panel.addSubview(button(
      `${index + 1}. ${item.title} · ${item.id.slice(-6)}`,
      { x: 16, y: HEADER_HEIGHT + row * ROW_HEIGHT, width: width - 32, height: 44 },
      index
    ))
  }

  const footerY = HEADER_HEIGHT + pageSize * ROW_HEIGHT + 7
  const gap = 10
  const footerButtonWidth = (width - 32 - gap * 2) / 3
  panel.addSubview(button("取消", { x: 16, y: footerY, width: footerButtonWidth, height: 42 }, -1))
  panel.addSubview(button(
    page > 0 ? "上一页" : "已是首页",
    { x: 16 + footerButtonWidth + gap, y: footerY, width: footerButtonWidth, height: 42 },
    page > 0 ? -2 : -4
  ))
  panel.addSubview(button(
    page + 1 < pageCount ? "下一页" : "已是末页",
    { x: 16 + (footerButtonWidth + gap) * 2, y: footerY, width: footerButtonWidth, height: 42 },
    page + 1 < pageCount ? -3 : -4,
    page + 1 < pageCount
  ))

  host.addSubview(overlay)
  self.notebookPickerOverlay = overlay
  self.notebookPickerPanel = panel
}

export function chooseNotebook(items: NotebookPickerItem[]): Promise<NotebookPickerItem | undefined> {
  closePicker()
  return new Promise(resolve => {
    self.notebookPickerItems = items
    self.notebookPickerResolve = resolve
    self.notebookPickerPage = 0
    renderPicker()
  })
}

export function onNotebookPickerAction(sender: UIButton): void {
  const tag = Number(sender.tag)
  if (tag === -1) return closePicker()
  if (tag === -2) {
    self.notebookPickerPage = Math.max(0, Number(self.notebookPickerPage) - 1)
    return renderPicker()
  }
  if (tag === -3) {
    self.notebookPickerPage = Number(self.notebookPickerPage) + 1
    return renderPicker()
  }
  if (tag < 0) return
  const item = (self.notebookPickerItems as NotebookPickerItem[] | undefined)?.[tag]
  if (item) closePicker(item)
}

export function closeNotebookPicker(): void {
  closePicker()
}
