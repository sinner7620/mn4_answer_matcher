import { MN } from "marginnote"

export function showAnswerCard(html: string): void {
  const host = MN.studyController.view
  const hostFrame = host.bounds
  const defaultWidth = Math.max(280, Math.min(620, hostFrame.width - 24))
  const defaultHeight = Math.max(320, Math.min(720, hostFrame.height - 56))
  const defaultFrame = {
    x: Math.max(12, (hostFrame.width - defaultWidth) / 2),
    y: Math.max(20, (hostFrame.height - defaultHeight) / 2),
    width: defaultWidth,
    height: defaultHeight
  }

  if (!self.answerCardView) {
    const container = new UIView(defaultFrame)
    container.layer.cornerRadius = 12
    container.layer.masksToBounds = false
    const layer = container.layer as any
    layer.shadowColor = UIColor.blackColor()
    layer.shadowOffset = { width: 0, height: 3 }
    layer.shadowRadius = 10
    layer.shadowOpacity = 0.35

    const webView = new UIWebView({ x: 0, y: 0, width: defaultWidth, height: defaultHeight })
    webView.scalesPageToFit = false
    webView.autoresizingMask = (1 << 1) | (1 << 4)
    webView.layer.cornerRadius = 12
    webView.layer.masksToBounds = true
    container.addSubview(webView)

    const closeButton = UIButton.buttonWithType(0)
    closeButton.frame = { x: defaultWidth - 44, y: 9, width: 34, height: 34 }
    closeButton.autoresizingMask = 1 << 0
    closeButton.setTitleForState("×", 0)
    closeButton.setTitleColorForState(UIColor.whiteColor(), 0)
    closeButton.backgroundColor = UIColor.blackColor().colorWithAlphaComponent(0.62)
    closeButton.layer.cornerRadius = 17
    closeButton.layer.masksToBounds = true
    closeButton.addTargetActionForControlEvents(self, "onCloseAnswerCard:", 1 << 6)
    container.addSubview(closeButton)

    const dragArea = new UIView({ x: 0, y: 0, width: defaultWidth - 52, height: 48 })
    dragArea.autoresizingMask = 1 << 1
    dragArea.backgroundColor = UIColor.blackColor().colorWithAlphaComponent(0.001)
    const dragGesture = new UIPanGestureRecognizer(self, "onAnswerCardPan:")
    dragGesture.addTargetAction(self, "onAnswerCardPan:")
    dragArea.addGestureRecognizer(dragGesture)
    container.addSubview(dragArea)

    const resizeHandle = UIButton.buttonWithType(0)
    resizeHandle.frame = {
      x: defaultWidth - 36,
      y: defaultHeight - 36,
      width: 30,
      height: 30
    }
    resizeHandle.autoresizingMask = (1 << 0) | (1 << 3)
    resizeHandle.setTitleForState("↘", 0)
    resizeHandle.setTitleColorForState(UIColor.whiteColor(), 0)
    resizeHandle.backgroundColor = UIColor.blackColor().colorWithAlphaComponent(0.5)
    resizeHandle.layer.cornerRadius = 7
    resizeHandle.layer.masksToBounds = true
    const resizeGesture = new UIPanGestureRecognizer(self, "onAnswerCardResize:")
    resizeGesture.addTargetAction(self, "onAnswerCardResize:")
    resizeHandle.addGestureRecognizer(resizeGesture)
    container.addSubview(resizeHandle)

    self.answerCardView = container
    self.answerCardWebView = webView
    self.answerCardCloseButton = closeButton
    self.answerCardDragArea = dragArea
    self.answerCardResizeHandle = resizeHandle
  }

  const previous = self.answerCardView.frame
  const width = Math.max(280, Math.min(previous.width, hostFrame.width - 12))
  const height = Math.max(240, Math.min(previous.height, hostFrame.height - 12))
  const frame = {
    x: Math.max(0, Math.min(previous.x, hostFrame.width - width)),
    y: Math.max(0, Math.min(previous.y, hostFrame.height - height)),
    width,
    height
  }
  self.answerCardView.frame = frame
  self.answerCardWebView.frame = { x: 0, y: 0, width, height }
  self.answerCardCloseButton.frame = { x: width - 44, y: 9, width: 34, height: 34 }
  self.answerCardDragArea.frame = { x: 0, y: 0, width: width - 52, height: 48 }
  self.answerCardResizeHandle.frame = { x: width - 36, y: height - 36, width: 30, height: 30 }
  ;(self.answerCardWebView as any).loadHTMLStringBaseURL(html, null)
  self.answerCardView.hidden = false
  if (!self.answerCardView.superview) host.addSubview(self.answerCardView)
}

export function closeAnswerCard(): void {
  if (self.answerCardView) self.answerCardView.hidden = true
}

function clampFrame(frame: any): any {
  const bounds = MN.studyController.view.bounds
  const width = Math.max(280, Math.min(frame.width, bounds.width))
  const height = Math.max(240, Math.min(frame.height, bounds.height))
  return {
    x: Math.max(0, Math.min(frame.x, bounds.width - width)),
    y: Math.max(0, Math.min(frame.y, bounds.height - height)),
    width,
    height
  }
}

function layoutAnswerCard(frame: any): void {
  const next = clampFrame(frame)
  self.answerCardView.frame = next
  self.answerCardWebView.frame = { x: 0, y: 0, width: next.width, height: next.height }
  self.answerCardCloseButton.frame = { x: next.width - 44, y: 9, width: 34, height: 34 }
  self.answerCardDragArea.frame = { x: 0, y: 0, width: next.width - 52, height: 48 }
  self.answerCardResizeHandle.frame = {
    x: next.width - 36,
    y: next.height - 36,
    width: 30,
    height: 30
  }
}

export function onAnswerCardPan(sender: UIPanGestureRecognizer): void {
  const host = MN.studyController.view
  if (sender.state === 1) {
    const location = sender.locationInView(host)
    const frame = self.answerCardView.frame
    self.answerCardDragOffset = { x: location.x - frame.x, y: location.y - frame.y }
  }
  const offset = self.answerCardDragOffset
  if (!offset) return
  const location = sender.locationInView(host)
  layoutAnswerCard({
    ...self.answerCardView.frame,
    x: location.x - offset.x,
    y: location.y - offset.y
  })
  if (sender.state === 3 || sender.state === 4 || sender.state === 5) {
    self.answerCardDragOffset = undefined
  }
}

export function onAnswerCardResize(sender: UIPanGestureRecognizer): void {
  const host = MN.studyController.view
  if (sender.state === 1) {
    self.answerCardResizeStart = {
      location: sender.locationInView(host),
      frame: { ...self.answerCardView.frame }
    }
  }
  const start = self.answerCardResizeStart
  if (!start) return
  const location = sender.locationInView(host)
  layoutAnswerCard({
    ...start.frame,
    width: start.frame.width + location.x - start.location.x,
    height: start.frame.height + location.y - start.location.y
  })
  if (sender.state === 3 || sender.state === 4 || sender.state === 5) {
    self.answerCardResizeStart = undefined
  }
}
