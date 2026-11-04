# Where these come from

The pictures of a grain or a weave that Render lays on a part (see
`shared/materials.ts`), from [ambientCG](https://ambientcg.com), CC0: free to use for
anything, with nothing owed. Each is the set's colour, normal (OpenGL) and roughness
maps, made smaller (1024 px, the roughness 512 px) and saved again as JPEG.

| Files | ambientCG |
|---|---|
| `oak-*` | [Wood049](https://ambientcg.com/view?id=Wood049) |
| `walnut-*` | [Wood051](https://ambientcg.com/view?id=Wood051) |
| `maple-*` | [Wood068](https://ambientcg.com/view?id=Wood068) |
| `cherry-*` | [Wood066](https://ambientcg.com/view?id=Wood066) |
| `plywood-*` | [Wood048](https://ambientcg.com/view?id=Wood048) |
| `woven-*` | [Fabric036](https://ambientcg.com/view?id=Fabric036) |
| `felt-*` | [Fabric034](https://ambientcg.com/view?id=Fabric034) |
| `carbon-*` | [Fabric004](https://ambientcg.com/view?id=Fabric004) |

A material's `colour` in `shared/materials.ts` is the average of its colour map, which is
what Solid draws a part made of it in.
