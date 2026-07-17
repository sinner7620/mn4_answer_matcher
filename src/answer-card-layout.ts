export interface AnswerFrame {
  x: number
  y: number
  width: number
  height: number
}

export function freePositionFrame(frame: AnswerFrame): AnswerFrame {
  return {
    x: frame.x,
    y: frame.y,
    width: Math.max(280, frame.width),
    height: Math.max(240, frame.height)
  }
}

export function isFrameFullyOutside(frame: AnswerFrame, bounds: AnswerFrame): boolean {
  return frame.x + frame.width <= 0 ||
    frame.y + frame.height <= 0 ||
    frame.x >= bounds.width ||
    frame.y >= bounds.height
}
