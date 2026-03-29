/* ═══════════════════════════════════════════════════════════════════
   MOD-EXPORT.JS — Exportación Word (.docx) y PDF · Fiscalito
   v1.0 · 2026-03-27
   Uso: exportToWord(text, filename) / exportToPDF(text, filename)
   ═══════════════════════════════════════════════════════════════════ */
(function(){
"use strict";

/* ── CDN URLs ── */
const DOCX_CDN="https://unpkg.com/docx@9.0.2/build/index.umd.js";
const JSPDF_CDN="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js";
const PDFLIB_CDN="https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
const FILESAVER_CDN="https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js";

/* ── Lazy loader with 15s timeout ── */
function loadScript(url){
  return new Promise((resolve,reject)=>{
    if(document.querySelector(`script[src="${url}"]`)){resolve();return;}
    const s=document.createElement("script");
    s.src=url;
    const timeout=setTimeout(()=>{s.onerror(new Error('CDN timeout after 15s'));},15000);
    s.onload=()=>{clearTimeout(timeout);resolve();};
    s.onerror=()=>{clearTimeout(timeout);reject(new Error("Failed to load: "+url));};
    document.head.appendChild(s);
  });
}

/* ── Helper to extract document title ── */
function getTitleFromFilename(filename,ext){
  return filename.replace(new RegExp(`\\.${ext}$`,"i"),"").replace(/_/g," ");
}

/* ═════════════════════════════════════════════════════════════════════
   EXPORT TO WORD (.docx)
   Uses docx library for proper Word documents
   ═══════════════════════════════════════════════════════════════════ */
async function exportToWord(text, filename, options={}){
  if(!text||!text.trim()){showToast("⚠ Sin contenido para exportar");return;}
  showToast("📄 Generando documento Word…");

  try{
    await loadScript(DOCX_CDN);
    if(typeof saveAs==="undefined")await loadScript(FILESAVER_CDN);
  }catch(e){
    // Fallback: use Blob with HTML if libraries fail
    if(typeof showToast==='function')showToast('⚠ Librería Word no disponible, usando formato compatible');
    return exportWordFallback(text, filename, options);
  }

  try{
    const D=window.docx;
    if(!D||!D.Document){return exportWordFallback(text, filename, options);}

    const titulo=options.title||getTitleFromFilename(filename,"docx");
    const institucion=options.institution||"Universidad de Magallanes";
    const fecha=new Date().toLocaleDateString("es-CL",{day:"numeric",month:"long",year:"numeric"});

    // Parse text into paragraphs
    const lines=text.split("\n");
    const children=[];

    // Header
    children.push(new D.Paragraph({
      children:[new D.TextRun({text:institucion,bold:true,size:20,font:"Calibri",color:"4F46E5"})],
      alignment:D.AlignmentType.CENTER,spacing:{after:100},
    }));
    children.push(new D.Paragraph({
      children:[new D.TextRun({text:titulo,bold:true,size:28,font:"Calibri"})],
      alignment:D.AlignmentType.CENTER,spacing:{after:100},
    }));
    children.push(new D.Paragraph({
      children:[new D.TextRun({text:"Punta Arenas, "+fecha,size:22,font:"Calibri",italics:true,color:"666666"})],
      alignment:D.AlignmentType.CENTER,spacing:{after:300},
    }));

    // Content
    for(const line of lines){
      const trimmed=line.trim();
      if(!trimmed){
        children.push(new D.Paragraph({spacing:{after:120}}));
        continue;
      }

      // Detect headings
      const isHeading=trimmed.match(/^(VISTOS|CONSIDERANDO|POR TANTO|RESUELVO|RESOLUCIÓN|ACTA DE|INFORME|VISTA FISCAL|DECLARACIÓN|CARGO\s+(PRIMERO|SEGUNDO|TERCERO)|ADVERTENCIAS|IDENTIFICACIÓN)/i);
      const isNumbered=trimmed.match(/^(\d+[\.\-\)]\s)/);
      const isSubNumber=trimmed.match(/^(\d+\.\d+[\.\-\)]\s)/);

      if(isHeading){
        children.push(new D.Paragraph({
          children:[new D.TextRun({text:trimmed,bold:true,size:24,font:"Calibri"})],
          spacing:{before:240,after:120},
        }));
      } else if(isSubNumber){
        children.push(new D.Paragraph({
          children:[new D.TextRun({text:trimmed,size:22,font:"Calibri"})],
          indent:{left:720},spacing:{after:80},
        }));
      } else if(isNumbered){
        children.push(new D.Paragraph({
          children:[new D.TextRun({text:trimmed,size:22,font:"Calibri"})],
          indent:{left:360},spacing:{after:80},
        }));
      } else if(trimmed.startsWith("_____")){
        children.push(new D.Paragraph({spacing:{before:300}}));
        children.push(new D.Paragraph({
          children:[new D.TextRun({text:"_".repeat(30),size:22,font:"Calibri"})],
          alignment:D.AlignmentType.CENTER,
        }));
      } else {
        children.push(new D.Paragraph({
          children:[new D.TextRun({text:trimmed,size:22,font:"Calibri"})],
          spacing:{after:80},alignment:D.AlignmentType.JUSTIFIED,
        }));
      }
    }

    // Footer
    children.push(new D.Paragraph({spacing:{before:400}}));
    children.push(new D.Paragraph({
      children:[new D.TextRun({text:"Documento generado por Fiscalito · "+institucion+" · "+fecha,size:16,font:"Calibri",italics:true,color:"999999"})],
      alignment:D.AlignmentType.CENTER,
    }));

    const doc=new D.Document({
      styles:{default:{document:{run:{font:"Calibri",size:22}}}},
      sections:[{
        properties:{
          page:{margin:{top:1440,right:1080,bottom:1440,left:1440}},
        },
        children,
      }],
    });

    const blob=await D.Packer.toBlob(doc);
    const fn=filename.endsWith(".docx")?filename:filename+".docx";
    if(typeof saveAs==="function"){saveAs(blob,fn);}
    else{const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=fn;a.click();URL.revokeObjectURL(a.href);}

    showToast("✓ "+fn+" descargado");
  }catch(err){
    console.error("Word export error:",err);
    exportWordFallback(text, filename, options);
  }
}

/* Fallback Word export using HTML Blob */
function exportWordFallback(text, filename, options={}){
  const titulo=options.title||getTitleFromFilename(filename,"docx|doc");
  const fecha=new Date().toLocaleDateString("es-CL",{day:"numeric",month:"long",year:"numeric"});

  const htmlContent=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><style>
body{font-family:Calibri,sans-serif;font-size:11pt;line-height:1.6;margin:2cm 2.5cm}
h1{font-size:16pt;text-align:center;margin-bottom:6pt}
h2{font-size:13pt;margin-top:18pt;margin-bottom:6pt}
p{text-align:justify;margin:3pt 0}
.header{text-align:center;color:#4F46E5;font-size:10pt;margin-bottom:12pt}
.footer{text-align:center;color:#999;font-size:8pt;margin-top:24pt;font-style:italic}
.signature{margin-top:36pt}
</style></head><body>
<div class="header"><strong>Universidad de Magallanes</strong></div>
<h1>${titulo.replace(/</g,"&lt;")}</h1>
<p style="text-align:center;font-style:italic;color:#666">Punta Arenas, ${fecha}</p>
<hr style="margin:12pt 0">
${text.split("\n").map(line=>{
    const t=line.trim();
    if(!t)return"<br>";
    if(t.match(/^(VISTOS|CONSIDERANDO|POR TANTO|RESUELVO|RESOLUCIÓN|ACTA DE|INFORME|VISTA FISCAL|DECLARACIÓN|CARGO)/i))
      return'<h2>'+t.replace(/</g,"&lt;")+'</h2>';
    if(t.startsWith("_____"))return'<div class="signature">'+t+'</div>';
    return"<p>"+t.replace(/</g,"&lt;")+"</p>";
  }).join("\n")}
<div class="footer">Documento generado por Fiscalito · Universidad de Magallanes · ${fecha}</div>
</body></html>`;

  const blob=new Blob([htmlContent],{type:"application/msword;charset=utf-8"});
  const fn=filename.endsWith(".doc")||filename.endsWith(".docx")?filename:filename+".doc";
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=fn;a.click();URL.revokeObjectURL(a.href);
  showToast("✓ "+fn+" descargado (formato compatible Word)");
}

/* ═══════════════════════════════════════════════════════════════════
   EXPORT TO PDF
   Uses pdf-lib (already loaded by mod-pdf-tools) or jsPDF fallback
   ═══════════════════════════════════════════════════════════════════ */
async function exportToPDF(text, filename, options={}){
  if(!text||!text.trim()){showToast("⚠ Sin contenido para exportar");return;}
  showToast("📄 Generando PDF…");

  // Try pdf-lib first (already loaded by mod-pdf-tools)
  if(typeof PDFLib!=="undefined"){
    return exportPdfLib(text, filename, options);
  }

  // Try loading pdf-lib
  try{
    await loadScript(PDFLIB_CDN);
    if(typeof PDFLib!=="undefined"){
      return exportPdfLib(text, filename, options);
    }
  }catch(e){if(typeof showToast==='function')showToast('⚠ PDF-lib no disponible, intentando alternativa');}

  // Fallback: jsPDF
  try{
    await loadScript(JSPDF_CDN);
    return exportJsPDF(text, filename, options);
  }catch(e){
    if(typeof showToast==='function')showToast('⚠ Usando diálogo de impresión para PDF');
    // Last resort: print dialog
    return exportPrintPDF(text, filename, options);
  }
}

/* PDF via pdf-lib */
async function exportPdfLib(text, filename, options={}){
  try{
    const{PDFDocument,rgb,StandardFonts}=PDFLib;
    const doc=await PDFDocument.create();
    const font=await doc.embedFont(StandardFonts.Helvetica);
    const fontBold=await doc.embedFont(StandardFonts.HelveticaBold);

    const titulo=options.title||getTitleFromFilename(filename,"pdf");
    const fecha=new Date().toLocaleDateString("es-CL",{day:"numeric",month:"long",year:"numeric"});

    const PAGE_W=595.28; // A4
    const PAGE_H=841.89;
    const MARGIN=56;
    const LINE_H=14;
    const FONT_SZ=10;
    const TITLE_SZ=14;
    const MAX_W=PAGE_W-MARGIN*2;

    let page=doc.addPage([PAGE_W,PAGE_H]);
    let y=PAGE_H-MARGIN;

    // Draw header
    const drawText=(txt,sz,f,color,align)=>{
      if(y<MARGIN+30){page=doc.addPage([PAGE_W,PAGE_H]);y=PAGE_H-MARGIN;}
      const w=f.widthOfTextAtSize(txt.substring(0,200),sz);
      let x=MARGIN;
      if(align==="center")x=(PAGE_W-w)/2;
      page.drawText(txt.substring(0,200),{x,y,size:sz,font:f,color:color||rgb(0,0,0)});
      y-=sz+4;
    };

    // Header
    drawText("Universidad de Magallanes",9,fontBold,rgb(0.31,0.27,0.9),"center");
    drawText(titulo,TITLE_SZ,fontBold,rgb(0,0,0),"center");
    drawText("Punta Arenas, "+fecha,9,font,rgb(0.4,0.4,0.4),"center");
    y-=10;

    // Line separator
    page.drawLine({start:{x:MARGIN,y},end:{x:PAGE_W-MARGIN,y},thickness:0.5,color:rgb(0.8,0.8,0.8)});
    y-=15;

    // Word-wrap helper
    const wrapLine=(txt,maxW,sz,f)=>{
      const words=txt.split(/\s+/);
      const lines=[];let current="";
      for(const w of words){
        const test=current?current+" "+w:w;
        if(f.widthOfTextAtSize(test,sz)>maxW&&current){
          lines.push(current);current=w;
        }else{current=test;}
      }
      if(current)lines.push(current);
      return lines.length?lines:[""];
    };

    // Content
    const textLines=text.split("\n");
    for(const line of textLines){
      const trimmed=line.trim();
      if(!trimmed){y-=8;continue;}

      const isHeading=trimmed.match(/^(VISTOS|CONSIDERANDO|POR TANTO|RESUELVO|RESOLUCIÓN|ACTA DE|INFORME|VISTA FISCAL|DECLARACIÓN|CARGO|ADVERTENCIAS|IDENTIFICACIÓN)/i);

      if(isHeading){
        y-=6;
        const wrapped=wrapLine(trimmed,MAX_W,11,fontBold);
        for(const wl of wrapped){
          if(y<MARGIN+30){page=doc.addPage([PAGE_W,PAGE_H]);y=PAGE_H-MARGIN;}
          page.drawText(wl,{x:MARGIN,y,size:11,font:fontBold});
          y-=15;
        }
        y-=2;
      } else if(trimmed.startsWith("_____")){
        y-=20;
        if(y<MARGIN+30){page=doc.addPage([PAGE_W,PAGE_H]);y=PAGE_H-MARGIN;}
        page.drawText("_".repeat(40),{x:MARGIN+80,y,size:FONT_SZ,font,color:rgb(0.5,0.5,0.5)});
        y-=LINE_H;
      } else {
        const wrapped=wrapLine(trimmed,MAX_W,FONT_SZ,font);
        for(const wl of wrapped){
          if(y<MARGIN+30){page=doc.addPage([PAGE_W,PAGE_H]);y=PAGE_H-MARGIN;}
          page.drawText(wl,{x:MARGIN,y,size:FONT_SZ,font});
          y-=LINE_H;
        }
        y-=2;
      }
    }

    // Footer on last page
    y-=20;
    if(y<MARGIN+20){page=doc.addPage([PAGE_W,PAGE_H]);y=PAGE_H-MARGIN;}
    const footerTxt="Documento generado por Fiscalito · "+fecha;
    const fw=font.widthOfTextAtSize(footerTxt,7);
    page.drawText(footerTxt,{x:(PAGE_W-fw)/2,y:MARGIN-10,size:7,font,color:rgb(0.6,0.6,0.6)});

    // Page numbers
    const pages=doc.getPages();
    for(let i=0;i<pages.length;i++){
      const pn="Página "+(i+1)+" de "+pages.length;
      const pw=font.widthOfTextAtSize(pn,7);
      pages[i].drawText(pn,{x:PAGE_W-MARGIN-pw,y:MARGIN-10,size:7,font,color:rgb(0.6,0.6,0.6)});
    }

    const bytes=await doc.save();
    const blob=new Blob([bytes],{type:"application/pdf"});
    const fn=filename.endsWith(".pdf")?filename:filename+".pdf";
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=fn;a.click();URL.revokeObjectURL(a.href);
    showToast("✓ "+fn+" descargado");
  }catch(err){
    console.error("pdf-lib export error:",err);
    exportPrintPDF(text, filename, options);
  }
}

/* PDF via jsPDF fallback */
async function exportJsPDF(text, filename, options={}){
  try{
    const{jsPDF}=window.jspdf;
    const doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
    const titulo=options.title||getTitleFromFilename(filename,"pdf");
    const MARGIN=20;const MAX_W=170;
    let y=20;

    doc.setFont("helvetica","bold");doc.setFontSize(9);doc.setTextColor(79,70,229);
    doc.text("Universidad de Magallanes",105,y,{align:"center"});y+=6;
    doc.setFontSize(14);doc.setTextColor(0);
    doc.text(titulo,105,y,{align:"center"});y+=8;
    doc.setFont("helvetica","normal");doc.setFontSize(9);doc.setTextColor(100);
    doc.text("Punta Arenas, "+new Date().toLocaleDateString("es-CL",{day:"numeric",month:"long",year:"numeric"}),105,y,{align:"center"});y+=6;
    doc.setDrawColor(200);doc.line(MARGIN,y,190,y);y+=8;

    doc.setFontSize(10);doc.setTextColor(0);
    const lines=text.split("\n");
    for(const line of lines){
      const t=line.trim();
      if(!t){y+=4;continue;}
      if(y>275){doc.addPage();y=20;}

      if(t.match(/^(VISTOS|CONSIDERANDO|POR TANTO|RESUELVO|RESOLUCIÓN|ACTA DE|INFORME|VISTA FISCAL)/i)){
        doc.setFont("helvetica","bold");doc.setFontSize(11);
        y+=3;
        const wrapped=doc.splitTextToSize(t,MAX_W);
        doc.text(wrapped,MARGIN,y);y+=wrapped.length*5+3;
        doc.setFont("helvetica","normal");doc.setFontSize(10);
      } else {
        const wrapped=doc.splitTextToSize(t,MAX_W);
        if(y+wrapped.length*5>275){doc.addPage();y=20;}
        doc.text(wrapped,MARGIN,y);y+=wrapped.length*5+1;
      }
    }

    const fn=filename.endsWith(".pdf")?filename:filename+".pdf";
    doc.save(fn);
    showToast("✓ "+fn+" descargado");
  }catch(err){
    console.error("jsPDF export error:",err);
    exportPrintPDF(text, filename, options);
  }
}

/* Last resort: open print dialog */
function exportPrintPDF(text, filename, options={}){
  const titulo=options.title||filename.replace(/\.pdf$/,"").replace(/_/g," ");
  const w=window.open("","_blank","width=800,height=600");
  if(!w){showToast("⚠ Permite ventanas emergentes para exportar PDF");return;}
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titulo}</title>
<style>@page{margin:2cm 2.5cm}body{font-family:Calibri,sans-serif;font-size:11pt;line-height:1.6}
h1{text-align:center;font-size:16pt}h2{font-size:12pt;margin-top:14pt}
p{text-align:justify}
.header{text-align:center;color:#4F46E5;font-size:9pt}
.footer{text-align:center;color:#999;font-size:8pt;margin-top:24pt}
@media print{.no-print{display:none}}</style></head><body>
<div class="no-print" style="text-align:center;padding:10px;background:#f0f0f0;margin-bottom:20px">
<button onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer">🖨 Imprimir / Guardar PDF</button></div>
<div class="header"><strong>Universidad de Magallanes</strong></div>
<h1>${titulo}</h1>`);

  text.split("\n").forEach(line=>{
    const t=line.trim();
    if(!t){w.document.write("<br>");return;}
    if(t.match(/^(VISTOS|CONSIDERANDO|POR TANTO|RESUELVO|RESOLUCIÓN|ACTA DE|INFORME|VISTA FISCAL|DECLARACIÓN|CARGO)/i))
      w.document.write("<h2>"+t.replace(/</g,"&lt;")+"</h2>");
    else w.document.write("<p>"+t.replace(/</g,"&lt;")+"</p>");
  });

  w.document.write('<div class="footer">Documento generado por Fiscalito</div></body></html>');
  w.document.close();
  showToast("✓ Ventana de impresión abierta — usa 'Guardar como PDF'");
}

/* ═══════════════════════════════════════════════════════════════════
   EXPOSE API
   ═══════════════════════════════════════════════════════════════════ */
window.exportToWord=exportToWord;
window.exportToPDF=exportToPDF;
window.exportWordFallback=exportWordFallback;
window.exportPrintPDF=exportPrintPDF;

console.log("%c📄 Módulo Export Word/PDF cargado — Fiscalito","color:#4F46E5;font-weight:bold");
console.log("%c   ✓ exportToWord(text, filename)  ✓ exportToPDF(text, filename)","color:#666");
})();
