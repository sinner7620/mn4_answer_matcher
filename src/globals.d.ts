declare const self: any

declare class UIPanGestureRecognizer extends UIGestureRecognizer {
  constructor(target: any, action: string)
}

declare const __APP_VERSION__: string
declare const __GITHUB_REPOSITORY__: string
declare const __TELEMETRY_RELAY_ENDPOINT__: string

declare const PopupMenu: {
  currentMenu(): {
    visible?: boolean
    targetWinRect?: { x: number; y: number; width: number; height: number }
  } | undefined
}
