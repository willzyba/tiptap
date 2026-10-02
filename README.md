# @codecogs/fxeditor-tiptap

The [CodeCogs Equation Editor](https://editor.codecogs.com) as a [Tiptap](https://tiptap.dev)
node extension.

Tiptap is headless - it has no toolbar and no dialog system, unlike CKEditor 5, TinyMCE and
Froala. This package ships raw ESM source for your own bundler (Vite, webpack, ...) to consume,
the same way the CKEditor 5 plugin does, and supplies its own small modal dialog (see
[Why this extension draws its own dialog](#why-this-extension-draws-its-own-dialog)) - but the
**toolbar button is yours to build**. The extension only exposes a command for it to call.

## Install

```
npm install @codecogs/fxeditor-tiptap
```

## Quick start

```js
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { EqnEditor } from '@codecogs/fxeditor-tiptap';
import '@codecogs/fxeditor-tiptap/eqneditor.css';

const editor = new Editor({
    element: document.querySelector('#editor'),
    extensions: [StarterKit, EqnEditor.configure({ showLatex: true })]
});

myToolbarButton.addEventListener('click', () => {
    editor.commands.insertEquation();
});
```

`insertEquation()` opens the dialog and returns immediately - like Tiptap's own file-upload
examples, the actual insert happens later, once the user has written an equation and pressed
Ok. It always returns `true`; whether anything landed in the document depends on what the user
does next, not on whether the command could run.

Double-click an existing equation to edit it again.

## Options

Passed to `EqnEditor.configure({ ... })`:

| Option | Default | Meaning |
|---|---|---|
| `showLatex` | `true` | Whether the LaTeX markup pane starts visible beneath the maths view. |
| `server` | `'fxtex.codecogs.com'` | Host the Equation Editor's own code is loaded from. Change this if you run your own copy. |
| `renderUrl` | `'https://latex.codecogs.com'` | The rendering service that turns an equation into an image. |
| `insertAs` | `'url'` | How a saved equation is written into the document: `'url'` (an `<img>`), `'latex'` (`$...$`/`$$...$$` **plain text**, needs [fxTeX](https://editor.codecogs.com/docs/0-fxtex.php), KaTeX or MathJax on the published page), or `'mathml'` (final markup, needs the stylesheet below). |
| `latexDisplay` | `true` | With `insertAs: 'latex'`, whether to use `$$` (display) or `$` (inline) delimiters. |
| `scriptUrl` | derived from `server` | Full URL of the Equation Editor bundle, when the default path does not suit. |
| `cssUrl` | derived from `server` | Full URL of the Equation Editor stylesheet. |
| `mathmlCssUrl` | derived from `server` | The stylesheet loaded into the editing view for `insertAs: 'mathml'`. |
| `HTMLAttributes` | `{}` | Extra attributes merged onto the rendered `<img>` (ignored in `'mathml'` mode - MathML has no `src`/`alt` to attach them to). |

### `'latex'` is not a node

Unlike the other two "structured" modes, `insertAs: 'latex'` does not create an instance of
this extension's node type at all - `insertEquation()` inserts the plain `$...$`/`$$...$$` text
directly, exactly as if you had typed it. That is intentional: this extension's node exists to
be *rendered* (as an image or as MathML), and inert LaTeX text is precisely not that. It also
means `'latex'`-mode equations have no double-click-to-edit behaviour; they are edited as the
plain text they are, same as in the CKEditor 5, TinyMCE and Froala plugins.

### MathML needs a stylesheet on the page that displays it

Browsers' own MathML does not cover everything the converter produces, so a page that displays
`insertAs: 'mathml'` output needs this line - the same file fxTeX ships:

```html
<link rel="stylesheet" href="https://fxtex.codecogs.com/fxtex.css">
```

The extension loads it into the editing view for you; it cannot add it to the page that
finally displays the content, because that page is yours, not the editor's.

### Tiptap's schema and `<math>`

Unlike TinyMCE, nothing needs configuring here: this extension's own node type is what
produces the `<math>` markup, and Tiptap only ever serialises what a node's own `renderHTML`
returns - there is no separate allow-list to update, and no way for `<math>` content to arrive
except through this node.

## What gets written into the page

See the `insertAs` row above. Equations written as `'url'` or `'mathml'` can be reopened by
double-clicking them, because the node's `latex` attribute always carries the source they were
written from - see [`getHTML()`/`getJSON()`](https://tiptap.dev/docs/editor/api/editor) for how
to read that attribute back out programmatically, e.g. for search or export.

## Why this extension draws its own dialog

Tiptap is headless by design, so - like the Froala plugin - this extension opens a small modal
of its own rather than assuming any particular host UI framework. `eqneditor.css` is only that
frame; the equation editor inside it is styled by the stylesheet loaded from `cssUrl`.

## Testing

`npm test` runs the extension against a real Tiptap/ProseMirror instance (via `jsdom`, not a
mock of either) and checks that `renderHTML`/`parseHTML` round-trip correctly for both `'url'`
and `'mathml'` modes. It does not exercise the dialog or double-click NodeView wiring, since
those need EqEditor's API bundle loaded from the network.
