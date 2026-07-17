import { MN } from "marginnote"

const BUTTON_WIDTH = 96
const BUTTON_HEIGHT = 34

export function createAnswerToolbar(): UIButton {
  const button = UIButton.buttonWithType(0)
  button.frame = { x: 0, y: 0, width: BUTTON_WIDTH, height: BUTTON_HEIGHT }
  button.setTitleForState("查找答案", 0)
  button.setTitleColorForState(UIColor.whiteColor(), 0)
  button.backgroundColor = UIColor.colorWithHexString("#4F6BED")
  button.layer.cornerRadius = 7
  button.layer.masksToBounds = false
  const layer = button.layer as any
  layer.shadowColor = UIColor.blackColor()
  layer.shadowOffset = { width: 0, height: 1 }
  layer.shadowRadius = 2
  layer.shadowOpacity = 0.35
  button.addTargetActionForControlEvents(self, "onAnswerToolbarClick:", 1 << 6)
  button.hidden = true
  return button
}

function parseWinRect(winRect: string): {
  x: number
  y: number
  width: number
  height: number
} | undefined {
  try {
    const values = JSON.parse(`[${winRect.replace(/[{}]/g, "")}]`) as number[]
    if (values.length !== 4 || values.some(value => !Number.isFinite(value))) return
    return { x: values[0], y: values[1], width: values[2], height: values[3] }
  } catch {
    return
  }
}

export function showAnswerToolbar(winRect: string): void {
  const rect = parseWinRect(winRect)
  if (!rect || !self.answerToolbar) return

  const studyFrame = MN.studyController.view.frame
  const cardX = rect.x - studyFrame.x
  const cardY = rect.y - studyFrame.y
  const gap = 8
  const rightX = cardX + rect.width + gap
  const leftX = cardX - BUTTON_WIDTH - gap
  const x =
    rightX + BUTTON_WIDTH <= studyFrame.width - gap
      ? rightX
      : Math.max(gap, leftX)
  const maxY = Math.max(gap, studyFrame.height - BUTTON_HEIGHT - gap)
  const y = Math.max(
    gap,
    Math.min(maxY, cardY + (rect.height - BUTTON_HEIGHT) / 2)
  )

  self.answerToolbar.frame = { x, y, width: BUTTON_WIDTH, height: BUTTON_HEIGHT }
  self.answerToolbar.backgroundColor = UIColor.colorWithHexString("#4F6BED")
  self.answerToolbar.hidden = false
  if (!self.answerToolbar.superview) {
    MN.studyController.view.addSubview(self.answerToolbar)
  }
  self.answerToolbarShownAt = Date.now()
}

export function hideAnswerToolbar(): void {
  if (self.answerToolbar) self.answerToolbar.hidden = true
}
