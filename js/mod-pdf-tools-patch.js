/**
 * MOD-PDF-TOOLS-PATCH.JS — Ya no necesario (fixes integrados en mod-pdf-tools.js)
 * Se mantiene por compatibilidad. Verifica que PDFLib esté cargado.
 */
if(typeof PDFLib==='undefined'){
  console.warn('PDFLib no cargado — verificar script CDN en index.html');
} else {
  console.log('%c📄 PDF Tools: PDFLib v'+PDFLib.Version+' listo','color:#3b82f6;font-weight:bold');
}
