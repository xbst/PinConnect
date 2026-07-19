# pinout-embed

`pinout-embed` is a Python-Markdown extension for MkDocs / Zensical sites. It lets you drop a generated pinout into a page with an image-style tag, which it replaces at build time with a responsive `<iframe>`.

It only handles embedding. Produce the pinout HTML first with [pinout-gen](../pinout-gen/generating-html.md).

## Install

From the repository root:

```bash
pip install ./pinout_embed
```

If you build your site in a virtual environment, install it into that same environment.

## Enable the extension

Add it to `markdown_extensions` in your `mkdocs.yml`. It relies on the standard `attr_list` extension to read the tag attributes, so enable both:

```yaml
markdown_extensions:
  - attr_list
  - pinout_embed
```

Zensical uses the same Python-Markdown pipeline; add the same two entries to its Markdown extensions configuration.

## Embed a pinout

Use image syntax pointing at your generated HTML, with `type=application/pinout`:

```markdown
![Board Pinout](../path/to/board.pinout.html){ type=application/pinout style="min-height:60vh;width:100%" }
```

At build time the extension turns that into an `<iframe>` that loads the HTML. Details:

- The **path** is resolved like any other asset in your docs, relative to the page.
- The **alt text** (`Board Pinout` above) becomes the iframe's `title` for tooltips and screen readers. An explicit Markdown title wins if you give one — `![alt](board.pinout.html "Board pinout")` uses `Board pinout`, and the alt text is only the fallback.
- The **`style`** attribute is passed straight through. If you omit it, the default is `min-height:60vh;width:100%`.
- The iframe is set to `loading="lazy"` and `allowfullscreen`.

Only images tagged `type=application/pinout` are affected; ordinary images pass through untouched.

## Responsive height

Most pinouts render at a fixed height (your `style`, or the `min-height:60vh` default), which is what you want on a normal page — the diagram fills the frame.

If you generate a pinout with a theme that **moves the connector list below the board on narrow screens** (the `sidebar_responsive_stack` theme behavior), the content can grow taller than a fixed iframe. Those pinouts report their height to the page, and this extension adds one small listener per page that grows the matching iframe to fit — then shrinks it back to the authored height on wider screens.

This is automatic and needs no configuration. It is also backward compatible in both directions: a pinout that doesn't report a height, or a page built with an older `pinout-embed`, simply keeps the iframe's authored `(min-)height`.

## Light and dark mode

An embedded pinout follows your site's color scheme on its own. When the pinout is served from the same origin as the page — the normal case for a docs site — it reads MkDocs Material's and Zensical's `data-md-color-scheme` (as well as a generic `data-theme` or a `dark` class) and keeps watching it, so a reader flipping your site's light/dark toggle re-colors the pinout live.

Nothing to configure. If you ever embed a pinout from a *different* origin, that automatic detection cannot apply, and the parent page drives it with a `postMessage` instead — see [light and dark mode](../pinout-gen/themes.md#light-and-dark-mode).

## Place the files so the site serves them

MkDocs and Zensical copy non-Markdown files under `docs/` into the built site. Put the generated HTML **and its board image** inside your docs tree and reference the HTML by a path relative to the page.

By default the pinout HTML links its board image by relative path, so keep the two together (or use `pinout-gen -i` to embed the image). For example:

```
docs/
├── boards.md
└── pinouts/
    ├── board.pinout.html
    └── board.png
```

Referenced from `docs/boards.md`:

```markdown
![Board Pinout](pinouts/board.pinout.html){ type=application/pinout }
```

You can also define the size of your iframe (gets overridden when connector list moves to the bottom):

```markdown
![Board Pinout](pinouts/board.pinout.html){ type=application/pinout style="height:60vh;min-height:500px;width:100%" }
```

A convenient way to keep this in sync is to point `pinout-gen -o` directly at your docs tree when generating:

```bash
pinout-gen board.toml -o docs/pinouts/board.pinout.html
```

Just remember to copy the board image next to it, or use `-i` to embed the image into the HTML.

## Publishing with GitHub Pages

Rather than committing generated pinouts, it is usually better to generate them during the build. Keep only the board TOML and its image in the repository, and let CI produce the HTML on every deploy.

Add the below to your workflow before `mkdocs gh-deploy` or `zensical build`:

```yaml
      - run: pip install "git+https://github.com/xbst/PinConnect.git@master#subdirectory=pinout_gen"
      - run: pip install "git+https://github.com/xbst/PinConnect.git@master#subdirectory=pinout_embed"
      - name: Generate interactive pinouts
        run: |
          shopt -s nullglob
          for toml in docs/pinouts/*/*.toml; do
            echo "pinout-gen $toml"
            pinout-gen "$toml" -i
          done
```

The loop expects one folder per board, and writes `<board>.pinout.html` beside each TOML — exactly where the embed tag on your page points:

```
docs/
├── boards.md
└── pinouts/
    └── board/
        ├── board.toml            ← committed
        ├── board.png             ← committed
        └── board.pinout.html     ← generated by CI, not committed
```

`-i` embeds the board image into the HTML, so the built site does not depend on the image path resolving. `shopt -s nullglob` keeps the loop quiet when a folder has no TOML yet.

> **Install from `master` rather than pinning a release.** Each deploy then regenerates your pinouts with the current version of PinConnect, so fixes and new features in the generated page — tooltip behavior, theming, accessibility, mobile layout — reach your published site automatically. 

## Troubleshooting

- **The tag renders as a plain image / broken image.** The extension is not active. Confirm both `attr_list` and `pinout_embed` are in `markdown_extensions` and that `pinout-embed` is installed in the environment running MkDocs.
- **A red box says "Pinout failed to load — file not found".** The pinout HTML is not at that path in the built site — a typo, or it was never generated. The extension checks each embed when the page loads and replaces a missing one with this message rather than showing a blank frame. MkDocs also reports the missing file at build time; Zensical currently doesn't, which is why the check runs in the browser. (Cross-origin embeds cannot be checked, so they are left alone.)
- **The pinout loads but shows a broken image inside.** The board image is not next to the HTML in the built site. Copy it along with the HTML, or regenerate with `pinout-gen -i` to embed the image.
