# Player-piece source models

These are the exact custom-model meshes referenced by `tools/mod.json`.  TTS
applies the player colour as a material tint, so one mesh is shared by every
seat.  `../build-piece-sprites.py` renders the tracked, transparent browser
sprites from these files.

| File | TTS tag / object | Mod URL |
| --- | --- | --- |
| `army.obj` | `warrior` | `https://steamusercontent-a.akamaihd.net/ugc/1994562021176697748/F793BC20E8CE57B56E120F89176165B5828296DC/` |
| `caravan.obj` | `caravan` (`Civ_Wagon`) | `https://steamusercontent-a.akamaihd.net/ugc/1994562021176696228/47C54408728DB639A5BCC43706FA35F75A925E0F/` |
| `city.obj` | `city_*` (`Civ_City`) | `https://steamusercontent-a.akamaihd.net/ugc/1994562021176696775/009D79834D8A00672B02B53B02D2820859ADE7A8/` |
| `capital.obj` | `city_*`, object `Capital` (`Civ_Capital`) | `https://steamusercontent-a.akamaihd.net/ugc/1994562021176696652/996BF1A2B5D19601A0C0CA1B61CBC6A6A8502088/` |

The last three Steam cache URLs resolve to archived Pastebin pages. Their raw
model bodies are `sUkZzWPF`, `ynUBxkM0`, and `w6xtB3yR`, respectively.
