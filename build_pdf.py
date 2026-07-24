#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Собирает PDF-сценарий в киноформате из vne-screenplay.txt."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak,
    KeepTogether,
)
from reportlab.lib.styles import ParagraphStyle
import re

FONT_DIR = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("Mono", FONT_DIR + "DejaVuSansMono.ttf"))
pdfmetrics.registerFont(TTFont("Mono-Bold", FONT_DIR + "DejaVuSansMono-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Mono-Obl", FONT_DIR + "DejaVuSansMono-Oblique.ttf"))
pdfmetrics.registerFontFamily(
    "Mono", normal="Mono", bold="Mono-Bold", italic="Mono-Obl", boldItalic="Mono-Bold"
)

FS = 10.5
LEAD = 13

def esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

styles = {
    "action": ParagraphStyle("action", fontName="Mono", fontSize=FS, leading=LEAD,
                             alignment=TA_LEFT, spaceAfter=6),
    "scene": ParagraphStyle("scene", fontName="Mono-Bold", fontSize=FS, leading=LEAD,
                            alignment=TA_LEFT, spaceBefore=10, spaceAfter=6,
                            textColor="#000000"),
    "char": ParagraphStyle("char", fontName="Mono-Bold", fontSize=FS, leading=LEAD,
                           leftIndent=5.2*cm, spaceBefore=4, spaceAfter=0),
    "paren": ParagraphStyle("paren", fontName="Mono-Obl", fontSize=FS, leading=LEAD,
                            leftIndent=4.0*cm, rightIndent=3.0*cm, spaceAfter=0),
    "dlg": ParagraphStyle("dlg", fontName="Mono", fontSize=FS, leading=LEAD,
                          leftIndent=2.6*cm, rightIndent=2.2*cm, spaceAfter=0),
    "trans": ParagraphStyle("trans", fontName="Mono-Bold", fontSize=FS, leading=LEAD,
                            alignment=TA_RIGHT, spaceBefore=6, spaceAfter=10),
    "insert": ParagraphStyle("insert", fontName="Mono-Obl", fontSize=FS, leading=LEAD,
                             leftIndent=1.2*cm, rightIndent=1.2*cm, spaceBefore=4,
                             spaceAfter=6, borderColor="#888888", borderWidth=0,
                             backColor="#f2f2f2", borderPadding=6),
    "act": ParagraphStyle("act", fontName="Mono-Bold", fontSize=15, leading=20,
                          alignment=TA_CENTER, spaceBefore=20, spaceAfter=16),
    "synhead": ParagraphStyle("synhead", fontName="Mono-Bold", fontSize=12, leading=16,
                              alignment=TA_LEFT, spaceBefore=14, spaceAfter=6),
    "syn": ParagraphStyle("syn", fontName="Mono", fontSize=FS, leading=LEAD,
                          alignment=TA_LEFT, spaceAfter=6),
}

# --- титульная страница ---
title_styles = {
    "big": ParagraphStyle("big", fontName="Mono-Bold", fontSize=42, leading=48,
                          alignment=TA_CENTER, spaceAfter=10),
    "sub": ParagraphStyle("sub", fontName="Mono", fontSize=13, leading=18,
                          alignment=TA_CENTER, spaceAfter=6),
    "small": ParagraphStyle("small", fontName="Mono", fontSize=10.5, leading=15,
                            alignment=TA_CENTER),
    "obl": ParagraphStyle("obl", fontName="Mono-Obl", fontSize=10.5, leading=15,
                          alignment=TA_CENTER),
}

meta = {}
lines = open("vne-screenplay.txt", encoding="utf-8").read().split("\n")

# считываем метаданные заголовка
body_start = 0
for i, ln in enumerate(lines):
    if ln.startswith("TITLE:"): meta["title"] = ln[6:].strip()
    elif ln.startswith("SUBTITLE:"): meta["subtitle"] = ln[9:].strip()
    elif ln.startswith("CREDIT:"): meta["credit"] = ln[7:].strip()
    elif ln.startswith("DRAFT:"): meta["draft"] = ln[6:].strip()
    elif ln.startswith("CONTACT:"): meta["contact"] = ln[8:].strip()
    elif ln.startswith("=SYNOPSIS="):
        body_start = i
        break

story = []
# титул
story.append(Spacer(1, 5.5*cm))
story.append(Paragraph(esc(meta.get("title", "")), title_styles["big"]))
story.append(Paragraph(esc(meta.get("subtitle", "")), title_styles["sub"]))
story.append(Spacer(1, 3*cm))
story.append(Paragraph(esc(meta.get("credit", "")), title_styles["small"]))
story.append(Spacer(1, 0.4*cm))
story.append(Paragraph(esc(meta.get("draft", "")), title_styles["obl"]))
story.append(Spacer(1, 4*cm))
story.append(Paragraph(esc(meta.get("contact", "")), title_styles["small"]))
story.append(PageBreak())

# --- тело ---
i = body_start
pending_char = None  # для склейки парентеза/реплики

def flush_dialog_block(buf, style):
    if buf:
        story.append(Paragraph(esc(" ".join(buf)), style))
        buf.clear()

dlg_buf = []
mode = None  # 'D' when accumulating dialogue lines

def close_dlg():
    global dlg_buf
    if dlg_buf:
        story.append(Paragraph(esc(" ".join(dlg_buf)), styles["dlg"]))
        dlg_buf = []

while i < len(lines):
    raw = lines[i]
    ln = raw.rstrip("\n")
    s = ln.strip()

    if s.startswith("=SYNOPSIS="):
        story.append(Paragraph("СИНОПСИС", styles["synhead"]))
    elif s.startswith("=NOTE="):
        close_dlg()
        story.append(Spacer(1, 4))
    elif s.startswith("=ACT="):
        close_dlg()
        story.append(PageBreak())
        story.append(Paragraph(esc(s[5:].strip()), styles["act"]))
    elif s.startswith("SC:"):
        close_dlg()
        story.append(Paragraph(esc(s[3:].strip()), styles["scene"]))
    elif s.startswith("T:"):
        close_dlg()
        story.append(Paragraph(esc(s[2:].strip()), styles["trans"]))
    elif s.startswith("C:"):
        close_dlg()
        story.append(Paragraph(esc(s[2:].strip()), styles["char"]))
    elif s.startswith("P:"):
        close_dlg()
        story.append(Paragraph(esc(s[2:].strip()), styles["paren"]))
    elif s.startswith("D:"):
        dlg_buf.append(s[2:].strip())
    elif s.startswith("INSERT:"):
        close_dlg()
        rest = s[7:].strip()
        if rest:
            story.append(Paragraph(esc(rest), styles["insert"]))
    elif s == "":
        close_dlg()
        # тонкий пробел между абзацами не добавляем — стили уже дают spaceAfter
    else:
        close_dlg()
        # обычный абзац — действие или синопсис/заметки
        story.append(Paragraph(esc(s), styles["action"]))
    i += 1

close_dlg()

# --- документ с колонтитулом (номер страницы) ---
def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Mono", 8)
    canvas.setFillColor("#666666")
    if doc.page > 1:
        canvas.drawRightString(A4[0]-2.2*cm, 1.2*cm, str(doc.page - 1) + ".")
        canvas.drawString(2.2*cm, 1.2*cm, "ВНЕ")
    canvas.restoreState()

doc = BaseDocTemplate("VNE-scenariy.pdf", pagesize=A4,
                      leftMargin=2.6*cm, rightMargin=2.2*cm,
                      topMargin=2.0*cm, bottomMargin=2.0*cm,
                      title="ВНЕ — сценарий", author="[Имя]")
frame = Frame(doc.leftMargin, doc.bottomMargin,
              A4[0]-doc.leftMargin-doc.rightMargin,
              A4[1]-doc.topMargin-doc.bottomMargin, id="main")
doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=footer)])
doc.build(story)
print("PDF готов: VNE-scenariy.pdf")
