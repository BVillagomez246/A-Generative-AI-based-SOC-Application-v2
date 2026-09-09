/**
 * MiniPDF — Self-contained PDF generator for Chrome extensions (no CDN needed)
 * Supports: Helvetica / Helvetica-Bold text, JPEG/PNG images, multi-page A4, footers
 *
 * API mirrors jsPDF enough that pop.js barely changes.
 */
class MiniPDF {
  constructor() {
    this._pageW = 595.28;   // A4 in points
    this._pageH = 841.89;
    this._pages = [];
    this._images = [];      // { name, base64jpeg, natW, natH }
    this._curPage = null;
    this._fontSize = 10;
    this._bold = false;
    this._tr = 0; this._tg = 0; this._tb = 0;
    this._dr = 0; this._dg = 0; this._db = 0;
    this._lw = 0.5;
    this._addPage();
  }

  // ─── Internal ─────────────────────────────────────────────────────────────
  _addPage() {
    const pg = { ops: [], imgRefs: new Set() };
    this._pages.push(pg);
    this._curPage = pg;
  }
  _op(s) { this._curPage.ops.push(s); }
  _toY(ymm) { return this._pageH - ymm * 2.8346; }   // mm top→pt bottom-origin
  _toX(xmm) { return xmm * 2.8346; }
  _mmToPt(mm) { return mm * 2.8346; }

  // ─── Public API ───────────────────────────────────────────────────────────
  addPage()          { this._addPage(); }
  getNumberOfPages() { return this._pages.length; }
  setPage(n)         { this._curPage = this._pages[n - 1]; }

  setFont(_family, style) { this._bold = (style === "bold"); }
  setFontSize(pt)   { this._fontSize = pt; }
  setTextColor(r, g, b) { this._tr = r/255; this._tg = g/255; this._tb = b/255; }
  setDrawColor(r, g, b) { this._dr = r/255; this._dg = g/255; this._db = b/255; }
  setLineWidth(pt)  { this._lw = pt; }

  /** Draw a horizontal rule. Coords in mm. */
  line(x1mm, y1mm, x2mm, _y2mm) {
    const x1 = this._toX(x1mm), x2 = this._toX(x2mm), y = this._toY(y1mm);
    this._op(`${this._dr.toFixed(3)} ${this._dg.toFixed(3)} ${this._db.toFixed(3)} RG`);
    this._op(`${this._lw} w`);
    this._op(`${x1.toFixed(2)} ${y.toFixed(2)} m ${x2.toFixed(2)} ${y.toFixed(2)} l S`);
  }

  /**
   * Render a text string.
   * @param {string} str
   * @param {number} xmm  x in mm (left edge, unless align:center given)
   * @param {number} ymm  y in mm from top (baseline)
   * @param {object} [opts]  { align: 'center' }
   */
  text(str, xmm, ymm, opts) {
    opts = opts || {};
    const fs   = this._fontSize;
    const font = this._bold ? "F2" : "F1";
    let   xPt  = this._toX(xmm);
    const yPt  = this._toY(ymm);

    if (opts.align === "center") xPt = xPt - this._strWidthPt(str, fs) / 2;

    const esc = this._esc(str);
    this._op("BT");
    this._op(`/${font} ${fs} Tf`);
    this._op(`${this._tr.toFixed(3)} ${this._tg.toFixed(3)} ${this._tb.toFixed(3)} rg`);
    this._op(`${xPt.toFixed(2)} ${yPt.toFixed(2)} Td`);
    this._op(`(${esc}) Tj`);
    this._op("ET");
  }

  /**
   * Embed an image.  dataUrl can be PNG or JPEG; we re-encode to JPEG via canvas.
   * Returns a Promise — await it.
   */
  async addImage(dataUrl, _fmt, xmm, ymm, wMm, hMm) {
    // Re-encode to JPEG using an offscreen canvas (works even for PNG)
    const jpegB64 = await this._toJpeg(dataUrl);
    const name = "Im" + (this._images.length + 1);

    // We need pixel dimensions — parse from a temp Image
    const { natW, natH } = await this._imgDims(dataUrl);

    this._images.push({ name, jpegB64, natW, natH });
    const imgIdx = this._images.length - 1;
    this._curPage.imgRefs.add(imgIdx);

    const xPt  = this._toX(xmm);
    const hPt  = this._mmToPt(hMm);
    const wPt  = this._mmToPt(wMm);
    const yPt  = this._toY(ymm) - hPt;   // PDF origin: bottom-left of image

    this._op("q");
    this._op(`${wPt.toFixed(2)} 0 0 ${hPt.toFixed(2)} ${xPt.toFixed(2)} ${yPt.toFixed(2)} cm`);
    this._op(`/${name} Do`);
    this._op("Q");
  }

  /** Estimate text width in mm */
  getTextWidth(str) {
    return this._strWidthPt(str, this._fontSize) / 2.8346;
  }

  /** Word-wrap string to fit maxWidthMm.  Returns string[]. */
  splitTextToSize(str, maxWidthMm) {
    const maxPt = this._mmToPt(maxWidthMm);
    const fs    = this._fontSize;
    const words = str.split(" ");
    const lines = [];
    let   line  = "";

    for (const w of words) {
      const candidate = line ? line + " " + w : w;
      if (this._strWidthPt(candidate, fs) <= maxPt) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [str];
  }

  // ─── Output ────────────────────────────────────────────────────────────────
  /**
   * Serialise to PDF and trigger browser download.
   */
  save(filename) {
    const url = this._blobUrl();
    const a   = document.createElement("a");
    a.href    = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }

  /**
   * Return a blob: URL for the PDF (used by "View" to open in a new tab).
   */
  output(mode) {
    if (mode === "bloburl") return this._blobUrl();
  }

  _blobUrl() {
    const bytes = this._buildBytes();
    const blob  = new Blob([bytes], { type: "application/pdf" });
    return URL.createObjectURL(blob);
  }

  // ─── PDF serialisation ────────────────────────────────────────────────────
  _buildBytes() {
    // Collect all objects with byte offsets
    const out     = [];   // string chunks
    const offsets = {};   // objId → byte offset
    let   nextId  = 1;

    const alloc = () => nextId++;
    const pushStr = (s) => out.push(s);
    const curOffset = () => out.join("").length;

    pushStr("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");

    // — Fonts —
    const f1 = alloc(), f2 = alloc();
    offsets[f1] = curOffset();
    pushStr(`${f1} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`);
    offsets[f2] = curOffset();
    pushStr(`${f2} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`);

    // — Images —
    const imgObjIds = [];
    for (const img of this._images) {
      const id  = alloc();
      imgObjIds.push(id);
      offsets[id] = curOffset();
      const raw   = atob(img.jpegB64);
      const len   = raw.length;
      pushStr(`${id} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.natW} /Height ${img.natH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${len} >>\nstream\n`);
      // Binary image data — push raw bytes as Latin-1 string
      pushStr(raw);
      pushStr("\nendstream\nendobj\n");
    }

    // — Page content streams —
    const contentIds = [];
    for (const pg of this._pages) {
      const id  = alloc();
      contentIds.push(id);
      const stream = pg.ops.join("\n");
      const len    = stream.length;
      offsets[id]  = curOffset();
      pushStr(`${id} 0 obj\n<< /Length ${len} >>\nstream\n${stream}\nendstream\nendobj\n`);
    }

    // — Page objects (need pagesId first, allocate now) —
    const pagesId  = alloc();
    const pageObjIds = [];
    for (let pi = 0; pi < this._pages.length; pi++) {
      const pg   = this._pages[pi];
      const id   = alloc();
      pageObjIds.push(id);
      offsets[id] = curOffset();

      // Build XObject dict for images used on this page
      let xobj = "";
      if (pg.imgRefs.size > 0) {
        const refs = [...pg.imgRefs].map(i => `/${this._images[i].name} ${imgObjIds[i]} 0 R`).join(" ");
        xobj = `/XObject << ${refs} >>`;
      }
      pushStr(`${id} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${this._pageW.toFixed(2)} ${this._pageH.toFixed(2)}] /Contents ${contentIds[pi]} 0 R /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> ${xobj} >> >>\nendobj\n`);
    }

    // — Pages tree —
    offsets[pagesId] = curOffset();
    const kids = pageObjIds.map(i => `${i} 0 R`).join(" ");
    pushStr(`${pagesId} 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${this._pages.length} >>\nendobj\n`);

    // — Catalog —
    const catId = alloc();
    offsets[catId] = curOffset();
    pushStr(`${catId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`);

    // — xref —
    const xrefOffset = curOffset();
    const total      = nextId;
    pushStr(`xref\n0 ${total}\n0000000000 65535 f \n`);
    for (let id = 1; id < total; id++) {
      pushStr(String(offsets[id] || 0).padStart(10, "0") + " 00000 n \n");
    }
    pushStr(`trailer\n<< /Size ${total} /Root ${catId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

    // Convert string to Uint8Array (Latin-1 safe for binary streams)
    const str  = out.join("");
    const buf  = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i) & 0xff;
    return buf;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Estimate string width in PDF points using Helvetica average metrics */
  _strWidthPt(str, fs) {
    // Per-character width table for Helvetica (AFM, normalised to 1000-unit em)
    // Using a simplified average: ~556 units for most chars
    const widths = {
      " ": 278, "!": 278, '"': 355, "#": 556, "$": 556, "%": 889,
      "&": 667, "'": 191, "(": 333, ")": 333, "*": 389, "+": 584,
      ",": 278, "-": 333, ".": 278, "/": 278,
      "0": 556, "1": 556, "2": 556, "3": 556, "4": 556,
      "5": 556, "6": 556, "7": 556, "8": 556, "9": 556,
      ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556,
      "@": 1015, "A": 667, "B": 667, "C": 722, "D": 722, "E": 667,
      "F": 611, "G": 778, "H": 722, "I": 278, "J": 500, "K": 667,
      "L": 556, "M": 833, "N": 722, "O": 778, "P": 667, "Q": 778,
      "R": 722, "S": 667, "T": 611, "U": 722, "V": 667, "W": 944,
      "X": 667, "Y": 667, "Z": 611,
      "[": 278, "\\": 278, "]": 278, "^": 469, "_": 556, "`": 333,
      "a": 556, "b": 556, "c": 500, "d": 556, "e": 556, "f": 278,
      "g": 556, "h": 556, "i": 222, "j": 222, "k": 500, "l": 222,
      "m": 833, "n": 556, "o": 556, "p": 556, "q": 556, "r": 333,
      "s": 500, "t": 278, "u": 556, "v": 500, "w": 722, "x": 500,
      "y": 500, "z": 500,
    };
    let total = 0;
    for (const ch of str) total += (widths[ch] || 556);
    return (total / 1000) * fs;
  }

  /** Escape special PDF string characters */
  _esc(str) {
    let out = "";
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      const code = str.charCodeAt(i);
      if      (c === "\\") out += "\\\\";
      else if (c === "(")  out += "\\(";
      else if (c === ")")  out += "\\)";
      else if (code < 32 || code > 126) out += "";  // drop control / high bytes
      else out += c;
    }
    return out;
  }

  /** Re-encode any image (PNG or JPEG) to JPEG base64 via a canvas */
  _toJpeg(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width  = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        const jpeg = c.toDataURL("image/jpeg", 0.92);
        resolve(jpeg.split(",")[1]);
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  /** Get natural pixel dimensions of an image dataUrl */
  _imgDims(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ natW: img.naturalWidth, natH: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
  }
}

export default MiniPDF;
