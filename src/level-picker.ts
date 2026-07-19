import { CGRect, MN } from "marginnote"
import { LEVEL_DESCRIPTIONS, MistakeLevel } from "./mistake-domain"

const LEVEL_COLORS = ["#DC5A5A", "#D96A4A", "#D89136", "#C69B35", "#4B9D7C", "#5776DC"]

function removeView(view: any): void {
  try { view?.removeFromSuperview() } catch { /* already removed */ }
}

function closePicker(level?: MistakeLevel): void {
  const resolve = self.mistakeLevelPickerResolve as ((value?: MistakeLevel) => void) | undefined
  removeView(self.mistakeLevelPickerOverlay)
  self.mistakeLevelPickerOverlay = undefined
  self.mistakeLevelPickerResolve = undefined
  resolve?.(level)
}

function makeLabel(text: string, frame: CGRect, size: number, bold = false): UILabel {
  const label = new UILabel()
  label.frame = frame
  label.text = text
  label.font = bold ? UIFont.boldSystemFontOfSize(size) : UIFont.systemFontOfSize(size)
  label.textColor = UIColor.colorWithHexString("#1C1C1E")
  return label
}

function makeButton(title: string, frame: CGRect, tag: number, color = "#F2F2F7"): UIButton {
  const button = UIButton.buttonWithType(0)
  button.frame = frame
  button.tag = tag
  button.setTitleForState(title, 0)
  button.setTitleColorForState(tag >= 0 ? UIColor.whiteColor() : UIColor.colorWithHexString("#1C1C1E"), 0)
  button.backgroundColor = UIColor.colorWithHexString(color)
  button.layer.cornerRadius = 8
  button.layer.masksToBounds = true
  button.titleLabel.font = UIFont.systemFontOfSize(15)
  button.addTargetActionForControlEvents(self, "onMistakeLevelPickerAction:", 64)
  return button
}

export function chooseMistakeLevel(current?: MistakeLevel): Promise<MistakeLevel | undefined> {
  closePicker()
  return new Promise(resolve => {
    self.mistakeLevelPickerResolve = resolve
    const host = MN.studyController.view
    const bounds = host.bounds
    const width = Math.max(320, Math.min(430, bounds.width - 40))
    const height = 398
    const overlay = new UIView({ x: 0, y: 0, width: bounds.width, height: bounds.height })
    overlay.backgroundColor = UIColor.blackColor().colorWithAlphaComponent(0.28)
    const panel = new UIView({
      x: Math.max(20, (bounds.width - width) / 2),
      y: Math.max(20, (bounds.height - height) / 2),
      width,
      height
    })
    panel.backgroundColor = UIColor.whiteColor()
    panel.layer.cornerRadius = 12
    panel.layer.masksToBounds = true
    panel.addSubview(makeLabel("标记错题等级", { x: 16, y: 12, width: width - 32, height: 26 }, 19, true))
    panel.addSubview(makeLabel("选择当前掌握程度", { x: 16, y: 38, width: width - 32, height: 20 }, 12))
    for (let level = 0; level <= 5; level++) {
      const suffix = current === level ? "  ✓ 当前" : ""
      panel.addSubview(makeButton(
        `${level}级 · ${LEVEL_DESCRIPTIONS[level as MistakeLevel]}${suffix}`,
        { x: 16, y: 66 + level * 46, width: width - 32, height: 40 },
        level,
        LEVEL_COLORS[level]
      ))
    }
    panel.addSubview(makeButton("取消", { x: 16, y: 350, width: width - 32, height: 36 }, -1))
    overlay.addSubview(panel)
    host.addSubview(overlay)
    self.mistakeLevelPickerOverlay = overlay
  })
}

export function onMistakeLevelPickerAction(sender: UIButton): void {
  const tag = Number(sender.tag)
  closePicker(tag >= 0 && tag <= 5 ? tag as MistakeLevel : undefined)
}

export function closeMistakeLevelPicker(): void {
  closePicker()
}
