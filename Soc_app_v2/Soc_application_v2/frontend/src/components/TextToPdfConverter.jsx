import React, { useState, useRef } from 'react';
import MiniPDF from './pdfwriter';
import './TextToPdfConverter.css';

function stripBold(text) {
    return text.replace(/\*\*/g, "");
}

const TextToPdfConverter = () => {
    const [textContent, setTextContent] = useState("");
    const [textFileName, setTextFileName] = useState("report");
    const [textFileLabel, setTextFileLabel] = useState(null);
    const [textPreview, setTextPreview] = useState("");
    const [imagePreviews, setImagePreviews] = useState([]); // [{name, dataUrl}]
    const [imageLabel, setImageLabel] = useState(null);
    const [status, setStatus] = useState(null); // { msg, type }
    const [isBusy, setIsBusy] = useState(false);

    const imageDataMapRef = useRef({});

    const setStatusMsg = (msg, type) => setStatus({ msg, type: type || "info" });
    const clearStatus = () => setStatus(null);

    const handleTextFileChange = (e) => {
        const file = e.target.files?.[0];

        if (!file) {
            setTextFileLabel(null);
            setTextPreview("");
            setTextContent("");
            return;
        }

        setTextFileName(file.name.replace(/\.txt$/i, ""));
        setTextFileLabel(file.name);

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target.result;
            setTextContent(content);
            setTextPreview(content.slice(0, 300) + (content.length > 300 ? "…" : ""));
            clearStatus();
        };
        reader.readAsText(file);
    };

    const handleImageFilesChange = (e) => {
        const files = Array.from(e.target.files || []);
        imageDataMapRef.current = {};

        if (files.length === 0) {
            setImageLabel(null);
            setImagePreviews([]);
            return;
        }

        setImageLabel(`${files.length} image(s) selected`);
        setImagePreviews([]);

        files.forEach((file) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const baseName = file.name.replace(/\.(png|jpe?g|gif|webp)$/i, "");
                imageDataMapRef.current[baseName] = event.target.result;

                setImagePreviews((prev) => [
                    ...prev,
                    { name: file.name, dataUrl: event.target.result },
                ]);
            };
            reader.readAsDataURL(file);
        });
    };

    // Builds the PDF - logic kept identical to the original pop.js
    const buildPDF = async () => {
        if (!textContent) {
            setStatusMsg("⚠ Please select a text file first.", "error");
            return null;
        }

        const doc = new MiniPDF();

        const pageW = 210, pageH = 297;
        const mL = 20, mR = 20, mT = 20, mB = 22;
        const cW = pageW - mL - mR;
        let y = mT;

        const SZ = { title: 18, h2: 13, body: 10, bullet: 10, caption: 9, footer: 8 };
        const LH = { title: 9, h2: 7, body: 5.5, bullet: 5.5, caption: 5 };

        function needY(mm) {
            if (y + mm > pageH - mB) { doc.addPage(); y = mT; }
        }
        function gap(mm) {
            y += mm;
            if (y > pageH - mB) { doc.addPage(); y = mT; }
        }

        function renderText(rawText, fontSize, lineH, color, indentMm, isBullet) {
            color = color || [30, 30, 30];
            indentMm = indentMm || 0;
            isBullet = !!isBullet;
            const plain = stripBold(rawText);
            doc.setFontSize(fontSize);
            doc.setTextColor(color[0], color[1], color[2]);

            if (isBullet) {
                const bIndent = 4;
                const wrapped = doc.splitTextToSize(plain, cW - indentMm - bIndent);
                needY(lineH + 2);
                doc.setFont("helvetica", "bold");
                doc.text("•", mL + indentMm, y);
                doc.setFont("helvetica", "normal");
                wrapped.forEach((ln, li) => {
                    if (li > 0) needY(lineH + 2);
                    doc.text(ln, mL + indentMm + bIndent, y);
                    y += lineH;
                });
            } else {
                const wrapped = doc.splitTextToSize(plain, cW - indentMm);
                wrapped.forEach((ln) => {
                    needY(lineH + 2);
                    doc.setFont("helvetica", "normal");
                    doc.text(ln, mL + indentMm, y);
                    y += lineH;
                });
            }
        }

        const lines = textContent.split("\n");
        let i = 0;
        const imageDataMap = imageDataMapRef.current;

        while (i < lines.length) {
            const line = lines[i].trim();

            if (!line) { gap(2.5); i++; continue; }

            if (line.startsWith("#IMAGE_HERE:")) {
                const figName = line.replace("#IMAGE_HERE:", "").trim();
                i++;

                let caption = null;
                let scan = i;
                while (scan < lines.length && lines[scan].trim() === "") scan++;
                if (scan < lines.length && lines[scan].trim().toLowerCase().startsWith("image note:")) {
                    caption = lines[scan].trim().slice("image note:".length).trim();
                    i = scan + 1;
                }

                const dataUrl = imageDataMap[figName] || null;

                if (dataUrl) {
                    try {
                        const dims = await new Promise((res, rej) => {
                            const tmp = new Image();
                            tmp.onload = () => res({ w: tmp.naturalWidth, h: tmp.naturalHeight });
                            tmp.onerror = rej;
                            tmp.src = dataUrl;
                        });
                        const targetW = cW;
                        const scale = targetW / (dims.w * 0.264583);
                        const targetH = dims.h * 0.264583 * scale;

                        needY(Math.min(targetH, 130) + 8);
                        await doc.addImage(dataUrl, "JPEG", mL, y, targetW, targetH);
                        y += targetH + 2;
                    } catch (err) {
                        console.error("Image embed error:", err);
                        doc.setFontSize(SZ.caption);
                        doc.setTextColor(150, 150, 150);
                        doc.text("[Image error: " + figName + "]", mL, y);
                        y += LH.caption + 2;
                        doc.setTextColor(30, 30, 30);
                    }
                } else {
                    doc.setFontSize(SZ.caption);
                    doc.setTextColor(150, 150, 150);
                    doc.text("[Missing image: " + figName + " — upload to include]", mL, y);
                    y += LH.caption + 2;
                    doc.setTextColor(30, 30, 30);
                }

                if (caption) {
                    renderText(caption, SZ.caption, LH.caption, [100, 100, 100], 0, false);
                    gap(2);
                }
                continue;
            }

            if (line.startsWith("# ") && !line.startsWith("## ")) {
                const text = stripBold(line.slice(2).trim());
                needY(14);
                doc.setFont("helvetica", "bold");
                doc.setFontSize(SZ.title);
                doc.setTextColor(15, 15, 35);
                doc.splitTextToSize(text, cW).forEach((ln) => { doc.text(ln, mL, y); y += LH.title; });
                gap(3); i++; continue;
            }

            if (line.startsWith("## ")) {
                const text = stripBold(line.slice(3).trim());
                needY(10); gap(2);
                doc.setFont("helvetica", "bold");
                doc.setFontSize(SZ.h2);
                doc.setTextColor(20, 50, 140);
                doc.splitTextToSize(text, cW).forEach((ln) => { doc.text(ln, mL, y); y += LH.h2; });
                doc.setDrawColor(20, 50, 140);
                doc.setLineWidth(0.3);
                doc.line(mL, y, mL + cW, y);
                gap(3); i++; continue;
            }

            if (line.startsWith("- ")) {
                const text = stripBold(line.slice(2).trim());
                needY(LH.bullet + 2);
                renderText(text, SZ.bullet, LH.bullet, [30, 30, 30], 4, true);
                i++; continue;
            }

            renderText(line, SZ.body, LH.body, [45, 45, 55], 0, false);
            i++;
        }

        const total = doc.getNumberOfPages();
        for (let p = 1; p <= total; p++) {
            doc.setPage(p);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(SZ.footer);
            doc.setTextColor(160, 160, 160);
            doc.text("Page " + p + " of " + total, pageW / 2, pageH - 10, { align: "center" });
            doc.text("Generated by Text→PDF Converter", mL, pageH - 10);
        }

        return doc;
    };

    const handleDownload = async () => {
        if (!textContent) { setStatusMsg("⚠ Please select a text file first.", "error"); return; }
        setStatusMsg("⏳ Generating PDF…", "info");
        setIsBusy(true);
        try {
            const doc = await buildPDF();
            if (doc) { doc.save(textFileName + ".pdf"); setStatusMsg("✓ PDF downloaded!", "success"); }
        } catch (e) {
            console.error(e);
            setStatusMsg("✗ Error: " + e.message, "error");
        } finally {
            setIsBusy(false);
        }
    };

    const handleView = async () => {
        if (!textContent) { setStatusMsg("⚠ Please select a text file first.", "error"); return; }
        setStatusMsg("⏳ Preparing preview…", "info");
        setIsBusy(true);
        try {
            const doc = await buildPDF();
            // chrome.tabs.create only works inside an actual browser extension -
            // window.open does the same thing (opens the PDF in a new tab) in
            // this normal web-app context.
            if (doc) { window.open(doc.output("bloburl"), "_blank"); setStatusMsg("✓ Opened in new tab.", "success"); }
        } catch (e) {
            console.error(e);
            setStatusMsg("✗ Error: " + e.message, "error");
        } finally {
            setIsBusy(false);
        }
    };

    return (
        <div className="pdf-converter-widget">
            <div className="modal">
                <div className="content">
                    <span className="title">Text &rarr; PDF Converter</span>
                    <p className="message">
                        Upload any <code>.txt</code> report and optional images to generate a PDF.
                    </p>

                    <div className="actions">
                        <label className="upload-btn">
                            <span className="upload-icon">📄</span> Choose Text File
                            <input
                                hidden
                                type="file"
                                accept=".txt,text/plain"
                                onChange={handleTextFileChange}
                            />
                        </label>
                    </div>
                    <div className="result">
                        <div className="file-uploaded">
                            {textFileLabel ? (
                                <p className="success">✓ {textFileLabel}</p>
                            ) : (
                                <p>No text file selected</p>
                            )}
                        </div>
                    </div>
                    {textPreview && <div className="preview-text">{textPreview}</div>}

                    <div className="actions">
                        <label className="upload-btn">
                            <span className="upload-icon">📷</span> Choose Image Files
                            <input
                                hidden
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={handleImageFilesChange}
                            />
                        </label>
                    </div>
                    <div className="result">
                        <div className="file-uploaded">
                            {imageLabel ? (
                                <p className="success">✓ {imageLabel}</p>
                            ) : (
                                <p>No images selected</p>
                            )}
                        </div>
                    </div>
                    {imagePreviews.length > 0 && (
                        <div className="image-preview-container" style={{ display: 'grid' }}>
                            {imagePreviews.map((img, i) => (
                                <img
                                    key={i}
                                    src={img.dataUrl}
                                    alt={img.name}
                                    className="image-preview-item"
                                />
                            ))}
                        </div>
                    )}

                    {status && (
                        <div className={`status-bar ${status.type}`} style={{ display: 'block' }}>
                            {status.msg}
                        </div>
                    )}

                    <div className="button-group">
                        <button
                            type="button"
                            className="action-btn"
                            onClick={handleDownload}
                            disabled={isBusy}
                        >
                            <p className="text">Download PDF</p>
                            <div className="svg">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="white" viewBox="0 0 16 16">
                                    <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                                    <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
                                </svg>
                            </div>
                        </button>
                        <button
                            type="button"
                            className="action-btn view-style"
                            onClick={handleView}
                            disabled={isBusy}
                        >
                            <p className="text">View PDF</p>
                            <div className="svg">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="white" viewBox="0 0 16 16">
                                    <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8z"/>
                                    <path d="M8 5.5A2.5 2.5 0 1 0 8 10.5A2.5 2.5 0 0 0 8 5.5z"/>
                                </svg>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TextToPdfConverter;
