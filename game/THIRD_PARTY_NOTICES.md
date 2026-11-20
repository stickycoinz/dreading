# DREADING (AI-MERGE sandbox) - third-party notices

This build contains code ported from the projects below. Each keeps its own license; the full texts follow.

## 1. Riposte: Frontline (game code, MIT)

Source: https://github.com/BenDBSS/Riposte-Frontline-Source (also the NIGHT_SURVIVAL build, which is derived from it; read only).
Ported into DREADING (logic only, adapted to PlayCanvas and to DREADING's squad AI):

| DREADING file | Riposte source |
|---|---|
| tactical-ns-combat.js | 07-bots.js (fireRay, rayEntities, falloff, spread, bot aim), 07c-controller.js (weapon state, tube reloads, switch), 07ca-recul.js |
| tactical-arsenal.js | 06i-armes.js (weapon table), 07ca-recul.js (RECOIL table, recoilShot), TEMPO_ARMES, SWITCH |
| tactical-grenades.js | 07-bots.js (spawnNade, nadeHit, updateNades, explode, flashSeen/flashBang, smoke, botThrowNade, botNadeClear, botFlee), 07b-tactics.js (grenade decisions), player cookNade / releaseNade / nadeArc |
| tactical-drones.js | 08e-fpv.js (fpvLaunch, fpvWish, fpvAi, fpvStep, fpvHit, fpvBotsShoot, fpvPlayer), UAV pulse |
| tactical-rts-input.js (first person) | 07c-controller.js (movement, jump, recoil recovery, ADS), ctlWeapon / ctlShoot |

Not covered by Riposte's MIT license (see its NOTICE.md) and NOT taken from Riposte here: the name and logo, music, sounds.
**Soldier animations**: Riposte's NOTICE states its soldier clips are baked from Mixamo (Adobe); Mixamo's terms allow use inside a
game but not redistribution on their own. The soldier GLB animations used by this sandbox came from NIGHT_SURVIVAL; before any public
release, re-bake them from your own Mixamo account (or replace them) and do not ship the .bin as a standalone download.

MIT License below.
Some files are not covered by it (game name and logo, music, character animations, some sounds):
see NOTICE.md for the list and the terms that apply to them.

Le code source de Riposte: Frontline est publié sous la licence MIT ci-dessous.
Certains fichiers n'en relèvent pas (nom et logo du jeu, musiques, animations des soldats, certains sons) :
voir NOTICE.md pour la liste et les conditions qui s'y appliquent.

-------------------------------------------------------------------------------

MIT License

Copyright (c) 2026 BenDBSS

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## 2. Yuka 0.7.8 (perception classes, MIT)

Source: https://github.com/Mugen87/yuka - Vision, MemoryRecord, MemorySystem, Regulator ported into tactical-yuka.js.

MIT License

Copyright (c) 2023 Yuka authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## 3. PlayCanvas engine (MIT)

playcanvas-stable.min.js carries its own MIT notice (Copyright PlayCanvas Ltd.) at the top of the file.
