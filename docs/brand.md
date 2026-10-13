# 文脉界面约定

英文项目名为 **LitThread**，中文名为 **文脉**；界面与文档可组合显示为 **LitThread · 文脉**。项目目录和应用文件名使用 `LitThread`，包、命令与技术文件名使用 `litthread`，应用标识为 `local.litthread`。应用图标由 `src/assets/litthread-app-icon.svg` 中的原创矢量路径构成：纸色 L、铜色 T 与延伸线条，表达资料与思路的连接。

默认外观使用暖纸色底、深墨绿导航与铜色标记。标题采用阅读感较强的衬线字体，操作与正文使用系统可读字体。暗色模式沿用墨绿和纸色关系；用户仍可切换已有主题预设。

结构分为固定研究导航、知识库目录、文档工作区和研究对话。文献索引使用独立标题、数量、搜索和导入区域；发现页按来源展示；欢迎与首次设置采用书页布局。共享 `brand.css` 覆盖窗口、菜单、输入、弹窗、空状态与移动配对，页面不得另造互相冲突的主题色。

交互文案同时提供英文与简体中文。空状态解释下一步，错误说明实际失败点；不编造服务能力、组织、官网或联系方式。所有图标按钮需要可访问名称；键盘焦点、减少动效和小屏可滚动区域必须保留。

文献长标题最多显示两行，保留全文提示、复制与阅读热度。证据工作台沿用原有表单与双栏结构，以纸色卡片和轻阴影区分输入与操作；支持、反证和背景分别使用主色、铜色和次要文字色的边线，关系仍由文字明确表达。

更新应用图标时，先生成到新的临时目录，再覆盖图标目录；这样可以确保已有移动平台图标也更新。

```sh
mkdir -p .qa
icon_output=$(mktemp -d .qa/brand-XXXXXX)
pnpm tauri icon src/assets/litthread-app-icon.svg --output "$icon_output"
cp -R "$icon_output/." src-tauri/icons/
node scripts/sync-brand-icons.mjs
```

Windows 安装器侧栏是单独的 164 × 314 位图，位于 `src-tauri/icons/nsis-sidebar.bmp`。新的文档截图保存在 `docs/images/`。
