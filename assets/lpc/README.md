# LPC art for the avatar world

The art folders of the [Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator)
(`spritesheets/`, `sheet_definitions/`, `palette_definitions/` at its master), vendored so every
install has the same art with no download. The server composites each guest's avatar from these
layers (`server/modules/world/compose.ts`).

This art is NOT under Homeboard's MIT license. Each layer carries its own license (CC0, OGA-BY,
CC-BY or CC-BY-SA) and authors, listed per file in [CREDITS.csv](CREDITS.csv) and in each sheet
definition's `credits`. The server writes a credits file next to the sheets it generates, covering
exactly the layers in use.
