import json, pathlib
SP = pathlib.Path('/tmp/claude-0/-home-user-Arlo-AI/102af878-52d3-5b6a-ba2c-45deb7e058f8/scratchpad/arlo')
F = json.loads((SP/'fonts.json').read_text())
body = (SP/'body.html').read_text()
css  = (SP/'style.css').read_text()
js   = (SP/'app.js').read_text()

faces = f"""
@font-face{{font-family:'Young Serif';src:url(data:font/woff2;base64,{F['YoungSerif']}) format('woff2');font-weight:400;font-display:swap}}
@font-face{{font-family:'Work Sans';src:url(data:font/woff2;base64,{F['WorkSans']}) format('woff2');font-weight:400;font-display:swap}}
@font-face{{font-family:'Work Sans';src:url(data:font/woff2;base64,{F['WorkSansB']}) format('woff2');font-weight:700;font-display:swap}}
@font-face{{font-family:'Geist Mono';src:url(data:font/woff2;base64,{F['GeistMono']}) format('woff2');font-weight:400;font-display:swap}}
"""
html = f"""<title>Arlo — the phone agent that answers when you can't</title>
<meta name="description" content="Arlo answers every call for your business, day or night, in a natural British voice. Qualifies it, books it, and tells you what happened." />
<style>{faces}
{css}</style>
{body}
<script>{js}</script>
"""
pathlib.Path('/home/user/Arlo-AI/marketing/site/index.html').write_text(html)
print(f"built: {len(html)/1024:.0f}KB")
