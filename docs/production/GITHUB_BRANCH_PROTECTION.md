# GitHub branch protection — activation plan, not applied

Development remains local. Railway is retired; VPS, domain, Cloudflare and
persistent staging are not provisioned. No deployment workflow is authorized.

Flow: feature PR → `integrate/full-stack` → reviewed release PR → `main`.
No automatic merge or deploy. Dependabot proposes reviewed weekly updates with
at most three open version-update PRs per ecosystem, no blind major grouping or
auto-merge. Security updates must remain visible; repository feature availability
and activation have not been verified remotely.

After Phase A external PASS, owner commits/pushes the reviewed candidate.
First verify a real successful workflow on that exact latest SHA. Only then enable
required check **CI Gate** (stable unique name). Part12 Phase A local gates are PASS;
external review and actual GitHub execution are still pending. Do not activate
protection based solely on the local rehearsal.

For `main`: require PR, CI Gate, block force push/deletion; require conversation
resolution when compatible with team workflow. For `integrate/full-stack`: block
force push and require CI Gate for reviewed merges when the team is ready. Review
bypass/admin policy separately; avoid locking the owner out during activation.

`CI Gate` must run with `always()` and reject failure/cancellation/skipping of any
mandatory dependency. Workflow: Contracts, Go Quality, Nest Reference, Frontend,
Security, PostgreSQL Integration, Ephemeral Staging. No path-filter skip loophole.
No repository settings changed in Phase A; GitHub execution **NOT RUN**.
