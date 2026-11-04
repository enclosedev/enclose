# Notice

Copyright (C) 2026 Glauber

Enclose is free software: you can redistribute it and/or modify it under the terms of
the GNU Affero General Public License, version 3, as published by the Free Software
Foundation. It is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. The whole of it is in [LICENSE](LICENSE).

In short: use it, change it and pass it on, for anything. Whatever you pass on, or run
as a service for others, goes with its full source and under this same license, your
changes included.

Additional permission under GNU AGPL version 3 section 7: if you modify this Program,
or any covered work, by linking or combining it with the Claude Agent SDK
(`@anthropic-ai/claude-agent-sdk`), or a modified version of that library, containing
parts covered by the terms of that library's own license, the licensors of this Program
grant you additional permission to convey the resulting work.

The name Enclose and its mark are not licensed with the code. A fork goes by a name and
a mark of its own.

Some of what is here came from others, and stays under their terms:

- [`apps/desktop/src/components/ui`](apps/desktop/src/components/ui) began as [shadcn/ui](https://ui.shadcn.com)'s
  components (MIT).
- [`examples/arm/source`](examples/arm/source) is the SO-101 arm's own CAD file, by
  TheRobotStudio (Apache 2.0): its [README](examples/arm/source/README.md) says more.
- The figure of a person that stands in the reference scenes is made from Blender
  Studio's Human Base Meshes (CC0): [`kit/figure`](kit/figure) says how.
- The pictures of wood, cloth and carbon fibre that materials are drawn with are from
  [ambientCG](https://ambientcg.com) (CC0):
  [`apps/desktop/src/assets/materials/SOURCES.md`](apps/desktop/src/assets/materials/SOURCES.md)
  says which.

The packages the app is built with, React, three.js and tscircuit's among them, go out
with it under their own licenses. Each build lists them, with their texts, in
`THIRD-PARTY-LICENSES.txt` ([`scripts/licenses.mjs`](apps/desktop/scripts/licenses.mjs)),
which the app carries and opens from its settings (Enclose, Third-party licenses).
The git that keeps a project's history goes out with it too, as
[dugite](https://github.com/desktop/dugite) brings it: Git, under the GNU GPL, version 2,
and Git LFS, under the MIT License. That file has their texts, and says where Git's source
is: in each release, beside the app. [`apps/desktop/licenses`](apps/desktop/licenses)
keeps the texts it is written from.
