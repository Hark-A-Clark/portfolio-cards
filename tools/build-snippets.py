"""Builds the Squarespace Code Block and the demo page's grid from one list of cards.
usage: python3 tools/build-snippets.py <release-version>"""
import sys, re, html, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
VERSION = sys.argv[1]
CDN = f"https://cdn.jsdelivr.net/gh/Hark-A-Clark/portfolio-cards@{VERSION}/media"

CARDS = [
  dict(href="/app", status="live", protected=True, year="2026", platforms="Web",
       company="Planet A", product="Field Guide", feature="Climate-zone search", media="planet-a-mockup", mockup=True,
       colors=("#00b0bc", "#00b0bc"), title="Climate Solutions App",
       desc="A climate solutions field guide that collects and scales the global effort to combat climate change."),
  dict(href="/sunnova", status="live", protected=True, year="2024", platforms="Web",
       company="Sunnova Energy", product="SolarTech", feature="Sales experience", media="sunnova",
       colors=("#e6a0f7", "#d083ea"), title="Solar Sales Experience",
       desc="Led and released x3 customer facing features, alongside updating legacy UI in SolarTech."),
  dict(href="/design-systems", status="live", year="2026", platforms="Web",
       company="Planet A", product="Design system", feature="AI-built components", media="design-system",
       colors=("#ec7a40", "#dc6226"), title="Design Systems",
       desc="A token-driven design system for Planet A, built with AI in the loop: themes, right-to-left languages and documented components."),
  dict(href="/project-homesafe", status="in-progress", year="2026", platforms="iOS, Android",
       company="Vancouver Fire Corps", product="Project HomeSafe", feature="Home-safety canvassing", media="homesafe-mockup", mockup=True,
       colors=("#f5b302", "#f5b302"), title="Project HomeSafe",
       desc="Digital Transformation automating manual paperwork heavy process."),
  dict(href="/pageia", status="live", protected=True, confidential="NDA protected", year="2022", platforms="Web",
       company="FinTech client", product="Advisor platform", feature="Navigation", media="information-architecture",
       colors=("#7bc7d6", "#4b9fb8"), title="Information Architecture",
       desc="Modernized, future scaled and fully accessible information architecture experience in FinTech."),
]

def card(c, base, indent):
    a = lambda v: html.escape(v, quote=True)
    flags = (" mockup" if c.get("mockup") else "") + (" protected" if c.get("protected") else "") + (f' confidential="{a(c["confidential"])}"' if c.get("confidential") else "")
    i = " " * indent
    return (f'{i}<case-study-card href="{a(c["href"])}" status="{c["status"]}"{flags} year="{c["year"]}" platforms="{a(c["platforms"])}"\n'
            f'{i}  company="{a(c["company"])}" product="{a(c["product"])}" feature="{a(c["feature"])}"\n'
            f'{i}  video="{base}/{c["media"]}.mp4" poster="{base}/{c["media"]}.jpg"\n'
            f'{i}  gradient-from="{c["colors"][0]}" gradient-to="{c["colors"][1]}" gradient-angle="160">\n'
            f'{i}  <h3 slot="title">{html.escape(c["title"])}</h3>\n'
            f'{i}  <p slot="description">{html.escape(c["desc"])}</p>\n'
            f'{i}</case-study-card>\n')

GRID = '<case-study-grid credit-designed-by="Adriana Clark" credit-href="https://github.com/Hark-A-Clark/portfolio-cards">\n'
block = GRID + "".join(card(c, CDN, 2) for c in CARDS) + "</case-study-grid>\n"
(ROOT / "squarespace-code-block.html").write_text(block)
(ROOT / "squarespace-header.html").write_text(re.sub(r"portfolio-cards@[\d.]+", f"portfolio-cards@{VERSION}", (ROOT / "squarespace-header.html").read_text()))

demo = ROOT / "demo/index.html"; s = demo.read_text()
grid = "".join(card(c, "../media", 10) for c in CARDS)
s = re.sub(r'<case-study-grid id="grid"[^>]*>\n.*?(\s*</case-study-grid>)', lambda m: GRID.replace("<case-study-grid ", '<case-study-grid id="grid" ') + grid.rstrip("\n") + m.group(1), s, count=1, flags=re.S)
demo.write_text(s)
print("built for", VERSION)
