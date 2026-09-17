// Verifies the extension's renderHTML/parseHTML round-trip against a real Tiptap/ProseMirror
// runtime (jsdom provides the DOM; nothing here is a mock of ProseMirror itself). Not a
// browser end-to-end test - the dialog and NodeView's DOM event wiring are not exercised
// here, since those need EqEditor's API bundle loaded from the network - but this is the part
// most likely to silently produce wrong markup, so it is the part worth a real test.

import { JSDOM } from 'jsdom';

const dom = new JSDOM( '<!doctype html><html><body></body></html>' );
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty( global, 'navigator', { value: dom.window.navigator, configurable: true } );
global.Node = dom.window.Node;
global.DOMParser = dom.window.DOMParser;

const { Editor } = await import( '@tiptap/core' );
const { default: Document } = await import( '@tiptap/extension-document' );
const { default: Paragraph } = await import( '@tiptap/extension-paragraph' );
const { default: Text } = await import( '@tiptap/extension-text' );
const { EqnEditor } = await import( '../src/index.js' );

let failures = 0;

function check( label, actual, expected ) {
    const ok = actual === expected;
    console.log( ( ok ? 'ok  - ' : 'FAIL - ' ) + label );
    if ( !ok ) {
        failures++;
        console.log( '    expected: ' + expected );
        console.log( '    actual:   ' + actual );
    }
}

// --- renderHTML: 'url' mode ---
{
    const editor = new Editor( {
        extensions: [ Document, Paragraph, Text, EqnEditor.configure( { insertAs: 'url' } ) ],
        content: '<p></p>'
    } );

    editor.commands.insertContentAt( 1, {
        type: 'eqnEditorEquation',
        attrs: { latex: 'x^2', src: 'https://latex.codecogs.com/svg.image?x%5E2' }
    } );

    check(
        'url mode renders an <img> with the stored src and latex alt',
        editor.getHTML(),
        '<p><img src="https://latex.codecogs.com/svg.image?x%5E2" alt="x^2"></p>'
    );

    editor.destroy();
}

// --- renderHTML: 'mathml' mode ---
{
    const editor = new Editor( {
        extensions: [ Document, Paragraph, Text, EqnEditor.configure( { insertAs: 'mathml' } ) ],
        content: '<p></p>'
    } );

    const mathml = '<math title="x^2"><msup><mi>x</mi><mn>2</mn></msup></math>';

    editor.commands.insertContentAt( 1, {
        type: 'eqnEditorEquation',
        attrs: { latex: 'x^2', mathml: mathml }
    } );

    check(
        'mathml mode reproduces the stored MathML verbatim',
        editor.getHTML(),
        '<p>' + mathml + '</p>'
    );

    editor.destroy();
}

// --- parseHTML: loading previously-saved 'url' content back in ---
{
    const editor = new Editor( {
        extensions: [ Document, Paragraph, Text, EqnEditor.configure( { insertAs: 'url' } ) ],
        content: '<p><img src="https://latex.codecogs.com/svg.image?a%2Bb" alt="a+b"></p>'
    } );

    let node = null;
    editor.state.doc.descendants( function ( n ) { if ( n.type.name === 'eqnEditorEquation' ) node = n; } );

    check( 'parseHTML recognises an existing equation <img> as our node', !!node, true );
    if ( node ) {
        check( 'parseHTML reads latex from alt', node.attrs.latex, 'a+b' );
        check( 'parseHTML keeps the original src', node.attrs.src, 'https://latex.codecogs.com/svg.image?a%2Bb' );
    }

    editor.destroy();
}

// --- parseHTML: an <img> with no alt falls back to decoding the URL ---
{
    const editor = new Editor( {
        extensions: [ Document, Paragraph, Text, EqnEditor.configure( { insertAs: 'url' } ) ],
        content: '<p><img src="https://latex.codecogs.com/svg.image?a%26plus%3Bb"></p>'
    } );

    let node = null;
    editor.state.doc.descendants( function ( n ) { if ( n.type.name === 'eqnEditorEquation' ) node = n; } );

    check( 'parseHTML falls back to the URL when alt is missing', node ? node.attrs.latex : null, 'a+b' );

    editor.destroy();
}

// --- parseHTML: loading previously-saved 'mathml' content back in ---
{
    const editor = new Editor( {
        extensions: [ Document, Paragraph, Text, EqnEditor.configure( { insertAs: 'mathml' } ) ],
        content: '<p><math title="1+1"><mn>1</mn><mo>+</mo><mn>1</mn></math></p>'
    } );

    let node = null;
    editor.state.doc.descendants( function ( n ) { if ( n.type.name === 'eqnEditorEquation' ) node = n; } );

    check( 'parseHTML recognises an existing <math title> as our node', !!node, true );
    if ( node ) check( 'parseHTML reads latex from the title attribute', node.attrs.latex, '1+1' );

    editor.destroy();
}

console.log( '' );
if ( failures ) {
    console.log( failures + ' check(s) failed.' );
    process.exit( 1 );
} else {
    console.log( 'All checks passed.' );
}
