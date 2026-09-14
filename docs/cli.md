# LitThread 命令行

CLI 在桌面应用之外访问知识库与文献索引，可用于脚本、导入和导出。其输出不包含 Agent 推理；模型会话由桌面端或调用它的外部 Agent 执行。

```sh
pnpm cli:bundle
./target/debug/litthread-cli --help
./target/debug/litthread-cli --version
```

在源码目录外分发 CLI 时，把 `src-tauri/pdfium/` 中的本平台 PDFium 动态库放到 CLI 可执行文件旁，供独立 PDF 解析工作进程加载。

构建完成后可直接使用二进制绝对路径，也可通过桌面“设置 → 关于”安装命令。macOS/Linux 的用户命令为 `litthread`，Windows 使用 `litthread-cli`。没有发行仓库配置时，设置页使用本地已构建的 CLI，不进行在线下载。

## 找到知识库

按以下顺序解析位置：`--vault <路径>`、环境变量 `LITTHREAD_VAULT`、从当前目录向上查找 `.litthread/catalog.sqlite`、CLI 配置的默认知识库。自动化建议显式传递 `--vault`。

```sh
litthread --vault /path/to/library vault info --json
litthread --vault /path/to/library paper list --json
litthread --vault /path/to/library wiki check --json
litthread open /path/to/library
```

以实际 `--help` 为命令参数的依据。`--json` 返回便于脚本处理的结构，`--pretty` 便于人工阅读；错误写入 stderr 并返回非零状态。删除等破坏性操作仍需要其原有确认或显式 `--yes`，不要为方便脚本默认添加该选项。

## 常见用途

先列出论文，再获取单篇元数据与真实路径。阅读时优先查看 TeX 或 `PAPER.md`，缺失正文时使用 `paper parse`。导入只建立资料与笔记骨架，不代表精读已经完成。导出命令可生成 BibTeX 等交换文件。

内置 [CLI 技能](../templates/vault/.agents/skills/litthread-cli/SKILL.md)提供分层读取、命令发现和 JSON 使用约定；Windows 使用同目录中的平台版本。翻译端点、学术接口与网络下载说明见[服务配置](services.md)。
