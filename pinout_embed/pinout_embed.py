"""Old name of the ``md_iframe`` Markdown extension, kept so existing configs work.

``- pinout_embed`` under ``markdown_extensions`` does not need this module: md-iframe
registers an entry point by that name. This module serves the dotted form,
``pinout_embed:PinoutExtension``, and code that imports ``pinout_embed`` directly.
"""

from md_iframe import (  # noqa: F401
    ERROR_CLASS,
    LABEL_ATTR,
    LEGACY_EMBED_CLASS,
    LEGACY_ERROR_CLASS,
    TYPE_LABELS,
    IframeExtension,
    IframeHeightPostprocessor,
    IframeTreeprocessor,
    makeExtension,
)

# pinout-embed's names. EMBED_CLASS keeps its old value; md-iframe's own marker
# class is md_iframe.EMBED_CLASS.
EMBED_CLASS = LEGACY_EMBED_CLASS
PinoutExtension = IframeExtension
PinoutTreeprocessor = IframeTreeprocessor
PinoutHeightPostprocessor = IframeHeightPostprocessor
