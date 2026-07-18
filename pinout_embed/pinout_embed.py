"""Markdown extension that embeds interactive pinout diagrams, designed for MkDocs/Zensical sites.

Usage in Markdown:
    ![Board Pinout](path/to/pinout.html){ type=application/pinout style="min-height:40vh;width:100%" }

What it does: A TreeProcessor finds <img> tags whose ``type`` attribute is ``application/pinout`` and replaces
them with an ``<iframe>`` that loads the generated pinout HTML file.

Auto-height: pinouts generated with a theme that stacks the connector list below the board on narrow
screens post their content height to the parent page.  A Postprocessor adds one small listener per page
that grows the matching iframe to fit.  It is backward compatible in both directions: an older pinout that
never posts a height, or a page without the listener, simply keeps the iframe's authored (min-)height.
"""

from markdown import Extension
from markdown.treeprocessors import Treeprocessor
from markdown.postprocessors import Postprocessor
from xml.etree.ElementTree import Element

# Marker class on every embedded iframe; the listener uses it to scope itself.
EMBED_CLASS = "pinconnect-embed"

# One listener per page.  Matches the posting iframe by window identity (so it
# works with several pinouts on a page), sets the height on a positive value,
# and clears it on 0 so the iframe reverts to its authored height on wide
# screens.  A sanity cap ignores absurd values.
_LISTENER_SCRIPT = (
    "\n<script>\n"
    "(function(){\n"
    "  if(window.__pinconnectEmbed)return;window.__pinconnectEmbed=true;\n"
    "  window.addEventListener('message',function(e){\n"
    "    var d=e.data;\n"
    "    if(!d||typeof d!=='object'||typeof d.pinconnectHeight!=='number')return;\n"
    "    if(d.pinconnectHeight>20000)return;\n"
    "    var f=document.querySelectorAll('iframe." + EMBED_CLASS + "');\n"
    "    for(var i=0;i<f.length;i++){\n"
    "      if(f[i].contentWindow===e.source){\n"
    "        var el=f[i];\n"
    "        if(el.dataset.pcMinh===undefined)el.dataset.pcMinh=el.style.minHeight||'';\n"
    "        if(d.pinconnectHeight>0){\n"
    "          el.style.minHeight='0';\n"                     # content drives the height; drop the min-height floor
    "          el.style.height=d.pinconnectHeight+'px';\n"
    "        }else{\n"
    "          el.style.minHeight=el.dataset.pcMinh;\n"       # wide again: restore the authored min-height
    "          el.style.height='';\n"
    "        }\n"
    "        break;\n"
    "      }\n"
    "    }\n"
    "  });\n"
    "})();\n"
    "</script>"
)


class PinoutTreeprocessor(Treeprocessor):
    def run(self, root: Element) -> None:
        for img in root.iter("img"):
            if img.get("type") != "application/pinout":
                continue
            src = img.get("src")
            if not src:
                continue

            # Preserve any inline style the author specified.  Add a height
            # transition so the auto-height resize (e.g. toggling the connector
            # list when it is stacked below the board) animates smoothly.
            style = img.get("style", "min-height:60vh;width:100%")
            if "transition" not in style:
                style = style.rstrip(";") + ";transition:height .28s ease"

            # Convert <img> → <iframe>
            img.tag = "iframe"
            img.set("src", src)
            img.set("style", style)
            img.set("frameborder", "0")
            img.set("loading", "lazy")
            img.set("allowfullscreen", "true")

            # Marker class (kept alongside any author-supplied class) so the
            # auto-height listener can find and resize this iframe.
            existing = img.get("class")
            img.set("class", f"{existing} {EMBED_CLASS}".strip() if existing else EMBED_CLASS)

            # Move alt text into title (screen-reader / tooltip)
            alt = img.get("alt", "")
            if alt:
                img.set("title", alt)
                del img.attrib["alt"]

            # Clean up image-only attributes
            for attr in ("type",):
                if attr in img.attrib:
                    del img.attrib[attr]

            # iframes need closing tags; ensure there's text content
            # (empty string prevents self-closing <iframe/>)
            img.text = ""


class PinoutHeightPostprocessor(Postprocessor):
    """Append the auto-height listener once, if the page has any pinout iframe."""

    def run(self, text: str) -> str:
        if EMBED_CLASS in text:
            return text + _LISTENER_SCRIPT
        return text


class PinoutExtension(Extension):
    def extendMarkdown(self, md):
        md.treeprocessors.register(
            PinoutTreeprocessor(md), "pinout_embed", 1
        )
        md.postprocessors.register(
            PinoutHeightPostprocessor(md), "pinout_embed_height", 1
        )


def makeExtension(**kwargs):
    return PinoutExtension(**kwargs)
