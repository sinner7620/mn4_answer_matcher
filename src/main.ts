import { getObjCClassDeclar } from "marginnote"
import {
  handlers,
  lifecycle,
  onAnswerCardPan,
  onAnswerCardResize,
  onAnswerToolbarClick,
  onCloseAnswerCard,
  onNotebookPickerAction,
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
    onNotebookPickerAction,
    openMenu
  },
  lifecycle.classMethods
)

JSB.newAddon = () => Extension
