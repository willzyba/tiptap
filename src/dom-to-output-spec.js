/**
 * Converts a real DOM element into ProseMirror's DOMOutputSpec array form, so a pre-built
 * element (the MathML this package's Output.exportAs('mathmlspeech') produces) can be handed
 * to Tiptap's renderHTML/parseHTML pipeline instead of only the string it serialises to.
 *
 * ProseMirror needs the array form specifically for editor.getHTML()/toDOM(): a raw DOM Node
 * cannot be returned from renderHTML() directly, only this nested-array description of one -
 * ['tag', {attr: value}, ...children].
 */
export function domToOutputSpec( el ) {
    if ( el.nodeType === 3 ) return el.nodeValue; // Text node.
    if ( el.nodeType !== 1 ) return ''; // Comments etc. - MathML never carries any.

    var attrs = {};
    for ( var i = 0; i < el.attributes.length; i++ ) {
        var a = el.attributes[ i ];
        attrs[ a.name ] = a.value;
    }

    var spec = [ el.tagName.toLowerCase(), attrs ];
    for ( var j = 0; j < el.childNodes.length; j++ ) {
        spec.push( domToOutputSpec( el.childNodes[ j ] ) );
    }
    return spec;
}
