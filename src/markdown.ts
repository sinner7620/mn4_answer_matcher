import katex from "katex"
import { Marked } from "marked"

type MathToken = {
  type: "blockMath" | "inlineMath"
  raw: string
  text: string
  displayMode: boolean
}

function renderMath(token: any): string {
  const mathToken = token as MathToken
  const rendered = katex.renderToString(mathToken.text.trim(), {
    displayMode: mathToken.displayMode,
    output: "mathml",
    strict: false,
    throwOnError: false
  })
  return mathToken.displayMode ? `<div class="katex-display">${rendered}</div>` : rendered
}

const markdown = new Marked({
  breaks: true,
  gfm: true
})

markdown.use({
  extensions: [
    {
      name: "blockMath",
      level: "block",
      start(source: string) {
        const dollar = source.search(/^\s*\$\$/m)
        const bracket = source.search(/^\s*\\\[/m)
        const positions = [dollar, bracket].filter(position => position >= 0)
        return positions.length ? Math.min(...positions) : undefined
      },
      tokenizer(source: string): MathToken | undefined {
        const dollar = /^\s*\$\$\s*([\s\S]+?)\s*\$\$\s*(?:\n|$)/.exec(source)
        if (dollar) {
          return {
            type: "blockMath",
            raw: dollar[0],
            text: dollar[1],
            displayMode: true
          }
        }
        const bracket = /^\s*\\\[\s*([\s\S]+?)\s*\\\]\s*(?:\n|$)/.exec(source)
        if (!bracket) return undefined
        return {
          type: "blockMath",
          raw: bracket[0],
          text: bracket[1],
          displayMode: true
        }
      },
      renderer: renderMath
    },
    {
      name: "inlineMath",
      level: "inline",
      start(source: string) {
        const dollar = source.search(/\$(?!\$)/)
        const paren = source.indexOf("\\(")
        const positions = [dollar, paren].filter(position => position >= 0)
        return positions.length ? Math.min(...positions) : undefined
      },
      tokenizer(source: string): MathToken | undefined {
        const dollar = /^\$(?!\$)((?:\\.|[^\\$\n])+?)\$(?!\$)/.exec(source)
        if (dollar) {
          return {
            type: "inlineMath",
            raw: dollar[0],
            text: dollar[1],
            displayMode: false
          }
        }
        const paren = /^\\\(((?:\\.|[^\\])+?)\\\)/.exec(source)
        if (!paren) return undefined
        return {
          type: "inlineMath",
          raw: paren[0],
          text: paren[1],
          displayMode: false
        }
      },
      renderer: renderMath
    }
  ]
})

export function renderMarkdown(source: string): string {
  return markdown.parse(source, { async: false }) as string
}
