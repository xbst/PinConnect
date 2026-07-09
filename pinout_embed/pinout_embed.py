"""Markdown extension that embeds interactive pinout diagrams, designed for MkDocs/Zensical sites.

Usage in Markdown:
    ![Board Pinout](path/to/pinout.html){ type=application/pinout style="min-height:40vh;width:100%" }

What it does: A TreeProcessor finds <img> tags whose ``type`` attribute is ``application/pinout`` and replaces
them with an ``<iframe>`` that loads the generated pinout HTML file.
"""

from markdown import Extension
from markdown.treeprocessors import Treeprocessor
from xml.etree.ElementTree import Element


class PinoutTreeprocessor(Treeprocessor):
    def run(self, root: Element) -> None:
        for img in root.iter("img"):
            if img.get("type") != "application/pinout":
                continue
            src = img.get("src")
            if not src:
                continue

            # Preserve any inline style the author specified
            style = img.get("style", "min-height:60vh;width:100%")

            # Convert <img> → <iframe>
            img.tag = "iframe"
            img.set("src", src)
            img.set("style", style)
            img.set("frameborder", "0")
            img.set("loading", "lazy")
            img.set("allowfullscreen", "true")

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


class PinoutExtension(Extension):
    def extendMarkdown(self, md):
        md.treeprocessors.register(
            PinoutTreeprocessor(md), "pinout_embed", 1
        )


def makeExtension(**kwargs):
    return PinoutExtension(**kwargs)
