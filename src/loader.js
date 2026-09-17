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
// the default host, currently serves an older stylesheet that predates the CCEqnEditor/
// CCMathViewHost/CCLatexInput class names entirely (only a local dev mirror does not have this
// gap), so the maths/LaTeX mutual-exclusion is written defensively here rather than left to
// eqneditor.css. !important throughout, injected once rather than relying on load order
// against eqneditor.css: which stylesheet's rule wins would otherwise depend on which finishes
// loading last.
export function injectStyleOverridesOnce() {
    if ( document.getElementById( 'cc-eqneditor-style-overrides' ) ) return;
    var style = document.createElement( 'style' );
    style.id = 'cc-eqneditor-style-overrides';
    style.textContent =
        '.CCMathViewHost, .CCLatexInput { min-height: 220px !important; }' +
        '.CCEqnEditor[data-latex="on"] .CCMathViewHost { display: none !important; }' +
        '.CCEqnEditor[data-latex="off"] .CCLatexInput { display: none !important; }' +
        '.CCEqnEditor[data-inline="on"] .CCMathViewHost { justify-content: flex-start !important; }';
    document.head.appendChild( style );
}
