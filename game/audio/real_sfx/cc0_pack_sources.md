# DREADING SFX audition pack — sources

Processed on the box only (2026-11-19, America/Los_Angeles). No AI generation. Nothing was copied to a user PC or wired into the game. The earlier ElevenLabs weapon batch in `/workspace/dreading_sfx/weapons/` was left as-is and is not part of this pack.

All clips: trim + short fades, stereo 44.1 kHz MP3 192 kbps, under ~5 s. Guns and explosions peaked near −2 dBTP. Mono sources were upmixed to identical L/R. Spectrogram checks showed natural decay and no digital buzz tails. Outdoor / echo tails were kept where the recording had them.

## License summary

**Sonniss #GameAudioGDC bundles** (https://sonniss.com/gameaudiogdc, license https://sonniss.com/gdc-bundle-license/): worldwide, non-exclusive, royalty-free license for synchronization in personal and commercial media (games, film, TV, interactive). No attribution required. May modify. May not resell or redistribute the sounds *as sound effects* (including in SFX/asset packs). AI/ML training is prohibited. Copyright remains with the original publishers listed below.

GDC parts are tasters (a few files per library, not the full commercial library). Files were pulled by HTTP range-extract of individual ZIP members from `downloads.sonniss.com`, not by downloading whole multi-GB parts.

**Freesound CC0** (https://creativecommons.org/publicdomain/zero/1.0/): public domain dedication; commercial use allowed, no attribution required (credit still listed here). Original WAVs/FLACs require a Freesound login; clips below were made from the official HQ MP3 preview of the same recording. Several of these are extracts from public-domain U.S. government video, so they are band-limited compared with the 96 kHz GDC WAVs.

---

## distant_rifle

Sonniss tasters had **no clean rifle single at 100 m+**. The only 100 m+ rifle take is a 300 m BAR double. The other two candidates are clean 50 m singles.

### `/workspace/dreading_sfx/cc0_pack/distant_rifle_A.mp3`
- **What:** M1918 Browning Automatic Rifle .30 cal, 300 m in front, double shot with a long outdoor tail. Only rifle take in the tasters recorded past 100 m — a double, not a single. Clean, no clipping.
- **Original:** `M1918_Browning_Automatic_Rifle_.30cal_300m_in_front_Double_shots_x_1.wav`
- **Bundle/part:** Sonniss GDC 2016, part 4 of 6
- **Publisher / library:** Pole Position Production — M1918 Browning Automatic Rifle .30cal
- **License:** Sonniss GDC Game Audio Bundle License (RF commercial media; no attribution required)

### `/workspace/dreading_sfx/cc0_pack/distant_rifle_B.mp3`
- **What:** Remington 700 7.62×51, single shot at 50 m behind the gun, with the delayed crack / reflection that follows. Clean, no clipping. Mono source upmixed.
- **Original:** `Remington_700_7.62x51mm_50m_behind_788_Schoeps_B_clean_Single_shots_x_14.wav` (shot ~4.0–7.2 s)
- **Bundle/part:** Sonniss GDC 2016, part 4 of 6
- **Publisher / library:** Pole Position Production — Remington 700 7.62x51mm
- **License:** Sonniss GDC Game Audio Bundle License

### `/workspace/dreading_sfx/cc0_pack/distant_rifle_C.mp3`
- **What:** Mosin-Nagant, single shot, 50 m distant front-left, natural outdoor decay. Clean. Mono source upmixed.
- **Original:** `MN0115 MOSIN-NAGANT 50m distant front left shots.wav` (shot ~41.9–45.4 s)
- **Bundle/part:** Sonniss GDC 2020, part 4 of 14
- **Publisher / library:** FLYSOUND — Mosin Nagant
- **License:** Sonniss GDC Game Audio Bundle License

---

## distant_auto

### `/workspace/dreading_sfx/cc0_pack/distant_auto_A.mp3`
- **What:** M1928A1 Thompson .45, 300 m in front, burst of four with outdoor decay. Clean, no clipping.
- **Original:** `M1928A1_Thompson_Submachine_Gun_.45cal_300m_in_front_Burst_of_four_x_1.wav`
- **Bundle/part:** Sonniss GDC 2016, part 4 of 6
- **Publisher / library:** Pole Position Production — M1928A1 Thompson Submachine Gun .45cal
- **License:** Sonniss GDC Game Audio Bundle License

### `/workspace/dreading_sfx/cc0_pack/distant_auto_B.mp3`
- **What:** M3 Grease Gun .45, 300 m in front, burst of thirteen plus a long field-echo tail. Clean, no clipping. Best distant automatic tail in the set.
- **Original:** `M3_Submachine_Grease_Gun_.45cal_300m_in_front_Burst_of_thirteen_x_1.wav`
- **Bundle/part:** Sonniss GDC 2016, part 4 of 6
- **Publisher / library:** Pole Position Production — M3 Submachine Grease Gun .45cal
- **License:** Sonniss GDC Game Audio Bundle License

### `/workspace/dreading_sfx/cc0_pack/distant_auto_C.mp3`
- **What:** HK XM8, distant exterior full-auto burst (later cluster from a multi-take file). Modern 5.56 automatic. Source has a mild transient overshoot; limited on export.
- **Original:** `BR XM8 Auto Distant Exterior.wav` (burst ~30.9–34.5 s)
- **Bundle/part:** Sonniss GDC 2018, part 8 of 8
- **Publisher / library:** Watson Wu — Battle Rifles & Pistols
- **License:** Sonniss GDC Game Audio Bundle License

---

## distant_pistol

### `/workspace/dreading_sfx/cc0_pack/distant_pistol_A.mp3`
- **What:** Glock 17 9 mm, single shot, 100 m in front off-axis (ORTF), with a quiet outdoor tail. Clean, no clipping.
- **Original:** `Glock 17 - FIRING - Take 3 - 100m In Front Off Axis - ORTF - MKH8040.wav` (shot ~15.3–18.7 s)
- **Bundle/part:** Sonniss GDC 2023, part 5 of 14
- **Publisher / library:** Pole Position Production — Glock 17
- **License:** Sonniss GDC Game Audio Bundle License

### `/workspace/dreading_sfx/cc0_pack/distant_pistol_B.mp3`
- **What:** Colt M1911A1 .45, single shot, 200 m front at the target, delayed crack and outdoor tail. A few source transient samples sit at 0 dBFS; limited on export.
- **Original:** `M1911A1, Firing, t2, 200m, Front, Target, M10.wav` (shot ~6.8–10.2 s)
- **Bundle/part:** Sonniss GDC 2020, part 6 of 14
- **Publisher / library:** Pole Position — Colt M1911A1 semi-automatic pistol
- **License:** Sonniss GDC Game Audio Bundle License

### `/workspace/dreading_sfx/cc0_pack/distant_pistol_C.mp3`
- **What:** Smith & Wesson Model 60 .38 Chiefs Special, single shot, 100 m in front off-axis (ORTF), outdoor tail. Clean, no clipping.
- **Original:** `Smith & Wesson 60 - FIRING - Take 1 - 100m In Front Off Axis - ORTF - MKH8040.wav` (shot ~9.7–13.1 s)
- **Bundle/part:** Sonniss GDC 2024, part 5 of 9
- **Publisher / library:** Pole Position — Smith & Wesson .38 Chiefs Special Model 60
- **License:** Sonniss GDC Game Audio Bundle License

---

## explosion_grenade

No GDC taster was literally labeled “frag grenade.” A and C are real M67 fragmentation-grenade recordings pulled from public-domain U.S. military video (band-limited). B is a real close mortar explosion from Coll Anderson, included as the closest high-quality close blast in the GDC tasters.

### `/workspace/dreading_sfx/cc0_pack/explosion_grenade_A.mp3`
- **What:** M67 fragmentation grenade explosion with echo (take 3). Real recording from U.S. government video; band-limited (~13 kHz) because of the video source. This clip is from the Freesound HQ preview.
- **Original:** `M67 Fragmentation Grenade Explosion 3` (Freesound sound 67472)
- **Source:** https://freesound.org/people/qubodup/sounds/67472/
- **Publisher:** qubodup (U.S. government video, public domain)
- **License:** CC0 1.0 (public domain dedication)

### `/workspace/dreading_sfx/cc0_pack/explosion_grenade_B.mp3`
- **What:** Exterior mortar explosion, close, with decay and late debris ticks. Not a grenade — a real mortar blast. Excerpt starts at the main detonation (an earlier low rumble in the file was left out). Clean, no clipping.
- **Original:** `EFX EXT Mortar Explosion 08.wav` (blast ~2.3–7.1 s)
- **Bundle/part:** Sonniss GDC 2015, part 1 of 5
- **Publisher / library:** Coll Anderson — Guns
- **License:** Sonniss GDC Game Audio Bundle License

### `/workspace/dreading_sfx/cc0_pack/explosion_grenade_C.mp3`
- **What:** M67 fragmentation grenade explosion (take 4), shorter than A but with a complete decay (not truncated). Same U.S. government video lineage; band-limited. Freesound HQ preview.
- **Original:** `m67_fragmentation_grenade_explosion_4.flac` (Freesound sound 67474)
- **Source:** https://freesound.org/people/qubodup/sounds/67474/
- **Publisher:** qubodup (U.S. government video, public domain)
- **License:** CC0 1.0 (public domain dedication)

---

## explosion_distant

Only two strong, unique distant / artillery recordings passed inspection. Designed “far explosion” packs (Gamemaster, Stefano Cremona, Bluezone Detonation) were inspected and skipped (clipping and/or processed character).

### `/workspace/dreading_sfx/cc0_pack/explosion_distant_A.mp3`
- **What:** M101 / C1 105 mm howitzer, distant, right side — a thick pounding shot with a long low rumble. Mild source transient overshoot; limited on export.
- **Original:** `Howitzer,M101,C1,105 mm,Distant,Right Side,Shot,Pound,Thick.wav`
- **Bundle/part:** Sonniss GDC 2019, part 1 of 8
- **Publisher / library:** Airborne Sound — Battlefield Howitzers
- **License:** Sonniss GDC Game Audio Bundle License

### `/workspace/dreading_sfx/cc0_pack/explosion_distant_B.mp3`
- **What:** Distant cannon firing in a forest (two shots about two seconds apart, plus rumble). A hotter early cluster in the same file was skipped because of clipping.
- **Original:** `warfare_t1b_cannon_firing_forest_distant_MKH8060_2.wav` (~16.2–21.2 s)
- **Bundle/part:** Sonniss GDC 2017, part 6 of 9
- **Publisher / library:** Pole Position — The Warfare Library
- **License:** Sonniss GDC Game Audio Bundle License

---

## explosion_vehicle

Only two strong real “vehicle / large with debris” takes. A third unique recording was not found in the tasters (Coll Anderson Car Destruction is impacts/scrapes, not explosions).

### `/workspace/dreading_sfx/cc0_pack/explosion_vehicle_A.mp3`
- **What:** RPG firing and impact through a car roof, hitting metal, with debris ticks in the tail. Clean, no clipping. Best vehicle+debris take in the set.
- **Original:** `RPG - FIRING AND IMPACT - Through Car Roof Hit Metal - XY - MKH8040.wav`
- **Bundle/part:** Sonniss GDC 2024, part 6 of 9
- **Publisher / library:** Pole Position — The Warfare 2 Library
- **License:** Sonniss GDC Game Audio Bundle License

### `/workspace/dreading_sfx/cc0_pack/explosion_vehicle_B.mp3`
- **What:** Tank-mine explosion mounted on a metal beam, recorded distant (AMBEO). Long rumble and sparse metal/debris ticks. Clean. Mono source upmixed.
- **Original:** `Tank Mine - EXPLOSION - Mounted on Metal Beam - DISTANT - AMBEO BLD.wav` (blast ~0.6–5.6 s)
- **Bundle/part:** Sonniss GDC 2024, part 6 of 9
- **Publisher / library:** Pole Position — The Warfare 2 Library
- **License:** Sonniss GDC Game Audio Bundle License

---

## suppressed_rifle

The existing close (1 m) Sako TRG-22 silencer and De Lisle 1 m takes from the earlier pack were **not** re-exported. This set uses a different distance on the De Lisle and two U.S. government suppressed-sniper singles.

### `/workspace/dreading_sfx/cc0_pack/suppressed_rifle_A.mp3`
- **What:** De Lisle carbine .45 ACP, suppressed, 55 m in front off-axis. Real suppressed report at distance; WWII-era carbine, not a modern AR. Different file/distance from the 1 m take used previously. Clean. Mono source upmixed.
- **Original:** `De_Lisle_Carbine_.45ACP_suppressed_55m_in_front_off_axis_clean_Single_shots_x_14.L.wav` (shot ~4.0–6.1 s)
- **Bundle/part:** Sonniss GDC 2016, part 3 of 6
- **Publisher / library:** Pole Position Production — De Lisle Carbine .45ACP suppressed
- **License:** Sonniss GDC Game Audio Bundle License

### `/workspace/dreading_sfx/cc0_pack/suppressed_rifle_B.mp3`
- **What:** Silenced sniper-rifle single (first shot). Extracted from a U.S. government training video, public domain. Band-limited video source. Modeled bursts later in the same file (repeated singles at 0.1 s) were not used. HQ preview has a mild transient clip; limited on export.
- **Original:** `Silenced Sniper Rifle.flac` (Freesound sound 182815), first single ~0.9–2.9 s
- **Source:** https://freesound.org/people/qubodup/sounds/182815/
- **Publisher:** qubodup (U.S. government video, public domain)
- **License:** CC0 1.0 (public domain dedication)

### `/workspace/dreading_sfx/cc0_pack/suppressed_rifle_C.mp3`
- **What:** Same silenced-sniper recording as B, second real single (~3.0–5.9 s). The later “modeled bursts” were skipped.
- **Original:** Freesound 182815, second single
- **Source / publisher / license:** same as suppressed_rifle_B

---

## suppressed_pistol

**Not filled.** GDC tasters had no real live-fire suppressed pistol. A Pole Position PPK-with-suppressor take is blank-fire (skipped). Gamemaster Audio “Silenced Gun Sounds” `gun_pistol_shot_silenced_04.wav` is short, clipped, and from the same designed library whose silenced-sniper take was skipped in the earlier pack. Freesound CC0 “silenced pistol” hits checked (hoot_avi 100465, morganpurkis 380185 “created with Audacity,” Clutvh 627087, fireballuke 166493) are designed, undocumented, or too low-quality to treat as real recordings.

## suppressed_smg

**Not filled.** No real suppressed SMG/burst in the GDC tasters (Uzi / MP5 / Grease / Thompson takes are unsuppressed; the Uzi 75 m file was also mildly clipped). The only CC0 candidate that claimed to be a recording — Kodack Freesound 257364 “Silenced Submachine gun,” Sony HDR-PJ260V camcorder, edited in Audacity — is consumer-camera quality (~16 kHz band-limit), with shots spaced on a regular ~0.25 s grid (pre-processed cadence, not a realistic SMG rate). It was inspected and skipped.

---

## Processing notes

- GDC clips came from original 24-bit WAV members of the GDC zips (typically 96 kHz), pulled by HTTP range-extract of a single ZIP member.
- Freesound clips were transcoded from official HQ MP3 previews of the same recordings, then re-encoded at 192 kbps. A logged-in Freesound download of the original WAV/FLAC would be a higher-quality replacement for those stems. The U.S. government video extracts remain band-limited even in the originals.
- Mono recordings (Remington 700, Mosin-Nagant, De Lisle 55 m and 1 m, tank mine, AK-47 2 m, MP5 1 m hall, PPSh-41, MG4 1 m, Sako TRG-22 silencer 1 m) were upmixed to stereo by duplicating the channel.
- Reload, handling, blank-fire, designed/processed libraries, and heavily clipped takes were excluded.
- Not used (inspected, skipped): Pole Position AK5 50 m behind buildings (usable shot, but a high hissy noise floor); FLYSOUND AK-74 far 3-round burst (source clipping); Pole Position G36C 50 m and Uzi 75 m (clipped); Glock 18c 75 m (clipped); Sig P229 50 m (only 50 m, and not needed); Gamemaster silenced pistol and silenced sniper (clipped / designed); PPK suppressor blanks; Bluezone mortar / urban / smoke-grenade and “Detonation” designed explosions (clipped and/or processed); David Dumais “Medium Realistic Explosion” (designed sub-tail); Stefano Cremona Far/Big explosions (heavy clipping, processed); Gamemaster far / large explosions (designed or clipped); Freesound 184360 suppressed sniper (HQ preview heavily clipped); Freesound 67469 M67 take (truncated mid-decay); Kodack 257364 camcorder SMG (see above); layered firecracker “grenade” SFX.

---

# Follow-up pack — close automatic + close suppressed (2026-11-19, America/Los_Angeles)

Same method and processing as above. All earlier `cc0_pack` files were kept. Nothing was copied to a user PC or wired into the game. Close-auto bursts are 1–4 s; low end / body was preserved (peak matching only, no loudness-style flatten). Some close-mic Pole Position transients have a few clipped source samples; those are noted and were limited on export.

## close_auto_rifle

### `/workspace/dreading_sfx/cc0_pack/close_auto_rifle_A.mp3`
- **What:** M4 assault-rifle burst (two short strings a fraction of a second apart). Clean, no source clipping. Strong close body.
- **Original:** `Assault Rifle - M4 - 03 - Burst 03.wav`
- **Bundle/part:** Sonniss GDC 2016, part 2 of 6
- **Publisher / library:** Fascinated Sound — The Gun Locker SFX Pack
- **License:** Sonniss GDC Game Audio Bundle License

### `/workspace/dreading_sfx/cc0_pack/close_auto_rifle_B.mp3`
- **What:** AK5 (library labels it 7,62 mm), long burst, 3 m behind left in a large hall (MS, MKH418S). Clean, no clipping. Hall body and low end intact. First burst from a two-burst file.
- **Original:** `AK5 7,62mm - FIRING - Large Hall - Long Bursts - 3m Behind Left - MS Decoded - MKH418S.wav` (first burst)
- **Bundle/part:** Sonniss GDC 2024, part 6 of 9
- **Publisher / library:** Pole Position — The Indoor Gun Acoustics 2 Library
- **License:** Sonniss GDC Game Audio Bundle License

### `/workspace/dreading_sfx/cc0_pack/close_auto_rifle_C.mp3`
- **What:** AK-47 outdoor full-auto burst, 2 m above/behind the gun, big open area. Same source file as the earlier pack’s `ak47_C` single-session burst. Slight source transient overshoot; limited on export. Mono source upmixed.
- **Original:** `AK47_big_open_area_2m_above_behind_gun_RSM191_M.wav` (burst ~23.4–26.2 s)
- **Bundle/part:** Sonniss GDC 2018, part 5 of 8
- **Publisher / library:** Pole Position — The Outdoor Gun Acoustics Library
- **License:** Sonniss GDC Game Audio Bundle License

## close_auto_smg

### `/workspace/dreading_sfx/cc0_pack/close_auto_smg_A.mp3`
- **What:** HK MP5 9 mm, 1 m side, bursts in a large hall (MKH8060). Six-round burst with hall tail. Clean (a later burst was used; the file’s first burst had a single 0 dBFS sample). Mono source upmixed.
- **Original:** `MP5 9mm - FIRING - Large Hall - Bursts - 1m Side - MKH8060.wav` (second burst ~4.4–6.1 s)
- **Bundle/part:** Sonniss GDC 2024, part 6 of 9
- **Publisher / library:** Pole Position — The Indoor Gun Acoustics 2 Library
- **License:** Sonniss GDC Game Audio Bundle License

### `/workspace/dreading_sfx/cc0_pack/close_auto_smg_B.mp3`
- **What:** MP 40 submachine-gun burst, about two seconds, several rounds with a brief pause mid-string. Clean, no source clipping.
- **Original:** `Submachine Gun - MP 40 - 02 - Burst.wav`
- **Bundle/part:** Sonniss GDC 2016, part 2 of 6
- **Publisher / library:** Fascinated Sound — The Gun Locker SFX Pack
- **License:** Sonniss GDC Game Audio Bundle License

### `/workspace/dreading_sfx/cc0_pack/close_auto_smg_C.mp3`
- **What:** PPSh-41 long burst (MKH416). Dense full-auto with a strong low end and clean decay. Distance isn’t in the filename; the mic and level read as a close take. Clean, no clipping. Mono source upmixed. First of two long bursts in the file.
- **Original:** `PPSh41, Firing, t1, Burst, Long, MKH416.wav` (first burst)
- **Bundle/part:** Sonniss GDC 2020, part 9 of 14
- **Publisher / library:** Pole Position — Tokarev PPSh-41 submachine gun
- **License:** Sonniss GDC Game Audio Bundle License

## close_auto_mg

No M249, M60, or PKM tasters were in the GDC parts. Closest: a clean 3 m Browning M2 .50 warehouse burst (HMG) and a 1 m HK MG4 5.56 burst (SAW / Minimi-class LMG). An L110A2 / FN Minimi taster exists but is only two single shots, not a burst (not used).

### `/workspace/dreading_sfx/cc0_pack/close_auto_mg_A.mp3`
- **What:** Browning M2 .50 machine gun, 3 m in a medium warehouse (RSM191 MS), longer burst (~2 s of fire plus warehouse decay). Clean, no source clipping. Lots of low-end body.
- **Original:** `Audiobeast_Medium_Warehouse_Browning_M2_.50_Machine_Gun_03m_RSM191_MS_Raw_002_Burst_x2.wav` (second burst ~23.1–26.4 s)
- **Bundle/part:** Sonniss GDC 2016, part 1 of 6
- **Publisher / library:** Audiobeast — The London Warehouse Firearms Library
- **License:** Sonniss GDC Game Audio Bundle License

### `/workspace/dreading_sfx/cc0_pack/close_auto_mg_B.mp3`
- **What:** Same M2 session, the earlier shorter burst (~16 rounds) plus warehouse tail. Clean, no source clipping.
- **Original:** same file as A (first burst ~19.5–21.4 s)
- **Bundle/part / publisher / license:** same as close_auto_mg_A

### `/workspace/dreading_sfx/cc0_pack/close_auto_mg_C.mp3`
- **What:** HK MG4 5.56 mm LMG, 1 m left off-axis, short burst (first of 16). Closest M249-class take in the tasters. Close-mic source transients overshoot 0 dBFS; limited on export. Mono source upmixed.
- **Original:** `HK_MG4_5.56mm_1m_left_off_axis_MKH416_clean_Bursts_x_16.wav` (first burst)
- **Bundle/part:** Sonniss GDC 2016, part 3 of 6
- **Publisher / library:** Pole Position Production — Heckler & Koch MG4 5.56mm
- **License:** Sonniss GDC Game Audio Bundle License

## suppressed_close_rifle

These are the close (1 m) Pole Position takes. They are a different perspective from the earlier pack’s 55 m De Lisle and U.S. government video snipers, which read as distant.

### `/workspace/dreading_sfx/cc0_pack/suppressed_close_rifle_A.mp3`
- **What:** Sako TRG-22 with silencer, 1 m right, first shot. Modern suppressed bolt-action, shooter-perspective body and a natural short decay. Same source file as the earlier game-pack `suppressed_rifle_A` (first shot is the cleanest in the file). A few close-mic source transient samples sit at 0 dBFS; limited on export. Mono source upmixed.
- **Original:** `Sako_TRG_22_TRG_silencer_1m_right_MKH8040_1_clean_Single_shots_x_6.wav` (first shot)
- **Bundle/part:** Sonniss GDC 2016, part 4 of 6
- **Publisher / library:** Pole Position Production — Sako TRG 22
- **License:** Sonniss GDC Game Audio Bundle License

### `/workspace/dreading_sfx/cc0_pack/suppressed_close_rifle_B.mp3`
- **What:** De Lisle carbine .45 ACP, suppressed, 1 m right. Real close suppressed report; WWII-era carbine, not a modern AR. A later, slightly cleaner shot than the file start (~28 s). Mild close-mic transient overshoot; limited on export. Mono source upmixed.
- **Original:** `De_Lisle_Carbine_.45ACP_suppressed_1m_right_MKH8040_1_clean_Single_shots_x_14.wav` (shot ~28.0–29.8 s)
- **Bundle/part:** Sonniss GDC 2016, part 3 of 6
- **Publisher / library:** Pole Position Production — De Lisle Carbine .45ACP suppressed
- **License:** Sonniss GDC Game Audio Bundle License

## suppressed_close_pistol

**Still not filled.** No new real live-fire close suppressed pistol turned up. PPK-with-suppressor remains blank-fire. Gamemaster silenced pistol remains short, clipped, and designed.

## suppressed_close_smg

**Still not filled.** No real close suppressed SMG/burst in the GDC tasters or in usable Freesound CC0 recordings (Kodack 257364 still skipped for camcorder quality and edited cadence).

## Close-auto takes inspected and not used

- FLYSOUND AK-74 close 3-round burst: heavy source clipping (~2.2% samples).
- Pole Position HK416 1 m / on-gun auto strings: close-mic clipping on every cluster.
- Pole Position G36C 1 m six-shot string: clipped (~0.6%).
- Watson Wu AK-47 burst and MP7A1 auto: clipped on every burst.
- Pole Position Uzi 1 m, Mini Uzi 1 m, MP7 1 m, Thompson 0.3 m and 1 m: source transient clip (not needed; three clean SMGs were available).
- Pole Position L110A2 / FN Minimi 1 m: only two single shots, not a burst.
- Pole Position MG 42 long burst, mountain top: source clipping, and not a close shooter-perspective take.
- Pole Position Warfare “MG firing close” (large field, Telinga): heavy clipping (~2.7%).
- Fascinated Tommy Gun burst: clean, but held back because MP5 / MP40 / PPSh already fill the three SMG slots.
- Pole Position AKM 1 m triple: clean, but only three rounds — the 2 m outdoor AK-47 burst was the better AK auto take.
