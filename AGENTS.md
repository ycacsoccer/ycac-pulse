# Project updates and deployment

After making requested changes, verify them, then always commit and push the
task-related files to `main` to deploy. Include any required verification
snapshot changes, but do not include unrelated work.

Pushing to `main` triggers `.github/workflows/pages.yml`. Watch that workflow
through verification, deployment, and post-deploy smoke tests; confirm the
published `build-info.json` matches the pushed commit before reporting success.
If any stage fails, investigate and report the blocker rather than claiming
the update is deployed or bypassing the verification gate.

## Japanese writing

Use natural, fluent Japanese throughout the project, with football terms that
players in Japan would normally use. Avoid literal translations and stiff,
AI-sounding phrasing. Review existing Japanese when working on the project and
improve awkward wording while preserving the intended meaning and match facts.
