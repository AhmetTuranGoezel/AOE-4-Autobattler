# Turning on cross-device sync

The Pokémon Champions tool remembers your pins, teams, saved teams, move bans,
per-Pokémon bans and Damage-lab presets in **localStorage**. That is per-browser
*and* per-domain, so the live demo, your phone and owltools each keep their own
private copy and never meet.

Sync gives all three one shared home, keyed by a single code.

---

## Setup

The site is on **Netlify**, which means there is nothing to provision. Storage is
Netlify Blobs — no namespace to create, no binding to configure, no keys.

1. **Deploy this branch.** Netlify picks up `netlify/functions/pc-sync.mjs`
   automatically and installs the one dependency from `package.json`.
2. Open the tool → **Sync** → **New code** → **Use this code**.
3. The status turns green and says *In sync*.

If step 3 says *"sync endpoint not deployed here"*, the function did not build —
check the deploy log for the `@netlify/blobs` install.

The two files involved:

- `netlify/functions/pc-sync.mjs` — the endpoint. It routes itself to
  `/api/pc-sync/:code` via its `config` export, so there is no `_redirects` entry
  to keep in step.
- `package.json` — pulls in `@netlify/blobs`.

---

## Using it

1. On the PC, open **Sync**, press **New code**, then **Use this code**.
2. Copy the link it shows and open it on your phone — that sets the same code
   there. Or type the code in; it is 13 characters and has no vowels, so there is
   nothing to misread.
3. Do the same on the other site.

From then on it looks after itself: changes push about a second after you make
them, and each device pulls when it loads and whenever you switch back to the
tab. If a change arrives while you are mid-click you get a small *"Updated from
another device"* prompt rather than the page reloading under you.

The dot on the **Sync** button is the status at a glance — grey off, blue ready,
yellow working, green in sync, red a problem.

### Two devices, two edits

Merging happens setting by setting, newest wins, on both the browser and the
server. Banning a move on the phone while pinning a Pokémon on the PC keeps both.
Only editing *the same* setting in two places at once can lose one, and then the
later edit wins.

The server merges rather than overwrites on purpose: a device only uploads the
keys it knows about, so a wholesale replace would silently drop a setting that
only another device had ever seen.

### Worth knowing

- **The code is the password.** Anyone who has it can read and change that data.
  It is 8 random characters from an alphabet of 27, so guessing one is not
  realistic, but don't post it publicly.
- Nothing else is stored. No account, no email, no analytics.
- Without a code the tool behaves exactly as it did before — everything stays
  local.
- If the endpoint is unreachable the tool still works; it says so and keeps
  saving locally.
