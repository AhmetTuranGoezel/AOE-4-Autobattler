import sys, re
from playwright.sync_api import sync_playwright
errs=[]
def ck(n,c,x=""):
    x="".join(ch for ch in x if ord(ch)<128)
    print(("PASS " if c else "FAIL ")+n+("  "+x if x else ""))
    if not c: errs.append(n)
def numi(s):
    m=re.findall(r"[\d,]+", s or ""); return int(m[0].replace(",","")) if m else None
def brute_mixed(hp0,def0,spd0,POOL=66,CAP=32):
    best=-1; ba=None
    for h in range(CAP+1):
        for d in range(min(CAP,POOL-h)+1):
            s=min(CAP,POOL-h-d); hp=hp0+h; P=hp*(def0+d); S=hp*(spd0+s)
            m=2*P*S/(P+S) if P+S else 0
            if m>best: best=m; ba=(h,d,s)
    return round(best),ba
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":1280,"height":1000})
    ce=[]
    pg.on("console", lambda m: ce.append(m.text) if m.type=="error" else None)
    pg.on("pageerror", lambda e: ce.append("PAGEERROR: "+str(e)))
    pg.goto("http://localhost:8152/index.html", wait_until="networkidle")
    pg.wait_for_selector("#results .poke-table tbody tr")
    pg.click("#results .poke-table tbody tr"); pg.wait_for_selector("#detail.open .stat-lab")

    # 1. stats shown ONCE
    ck("no old .sb breakdown bars", pg.eval_on_selector_all(".sb","e=>e.length")==0)
    ck("no .detail-bars section", pg.query_selector(".detail-bars") is None)
    ck("exactly 6 stat rows", pg.eval_on_selector_all(".pt-row","e=>e.length")==6)
    ck("3 eHP cards in grid", pg.eval_on_selector_all(".detail-ehp .ehp-card","e=>e.length")==3)

    def pool(): return pg.eval_on_selector(".pt-pool-used","e=>+e.textContent")
    def ehp(c): return numi(pg.eval_on_selector(f".ehp-card.{c} .ehp-val","e=>e.textContent"))
    def num(k): return pg.eval_on_selector(f'[data-pt-num="{k}"]',"e=>+e.value")
    def resval(k):
        idx={"hp":1,"atk":2,"def":3,"spa":4,"spd":5,"spe":6}[k]
        return int(pg.eval_on_selector(f".pt-row:nth-child({idx}) .pt-cur","e=>+e.textContent"))

    base=(ehp("phys"),ehp("spec"),ehp("mixed"))
    lvhp,lvdef,lvspd=resval("hp"),resval("def"),resval("spd")

    # 2. stepper +/-, MAX, clear, pool/cap
    pg.click('[data-pt-step="hp"][data-dir="1"]'); pg.wait_for_timeout(40)
    ck("+ increments hp to 1, pool 1", num("hp")==1 and pool()==1)
    pg.click('[data-pt-max="hp"]'); pg.wait_for_timeout(40)
    ck("MAX hp -> 32", num("hp")==32 and pool()==32)
    pg.click('[data-pt-max="def"]'); pg.wait_for_timeout(40)
    ck("MAX def -> 32, pool 64", num("def")==32 and pool()==64)
    pg.click('[data-pt-max="spd"]'); pg.wait_for_timeout(40)
    ck("3rd MAX capped to remaining 2", num("spd")==2 and pool()==66)
    ck("eHP rose vs base", ehp("phys")>base[0])
    pg.click('[data-pt-clear="def"]'); pg.wait_for_timeout(40)
    ck("clear def -> 0", num("def")==0)

    # 3. number input clamp
    pg.fill('[data-pt-num="spa"]','99'); pg.dispatch_event('[data-pt-num="spa"]','input'); pg.wait_for_timeout(40)
    ck("typing 99 clamps spa to remaining", num("spa")<=32 and pool()<=66, f"spa={num('spa')} pool={pool()}")

    # 4. optimizer mixed == brute force
    pg.click('[data-pt-opt="mixed"]'); pg.wait_for_timeout(60)
    bf,ba=brute_mixed(lvhp,lvdef,lvspd)
    ck("mixed optimize == brute force", ehp("mixed")==bf, f"ui={ehp('mixed')} bf={bf} spread=({num('hp')},{num('def')},{num('spd')})")
    pg.click("[data-pt-reset]"); pg.wait_for_timeout(40)
    ck("clear all -> pool 0, base eHP", pool()==0 and (ehp('phys'),ehp('spec'),ehp('mixed'))==base)

    # 5. radar labels not clipped (each label box within svg box)
    clip = pg.evaluate("""() => {
      const svg=document.querySelector('#detail .radar'); const r=svg.getBoundingClientRect();
      return [...svg.querySelectorAll('.radar-label')].map(t=>{const b=t.getBoundingClientRect();
        return b.left>=r.left-0.5 && b.right<=r.right+0.5;});
    }""")
    ck("all radar labels inside svg box", all(clip), f"{sum(clip)}/{len(clip)} ok")

    # 6. usage section (Garchomp)
    pg.click('[data-close]'); pg.wait_for_timeout(60)
    pg.fill("#search","Garchomp"); pg.wait_for_timeout(200)
    pg.click("#results .poke-table tbody tr"); pg.wait_for_selector("#detail.open .detail-usage")
    cats = pg.eval_on_selector_all(".detail-usage .use-lab","els=>els.map(e=>e.textContent)")
    ck("usage categories present", set(["Ability","Item","Nature","Moves"]).issubset(set(cats)), str(cats))
    ab0 = pg.eval_on_selector(".detail-usage .use-cat .use-item .use-name","e=>e.textContent")
    ck("top ability is Rough Skin", ab0=="Rough Skin", ab0)

    # 7. move data: Iron Head popup 20% + PP16
    pg.click('[data-close]'); pg.wait_for_timeout(60)
    pg.click('.tab[data-tab="moves"]'); pg.wait_for_selector(".moves-table tbody tr")
    pg.fill(".mv-search","Iron Head"); pg.wait_for_timeout(200)
    pg.click(".moves-table tbody tr"); pg.wait_for_selector("#popup.open")
    txt=pg.inner_text("#popup .info-card")
    ck("Iron Head effect 20% flinch", "20%" in txt and "flinch" in txt.lower(), txt[:80].replace(chr(10),' '))
    ck("Iron Head PP 16", "16" in pg.eval_on_selector_all("#popup .info-stats .t-val","els=>els.map(e=>e.textContent)").__str__())

    ck("0 console/page errors", not ce, "; ".join(ce[:5]))
    b.close()
print("\nRESULT:", "ALL PASS" if not errs else f"{len(errs)} FAILED -> {errs}")
sys.exit(1 if errs else 0)
