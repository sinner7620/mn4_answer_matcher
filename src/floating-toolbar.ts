import { MN } from "marginnote"

const BUTTON_WIDTH = 96
const BUTTON_HEIGHT = 34
const TOOLBAR_HEIGHT = BUTTON_HEIGHT * 3 + 12

function toolbarButton(title: string, color: string, selector: string): UIButton {
  const button = UIButton.buttonWithType(0)
  button.setTitleForState(title, 0)
  button.setTitleColorForState(UIColor.whiteColor(), 0)
  button.backgroundColor = UIColor.colorWithHexString(color)
  button.layer.cornerRadius = 7
  button.layer.masksToBounds = false
  const layer = button.layer as any
  layer.shadowColor = UIColor.blackColor()
  layer.shadowOffset = { width: 0, height: 1 }
  layer.shadowRadius = 2
  layer.shadowOpacity = 0.35
  button.addTargetActionForControlEvents(self, selector, 1 << 6)
  return button
}

export function createAnswerToolbar(): UIView {
  const toolbar = new UIView({ x: 0, y: 0, width: BUTTON_WIDTH, height: TOOLBAR_HEIGHT })
  toolbar.backgroundColor = UIColor.clearColor()

  const answerButton = toolbarButton("查找答案", "#4F6BED", "onAnswerToolbarClick:")
  answerButton.frame = { x: 0, y: 0, width: BUTTON_WIDTH, height: BUTTON_HEIGHT }
  toolbar.addSubview(answerButton)

  const mistakeButton = toolbarButton("标记错题", "#D97706", "onMistakeToolbarClick:")
  mistakeButton.frame = { x: 0, y: BUTTON_HEIGHT + 6, width: BUTTON_WIDTH, height: BUTTON_HEIGHT }
  toolbar.addSubview(mistakeButton)

  const linkButton = toolbarButton("错题浏览", "#0F766E", "toggleWebPanel:")
  linkButton.frame = { x: 0, y: (BUTTON_HEIGHT + 6) * 2, width: BUTTON_WIDTH, height: BUTTON_HEIGHT }
  toolbar.addSubview(linkButton)

  self.answerToolbarButton = answerButton
  self.mistakeToolbarButton = mistakeButton
  self.mistakeLinkToolbarButton = linkButton
  toolbar.hidden = true
  return toolbar
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
  const maxY = Math.max(gap, studyFrame.height - TOOLBAR_HEIGHT - gap)
  const y = Math.max(
    gap,
    Math.min(maxY, cardY + (rect.height - TOOLBAR_HEIGHT) / 2)
  )

  self.answerToolbar.frame = { x, y, width: BUTTON_WIDTH, height: TOOLBAR_HEIGHT }
  self.answerToolbar.hidden = false
  if (!self.answerToolbar.superview) {
    MN.studyController.view.addSubview(self.answerToolbar)
  }
  self.answerToolbarShownAt = Date.now()
}

export function hideAnswerToolbar(): void {
  if (self.answerToolbar) self.answerToolbar.hidden = true
}
