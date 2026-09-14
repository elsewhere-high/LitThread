# Keep the conversation grounded

LitThread connects library context to compatible ACP agents. Select or add an executable in Settings → Agent and complete that program's installation and login. Local organization, reading and editing remain available without an agent.

## Ask from the material

Open a paper and choose Discuss in the left navigation. Mention files with @, drag material from the tree, or attach a PDF selection. Ask a concrete question, such as “Identify the assumptions of this method and point to the supporting passages.”

Review requested file, command and network actions within the existing permission boundaries. Further messages can be queued during a response. Check model answers against their evidence; they do not establish that an experiment was run.

## Choose a workflow

Skills live in .agents/skills and can be selected in the composer. Use $ to reference a skill and / for available commands. paper-reader supports close reading; author-lookup finds cited public author details; litthread-cli manages the catalog; vault-normalizer organizes folders; deep-research and idea-evaluator support investigations and reviews.

Close reading needs readable paper text. Automatic paper reading is off by default. Outputs belong in the paper's NOTES.md while preserving existing notes. The CLI does not run agents or automatically produce a full research interpretation.

Create a folder with SKILL.md for a new skill, declaring its scope and expected inputs and outputs. Keep API keys outside the library. Read `.agents/skills/README.md` before customizing bundled skills.

Continue with [[03 Markdown and Wikilinks]] to connect ideas across papers.
