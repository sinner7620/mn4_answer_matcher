# Beta 25 运行基线

`runtime-baseline/` 来自用户提供的：

`C:\Users\mrwuy\Downloads\mn4-answer-matcher-v2.3.1-beta.25.mnaddon`

该安装包是当前 beta 工作树的运行代码基准，清单版本为 `2.3.1-beta.25`。

同时校验了用户提供的：

`E:\iCloudDrive\同步文件夹\mn4-answer-matcher-v2.3.1-beta.24-source.zip`

该 ZIP 虽然文件名带有 `source`，但内容仍是编译后的插件运行文件，并不包含开发源码。
逐文件比较确认 beta.24 到 beta.25 只有以下差异：

1. `AnswerMatcherCore.js` 中 7 处版本字符串由 `2.3.1-beta.24` 更新为
   `2.3.1-beta.25`，除此以外完全一致。
2. `web-dist/app.css` 中详情页等级选择器的 0–5 级颜色改为与设置页一致。
3. `mnaddon.json` 的版本由 beta.24 更新为 beta.25。

其他运行文件的 SHA-256 均完全一致。

安装包没有 TypeScript、React 源码或 source map，因此无法无损还原其原始源码。默认的
`npm run build` 会以 `runtime-baseline/` 中的 `AnswerMatcherCore.js` 和 `web-dist/` 为基准，
再覆盖 `rails-native/` 中可维护的原生桥接文件并生成插件包，防止较旧的源码编译结果覆盖
beta.25 运行代码。

原来的源码构建流程保留为 `npm run build:source`，在源码与运行基线完成对齐前，不应将其
产物作为 beta.25 或后续 beta 版本发布。
