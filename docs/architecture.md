# 结构与数据契约

## 代码的边界

`src/App.tsx` 组合桌面外壳。组件位于 `src/components`，业务动作和 Zustand 状态位于 `src/lib`，订阅与生命周期桥接位于 `src/hooks`。持久化、文件和进程操作通过 Tauri 命令进入 `src-tauri`，不在 React 组件中直接实现。

`crates/litthread-core` 共享目录索引、文献处理、Markdown 双链、翻译与知识库模板等能力。`cli` 使用共享 crate 提供机器接口；桌面端另行承载 Agent 会话、窗口、连接和原生交互。CLI 不启动研究 Agent。

Dockview 管理文档和拆分布局；固定研究导航负责主要入口，文件目录表达知识库结构。设置、文档和研究面板可以有独立窗口，因此公共样式和语言资源必须适用于所有入口。

## 一个知识库

```text
research-library/
├── AGENTS.md
├── papers/<topic>/<paper>/
│   ├── NOTES.md
│   ├── paper.pdf
│   ├── PAPER.md
│   ├── source/
│   ├── marks/
│   ├── assets/
│   └── attachments/
├── notes/
├── plans/
├── .agents/skills/
└── .litthread/
    ├── catalog.sqlite
    ├── config.json
    └── .trash/
```

论文标识采用知识库相对文件夹路径，不能仅使用最末级名称。`papers/` 可以有任意层级的组织目录；论文目录通过直接子项中的论文标记识别。按需建立附件目录，附件本身不构成论文身份标记。

`NOTES.md` 是用户笔记；`PAPER.md` 是可重新解析的正文；`source/` 是应保留的原始材料；`marks/*.json` 是批注和阅读相关记录。不要把用户附件放入原文目录，或直接改写 PDF 二进制来存储批注。

## 改动时保持的约束

- 路径同时兼容 Windows 分隔符、本地路径与远程知识库句柄。
- 重命名与移动经过现有双链检查和修复流程；保留链接别名、标题锚点和嵌入语法。
- 数据库迁移、JSON schema 与协议版本按数据兼容性管理，独立于应用版本。
- Agent 文件、命令与网络操作遵守现有授权边界。
- 新建模板只补充缺失文件；有版本的捆绑技能遵循显式升级规则。

第三方依赖补丁位于 `patches/`，相关包和校验由 pnpm 锁文件引用。移动原生壳位于 `src-tauri/gen`，编译生成的 Externals、assets、build 和本地签名文件不提交。
