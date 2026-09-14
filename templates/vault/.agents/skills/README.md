# 文脉的研究工作流

按研究问题选择技能。技能给出处理步骤；资料、判断和完成情况仍需由执行者核实。对话输入区可以选择技能，`$` 引用技能，`/` 提供相应命令入口。

| 目标 | 技能 | 交付材料 |
| --- | --- | --- |
| 理解一篇论文 | paper-reader | 保留已有内容的 NOTES.md |
| 核对作者公开入口 | author-lookup | 带来源的作者信息与附件报告 |
| 用命令管理资料 | litthread-cli | 实际命令结果和机器可读索引 |
| 整理研究目录 | vault-normalizer | 经核对的目录和双链诊断 |
| 评估研究问题 | idea-evaluator | 有依据的评审与下一步 |
| 跨文献调查 | deep-research | 可追溯引用的研究综述 |

## 编辑与更新

应用创建知识库时补充缺失文件。有整数 `version` 的捆绑技能在版本低于应用模板时升级；相同或更高版本保持不变。没有 `version` 的技能属于用户管理，不自动覆盖。需要长期保留自己的修改时，移除该字段或使用更高版本，再记录自己的维护方式。

CLI 模板按平台提供 POSIX 的 `litthread` 或 Windows 的 `litthread-cli` 命令名称。它管理资料，不执行研究 Agent。

## 第三方许可

`idea-evaluator` 和 `deep-research` 的研究方法资源来自 [HKUSTDial/Supervisor-Skills](https://github.com/HKUSTDial/Supervisor-Skills)，署名 Yuyu Luo 等，使用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 许可。完整文本见 [LICENSE-Supervisor-Skills.txt](LICENSE-Supervisor-Skills.txt)。其许可独立于文脉代码许可，使用与再分发时保留原有条件。

其余随应用提供的技能遵循项目根目录的 LICENSE。
