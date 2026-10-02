/**
 * Loads the shared EqEditor API bundle and stylesheet - the same one-download-per-URL approach
 * as the CKEditor 5, TinyMCE and Froala plugins, so multiple editors on one page (or an app
 * mounting several editors as the user navigates) never fetch it twice.
 */

var scriptPromises = {};

export function loadScriptOnce( url ) {
    if ( scriptPromises[ url ] ) return scriptPromises[ url ];

    scriptPromises[ url ] = new Promise( function ( resolve, reject ) {
        if ( typeof window !== 'undefined' && typeof window.EqEditor !== 'undefined' ) {
            resolve();
            return;
        }

        var existing = document.querySelector( 'script[src="' + url + '"]' );
        var script = existing || document.createElement( 'script' );

        script.addEventListener( 'load', function () { resolve(); } );
        script.addEventListener( 'error', function () {
            reject( new Error( 'CodeCogs Equation Editor: could not load ' + url ) );
        } );

        if ( !existing ) {
            script.src = url;
            document.head.appendChild( script );
        }
    } );

    return scriptPromises[ url ];
}

// EqEditor.init() switches the converter every TextArea/MathView/Toolbar construction takes on
// to fxTeX Pro - skip it and they keep the placeholder converter for their whole lifetime, even
// once eqneditor.api.min.js itself has loaded. Called once per page; an empty licence is the
// normal, expected state until a real one is configured.
var initPromise = null;

export function ensureInit( licence ) {
    if ( initPromise ) return initPromise;
    initPromise = ( typeof window !== 'undefined' && typeof window.EqEditor !== 'undefined' && typeof window.EqEditor.init === 'function' )
        ? window.EqEditor.init( { licence: licence || '' } ).catch( function ( err ) {
            window.console && console.warn( 'fxTeX Pro: ' + ( err && err.message || err ) );
        } )
        : Promise.resolve();
    return initPromise;
}

export function loadCssOnce( url ) {
    if ( document.querySelector( 'link[href="' + url + '"]' ) ) return;
    var link = document.createElement( 'link' );
    link.rel = 'stylesheet';
    link.href = url;
    document.head.appendChild( link );
}

export function decodeEquation( encoded ) {
    var latex = encoded;
    try {
        latex = decodeURIComponent( encoded );
    } catch ( e ) {
        // Not valid percent-encoding; still worth showing as it stands.
    }
    return latex.replace( /&space;/g, ' ' ).replace( /&plus;/g, '+' ).replace( /&hash;/g, '#' );
}

export function escapeHtml( s ) {
    return String( s )
        .replace( /&/g, '&amp;' ).replace( /</g, '&lt;' )
        .replace( />/g, '&gt;' ).replace( /"/g, '&quot;' );
}

// Remembers which view (maths or LaTeX markup) the author last chose, across dialog opens and
// page loads - a cookie rather than localStorage because it is one line to read without a
// helper, and every editor instance on the page shares the one preference. Every adapter in
// eqneditor-v5-plugins uses this exact cookie name, so the choice carries across editors too.
var LATEX_COOKIE = 'cc_eqneditor_show_latex';

export function getShowLatexPreference( fallback ) {
    var match = document.cookie.match( /(?:^|; )cc_eqneditor_show_latex=([^;]*)/ );
    return match ? match[ 1 ] === '1' : fallback;
}

export function setShowLatexPreference( visible ) {
    document.cookie = LATEX_COOKIE + '=' + ( visible ? '1' : '0' ) + '; path=/; max-age=31536000; SameSite=Lax';
}

// Gaps in the shared eqneditor.css (loaded separately, asynchronously, from the host
// configured in options) this dialog needs but can't assume it will get: editor.codecogs.com,
// the old default host and still configurable, serves an older stylesheet that predates the CCEqnEditor/
// CCMathViewHost/CCLatexInput class names entirely (only a local dev mirror does not have this
// gap), so the maths/LaTeX mutual-exclusion is written defensively here rather than left to
// eqneditor.css. !important throughout, injected once rather than relying on load order
// against eqneditor.css: which stylesheet's rule wins would otherwise depend on which finishes
// loading last.
// The API's own injected @font-face for "Latin Modern Math" only carries
// local("Latin Modern Math") - no url() fallback - so it silently falls back to a generic
// serif unless that exact font happens to be installed. A later @font-face for the same
// family replaces the API's src list rather than merging with it, so redeclaring it here
// with a real url() fixes every equation and symbol on the page, not just this dialog's.
export function injectStyleOverridesOnce( fontUrl ) {
    if ( document.getElementById( 'cc-eqneditor-style-overrides' ) ) return;
    var style = document.createElement( 'style' );
    style.id = 'cc-eqneditor-style-overrides';
    style.textContent =
        '@font-face { font-family: "Latin Modern Math"; font-display: swap; ' +
            'src: local("Latin Modern Math"), url("' + fontUrl.replace( /prototypes\/latinmodern-math\.otf$/, 'fonts/LatinModernMath-Regular.woff2' ) + '") format("woff2"), url("' + fontUrl + '") format("opentype"); }' +
        // Undo host resets (e.g. .cke_reset_all *) inside the toolbar icons and the maths view's MathML.
        '.CCToolbar svg:has(g[font-family]), .CCToolbar svg:has(g[font-family]) * { font: revert-layer !important; }' +
        // Icons drawn as <text>: the svg gets the API's own .cc_panel font (fxTeX Toolbar, 16px) back over host resets, and each <text> its own font-size attribute (revert-layer lets attributes win).
        '.CCToolbar svg:not(:has(g[font-family])) { font: normal normal 16px "fxTeX Toolbar" !important; }' +
        '.CCToolbar svg:not(:has(g[font-family])) * { font: revert-layer !important; }' +
        '.CCToolbar svg, .CCToolbar svg * { width: revert-layer !important; height: revert-layer !important; max-width: revert-layer !important; }' +
        '.CCToolbar svg g[font-family="fxTeX Toolbar"] { color: #000 !important; }' +
        '.CCMathView math, .CCMathView math * { font: revert-layer !important; ' +
            'width: revert-layer !important; height: revert-layer !important; padding: revert-layer !important; ' +
            'margin: revert-layer !important; text-transform: revert-layer !important; text-align: revert-layer !important; ' +
            'box-sizing: revert-layer !important; white-space: revert-layer !important; }' +
        apiMathRules() +
        // The bottom bar: toggles left, Insert-as and the dialog's buttons right, one type size. All !important - host dialog resets otherwise restyle it.
        '.cc-eqn-bar { display: flex !important; align-items: center !important; gap: 16px !important; flex: 0 0 auto !important; ' +
            'margin: 8px 0 0 !important; padding: 10px 0 0 !important; border: 0 !important; border-top: 1px solid #e2e8f0 !important; ' +
            'background: none !important; font: 13px/1.3 system-ui, -apple-system, "Segoe UI", Arial, sans-serif !important; color: #1c2530 !important; }' +
        '.cc-eqn-bar-right { display: flex !important; align-items: center !important; gap: 8px !important; margin: 0 0 0 auto !important; padding: 0 !important; font: inherit !important; color: inherit !important; }' +
        '.cc-eqn-bar .cc-switch { display: inline-flex !important; align-items: center !important; gap: 6px !important; margin: 0 !important; ' +
            'padding: 0 !important; font: inherit !important; color: #54647c !important; cursor: pointer !important; user-select: none !important; white-space: nowrap !important; }' +
        '.cc-eqn-bar .cc-switch input { position: absolute !important; width: 1px !important; height: 1px !important; margin: -1px !important; ' +
            'padding: 0 !important; border: 0 !important; overflow: hidden !important; clip: rect(0, 0, 0, 0) !important; opacity: 0 !important; }' +
        '.cc-eqn-bar .cc-switch-track { position: relative !important; display: inline-block !important; flex: 0 0 auto !important; width: 28px !important; ' +
            'height: 16px !important; margin: 0 !important; padding: 0 !important; border: 0 !important; border-radius: 8px !important; ' +
            'background: #ccc !important; transition: background .2s !important; }' +
        '.cc-eqn-bar .cc-switch-knob { position: absolute !important; display: block !important; top: 2px !important; left: 2px !important; ' +
            'width: 12px !important; height: 12px !important; margin: 0 !important; border-radius: 50% !important; background: #fff !important; transition: left .2s !important; }' +
        '.cc-eqn-bar .cc-switch input:checked + .cc-switch-track { background: #4caf50 !important; }' +
        '.cc-eqn-bar .cc-switch input:checked + .cc-switch-track .cc-switch-knob { left: 14px !important; }' +
        '.cc-eqn-bar .cc-switch input:focus-visible + .cc-switch-track { outline: 2px solid #003794 !important; outline-offset: 2px !important; }' +
        '.cc-eqn-bar .cc-switch input:disabled ~ * { opacity: .5 !important; cursor: default !important; }' +
        '.cc-eqn-bar .cc-switch-label { font: inherit !important; color: inherit !important; }' +
        '.cc-eqn-bar .cc-switch input:checked ~ .cc-switch-label { color: #003794 !important; font-weight: 600 !important; }' +
        '.cc-eqn-bar .cc-eqn-select { width: auto !important; height: 30px !important; margin: 0 !important; padding: 0 8px !important; ' +
            'border: 1px solid #cbd5e0 !important; border-radius: 4px !important; background: #fff !important; font: inherit !important; color: #1c2530 !important; cursor: pointer !important; }' +
        '.cc-eqn-bar .cc-eqn-btn { display: inline-flex !important; align-items: center !important; height: 30px !important; margin: 0 !important; ' +
            'padding: 0 16px !important; border: 1px solid #cbd5e0 !important; border-radius: 4px !important; background: #fff !important; ' +
            'font: inherit !important; color: #1c2530 !important; cursor: pointer !important; box-shadow: none !important; }' +
        '.cc-eqn-bar .cc-eqn-btn * { font: inherit !important; color: inherit !important; }' +
        '.cc-eqn-bar .cc-eqn-btn.cc-eqn-primary { background: #2c7a4b !important; border-color: #2c7a4b !important; color: #fff !important; }' +
        '.cc-eqneditor-modal-footer.cc-eqn-bar { margin: 0 !important; padding: 10px 14px !important; }' +
        '.CCMathViewHost, .CCLatexInput { min-height: 220px !important; }' +
        '.CCEqnEditor[data-latex="on"] .CCMathViewHost { display: none !important; }' +
        '.CCEqnEditor[data-latex="off"] .CCLatexInput { display: none !important; }' +
        '.CCEqnEditor[data-inline="on"] .CCMathViewHost { justify-content: flex-start !important; }';
    document.head.appendChild( style );
}

// The `design` option (see the README): how the editor looks, set by the site rather than the
// author. The toolbar's rows and scale go to Toolbar.link() itself; everything else is applied
// here, once the editor is mounted - CSS scoped to this editor's root, then the starting state of
// the LaTeX toggle and the "Insert as" menu.
var designCount = 0;
export function applyDesign( root, design, latexToggle, insertSelect ) {
    if ( !root || !design ) return;
    if ( !root.id ) root.id = 'cc-eqn-design-' + ( ++designCount );
    var sel = '#' + root.id, css = '';
    var colour = String( design.colour || '' );
    if ( /^(#[0-9a-f]{3,8}|[a-z]+)$/i.test( colour ) ) {
        css += sel + ' { --cc-accent: ' + colour + ';' +
            ' --cc-accent-soft: color-mix(in srgb, ' + colour + ' 11%, #fff);' +
            ' --cc-accent-soft-ring: color-mix(in srgb, ' + colour + ' 28%, #fff);' +
            ' --cc-accent-mid: color-mix(in srgb, ' + colour + ' 22%, #fff);' +
            ' --cc-accent-mid-ring: color-mix(in srgb, ' + colour + ' 43%, #fff); }';
    }
    if ( Number( design.mathSize ) > 0 ) css += sel + ' .CCMathView { font-size: ' + Number( design.mathSize ) + 'px !important; }';
    if ( Number( design.latexSize ) > 0 ) css += sel + ' .CCLatexInput { font-size: ' + Number( design.latexSize ) + 'px !important; }';
    if ( design.toolbar === false ) css += sel + ' .CCToolbar { display: none !important; }';
    if ( design.history === false ) css += sel + ' .CCEditorBar { display: none !important; }';
    if ( css ) {
        var style = document.createElement( 'style' );
        style.textContent = css;
        root.appendChild( style );
    }
    // The whole dialog, box and contents together - see `dialogSize` in the README. Zoomed where
    // the host lays the dialog out (it grows in place); scaled where the host positions it itself
    // (CKEditor, TinyMCE 4, a TiddlyWiki drop-down), so that placement still holds.
    var size = Number( design.dialogSize );
    if ( size > 0 && size !== 1 ) {
        var box = root.closest( '.tox-dialog, .mce-window, .cke_dialog, .ck-balloon-panel, .cc-eqneditor-modal, .tc-drop-down' ) || root;
        var position = getComputedStyle( box ).position;
        if ( position === 'absolute' || position === 'fixed' ) {
            box.style.transform = 'scale(' + size + ')';
            box.style.transformOrigin = box.matches( '.ck-balloon-panel' ) ? 'top center'
                : box.matches( '.tc-drop-down' ) ? 'top left' : 'center center';
        } else {
            box.style.zoom = String( size );
            box.style.setProperty( 'max-width', 'calc(96vw / ' + size + ')', 'important' );   // still no wider than the window
        }
    }
    if ( insertSelect && design.insertAs && insertSelect.querySelector( 'option[value="' + design.insertAs + '"]' ) ) {
        insertSelect.value = design.insertAs;
    }
    if ( latexToggle && design.latex && !latexToggle.checked && !latexToggle.disabled ) {
        latexToggle.checked = true;
        latexToggle.dispatchEvent( new Event( 'change', { bubbles: true } ) );
    }
}

// Re-asserts the API's own .CCMathView/.fxtex rules, which host resets and revert-layer override.
function apiMathRules() {
    var out = '';
    for ( var i = 0; i < document.styleSheets.length; i++ ) {
        var rules;
        try { rules = document.styleSheets[ i ].cssRules; } catch ( e ) { continue; }
        for ( var j = 0; j < rules.length; j++ ) {
            var r = rules[ j ], decls = '';
            if ( !r.selectorText || !/(^|,)\s*\.(fxtex|CCMathView)\b/.test( r.selectorText ) ) continue;
            for ( var k = 0; k < r.style.length; k++ ) {
                decls += r.style[ k ] + ':' + r.style.getPropertyValue( r.style[ k ] ) + ' !important;';
            }
            if ( decls ) {
                out += r.selectorText.split( ',' ).map( function ( s ) {
                    s = s.trim();
                    return /^\.CCMathView\b/.test( s ) ? s : '.CCMathView ' + s;
                } ).join( ',' ) + '{' + decls + '}';
            }
        }
    }
    return out;
}
