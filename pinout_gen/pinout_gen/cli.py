"""Old name of ``pinconnect.cli``.

Everything in ``pinconnect.cli`` is available here, except that ``main`` is
``legacy_main``: code calling ``pinout_gen.cli.main()`` and
``python -m pinout_gen.cli`` keep the ``pinout-gen`` command line.
"""
from pinconnect import cli as _cli

globals().update(
    (name, value) for name, value in vars(_cli).items()
    if not name.startswith("__")
)
main = _cli.legacy_main

if __name__ == "__main__":
    main()
