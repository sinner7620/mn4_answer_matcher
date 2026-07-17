import { getObjCClassDeclar } from "marginnote"
import {
  handlers,
  lifecycle,
  onAnswerCardPan,
  onAnswerCardResize,
  onAnswerToolbarClick,
  onCloseAnswerCard,
  openMenu,
  queryAddonCommandStatus
} from "./plugin"

const Extension = JSB.defineClass(
  getObjCClassDeclar("答案匹配", "JSExtension"),
  {
    ...lifecycle.instanceMethods,
    ...handlers,
    queryAddonCommandStatus,
    onAnswerToolbarClick,
    onCloseAnswerCard,
    onAnswerCardPan,
    onAnswerCardResize,
    openMenu
  },
  lifecycle.classMethods
)

JSB.newAddon = () => Extension
