# 文脉研究工具 / Research tools

This folder holds the skills available to assistants in this library. It travels with the user's research material; it is not an application configuration or credential store.

Add a tool at `skills/<id>/SKILL.md`, describe its scope in YAML frontmatter, and select it from the composer when the task calls for it. Read [the skill index](skills/README.md) before choosing a bundled workflow.

Keep secrets outside this folder. The application only seeds missing files, while versioned bundled skills have the explicit update behavior described in the index. Unversioned user skills remain under the user's control.
