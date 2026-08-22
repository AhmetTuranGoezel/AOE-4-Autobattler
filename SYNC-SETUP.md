# Turning on cross-device sync

The Pokémon Champions tool remembers your pins, teams, saved teams, move bans,
per-Pokémon bans and Damage-lab presets in **localStorage**. That is per-browser
*and* per-domain, so the live demo, your phone and owltools each keep their own
private copy and never meet.

Sync fixes that with one shared code. The browser side is already done and needs
nothing from you. The only thing missing is a place to keep the data — about
40 lines of server code, already written, that just needs switching on.

---

## Which host am I on?

This decides which of the two files below is the live one. Everything else is
identical, and **both files are already committed**, so whichever host you are on
will pick up its own and quietly ignore the other. You cannot get this wrong.

To check, open the dashboard you deploy from:

- the address bar says **app.netlify.com** → Netlify
- it says **dash.cloudflare.com** → Cloudflare Pages

If you would rather not look: just try Netlify's steps first. If sync still says
*"sync endpoint not deployed here"* after a deploy, do the Cloudflare steps
instead.

---

## If you are on Netlify

Nothing to provision. Storage is Netlify Blobs, which every site gets for free.

1. Deploy this branch.
2. Open the tool → **Sync** → **New code** → **Use this code**.
3. The status should turn green and say *In sync*.

The relevant files, already in place:

- `netlify/functions/pc-sync.mjs` — the endpoint
- `package.json` — pulls in `@netlify/blobs`, which Netlify installs on deploy

---

## If you are on Cloudflare Pages

Pages Functions are picked up automatically, but they need a **KV namespace** —
Cloudflare's key-value store — bound to the project. Two minutes, once:

1. **dash.cloudflare.com** → *Storage & Databases* → *KV* → **Create a namespace**.
   Call it `pc-sync`. Nothing else to configure.
2. Go to your Pages project → *Settings* → *Bindings* → **Add** → *KV namespace*.
   - **Variable name:** `PC_SYNC` — this exact spelling, it is what the code looks for
   - **KV namespace:** the `pc-sync` one you just made
   - Add it for **Production** (and Preview, if you use preview deploys)
3. Redeploy so the binding takes effect.
4. Open the tool → **Sync** → **New code** → **Use this code**.

The relevant file, already in place: `functions/api/pc-sync/[code].js`.

If you skip step 2 the endpoint answers with
*"PC_SYNC KV namespace is not bound"* — which is exactly what the Sync panel
will show you.

---

## Using it

1. On the PC, open **Sync** and press **New code**, then **Use this code**.
2. Copy the link it shows and open it on your phone — that sets the same code
   there. Or just type the code in; it is 13 characters and has no vowels, so
   there is nothing to misread.
3. Do the same on the other site.

From then on it looks after itself: changes push about a second after you make
them, and each device pulls when it loads and whenever you switch back to the
tab. If a change arrives while you are mid-click, you get a small
*"Updated from another device"* prompt rather than the page reloading under you.

The dot on the **Sync** button is the whole status at a glance — grey off,
blue ready, yellow working, green in sync, red a problem.

### Two devices, two edits

Merging is done setting by setting, newest wins. Banning a move on the phone
while pinning a Pokémon on the PC keeps both. Only editing *the same* setting in
two places at once can lose one, and then the later edit wins.

### Worth knowing

- **The code is the password.** Anyone who has it can read and change that data.
  It is not secret-by-obscurity — it is 8 random characters out of 27, so
  guessing one is not realistic, but don't post it publicly.
- Nothing else is stored. No account, no email, no analytics.
- A code untouched for a year is dropped.
- Without a code the tool behaves exactly as it did before — everything stays
  local.
- If the endpoint is unreachable the tool still works; it just says so and keeps
  saving locally.
