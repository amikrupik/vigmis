"""
Generate professional Word documents for Vigmis legal files.
Run: python generate_word_docs.py
"""

from docx import Document
from docx.shared import Pt, Inches, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

# ── Constants ─────────────────────────────────────────────────────────────────

HE_FONT = 'Arial'       # supports Hebrew glyphs
EN_FONT = 'Calibri'


# ── Low-level RTL helpers ─────────────────────────────────────────────────────

def _set_para_rtl_props(paragraph, align_right=True):
    """Add w:bidi (and optionally w:jc right) to paragraph properties."""
    pPr = paragraph._p.get_or_add_pPr()
    # Remove duplicates
    for tag in ['w:bidi', 'w:jc']:
        for el in pPr.findall(qn(tag)):
            pPr.remove(el)
    bidi = OxmlElement('w:bidi')
    pPr.append(bidi)
    if align_right:
        jc = OxmlElement('w:jc')
        jc.set(qn('w:val'), 'right')
        pPr.append(jc)


def _set_run_rtl_props(run, font_name=HE_FONT):
    """Add w:rtl and Hebrew language tag to a run."""
    rPr = run._r.get_or_add_rPr()
    # Remove duplicates
    for tag in ['w:rtl', 'w:lang']:
        for el in rPr.findall(qn(tag)):
            rPr.remove(el)
    rtl = OxmlElement('w:rtl')
    rPr.append(rtl)
    lang = OxmlElement('w:lang')
    lang.set(qn('w:bidi'), 'he-IL')
    rPr.append(lang)
    if font_name:
        run.font.name = font_name


def make_rtl(paragraph, font_name=HE_FONT):
    """Make a paragraph (and all its existing runs) RTL."""
    _set_para_rtl_props(paragraph)
    for run in paragraph.runs:
        _set_run_rtl_props(run, font_name)


# ── Document-level helpers ────────────────────────────────────────────────────

def set_doc_rtl_defaults(doc):
    """Set Normal style defaults to RTL so new paragraphs inherit."""
    normal = doc.styles['Normal']
    # Paragraph defaults
    pPr = normal.element.get_or_add_pPr()
    for tag in ['w:bidi', 'w:jc']:
        for el in pPr.findall(qn(tag)):
            pPr.remove(el)
    bidi = OxmlElement('w:bidi')
    pPr.append(bidi)
    jc = OxmlElement('w:jc')
    jc.set(qn('w:val'), 'right')
    pPr.append(jc)
    # Run defaults
    rPr = normal.element.get_or_add_rPr()
    for tag in ['w:rtl', 'w:lang']:
        for el in rPr.findall(qn(tag)):
            rPr.remove(el)
    rtl = OxmlElement('w:rtl')
    rPr.append(rtl)
    lang = OxmlElement('w:lang')
    lang.set(qn('w:bidi'), 'he-IL')
    rPr.append(lang)


# ── High-level paragraph helpers (Hebrew doc) ─────────────────────────────────

def he_heading(doc, text, level=1, color=None):
    p = doc.add_heading(text, level=level)
    make_rtl(p)
    if color:
        for run in p.runs:
            run.font.color.rgb = RGBColor(*color)
    return p


def he_para(doc, text, bold=False, italic=False, size=11, space_after=6, style=None):
    p = doc.add_paragraph(style=style) if style else doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    run = p.add_run(text)
    run.bold = bold
    run.italic = italic
    run.font.size = Pt(size)
    make_rtl(p)
    return p


def he_bullet(doc, text, size=11):
    p = doc.add_paragraph(style='List Bullet')
    run = p.add_run(text)
    run.font.size = Pt(size)
    make_rtl(p)
    return p


def he_table_row(table, cells, bold_first=False):
    """Add a row to a table; all cells get RTL."""
    row = table.add_row()
    for i, (cell, text) in enumerate(zip(row.cells, cells)):
        # Clear and set text through a run (so we can control RTL on the run)
        cell.paragraphs[0].clear()
        run = cell.paragraphs[0].add_run(text)
        run.font.size = Pt(10)
        run.font.name = HE_FONT
        if bold_first and i == 0:
            run.bold = True
        make_rtl(cell.paragraphs[0])


def he_table_header(table, labels):
    """Style the first (header) row of a table."""
    row = table.rows[0]
    for cell, text in zip(row.cells, labels):
        cell.paragraphs[0].clear()
        run = cell.paragraphs[0].add_run(text)
        run.bold = True
        run.font.size = Pt(10)
        run.font.name = HE_FONT
        make_rtl(cell.paragraphs[0])


def add_hr(doc):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(4)
    pPr = p._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), '6')
    bottom.set(qn('w:space'), '1')
    bottom.set(qn('w:color'), '94A3B8')
    pBdr.append(bottom)
    pPr.append(pBdr)


# ══════════════════════════════════════════════════════════════════════════════
# DOCUMENT 1 — Hebrew Executive Summary
# ══════════════════════════════════════════════════════════════════════════════

def build_hebrew_doc():
    doc = Document()
    set_doc_rtl_defaults(doc)

    section = doc.sections[0]
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.left_margin = Cm(3)
    section.right_margin = Cm(3)
    section.top_margin = Cm(2.5)
    section.bottom_margin = Cm(2.5)

    # ── Title ──
    title = doc.add_heading('VIGMIS — מבנה משפטי ותאגידי', 0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    make_rtl(title)

    sub = doc.add_paragraph('סיכום מנהלים — גרסה מלאה')
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub.runs[0].font.size = Pt(13)
    sub.runs[0].italic = True
    make_rtl(sub)

    meta = doc.add_paragraph('תאריך עריכה: יוני 2026   |   מוכן על ידי: אמיחי קרופיק, מייסד   |   סטטוס: טיוטת עבודה')
    meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    meta.runs[0].font.size = Pt(9)
    meta.runs[0].font.color.rgb = RGBColor(0x94, 0xA3, 0xB8)
    make_rtl(meta)

    add_hr(doc)

    # ── 1. רקע ──
    he_heading(doc, '1. רקע ומטרת המסמך', level=1)
    he_para(doc,
        'מסמך זה מתאר את המבנה התאגידי שנבחר עבור פעילות VIGMIS, מנמק את ההחלטות שהתקבלו, '
        'ומשמש כבסיס לעבודה מול יועצים משפטיים, רואי חשבון ורשויות מס בישראל ובארצות הברית.')
    he_para(doc,
        'VIGMIS היא פלטפורמת SaaS לניהול שיווק דיגיטלי מבוסס AI, המיועדת לעסקים ברחבי העולם. '
        'הפלטפורמה מציעה יצירת תוכן שיווקי, ניהול קמפיינים, ניתוח ביצועים, ותקשורת עם לקוחות.')

    # ── 2. הצדדים ──
    he_heading(doc, '2. הצדדים', level=1)

    he_heading(doc, '2.1 טאורוס מנג\'מנט ואינווסטמנטס בע"מ', level=2)
    t1 = doc.add_table(rows=1, cols=2)
    t1.style = 'Table Grid'
    he_table_header(t1, ['שדה', 'פרטים'])
    for r in [
        ('שם', 'Taurus Management and Investments Ltd.'),
        ('מספר חברה', '514565118'),
        ('מדינה', 'ישראל'),
        ('כתובת', 'מובשוביץ בנימין 25, הרצליה 4640525'),
        ('בעלות', '100% — אמיחי קרופיק'),
        ('תפקיד', 'חברת אם, בעלת IP'),
    ]:
        he_table_row(t1, r, bold_first=True)
    doc.add_paragraph()

    he_heading(doc, '2.2 VIGMIS US LLC', level=2)
    t2 = doc.add_table(rows=1, cols=2)
    t2.style = 'Table Grid'
    he_table_header(t2, ['שדה', 'פרטים'])
    for r in [
        ('שם', 'VIGMIS US LLC'),
        ('מדינה', 'ארצות הברית — Wyoming'),
        ('בעלות', '100% — Taurus Management and Investments Ltd.'),
        ('UBO', 'אמיחי קרופיק'),
        ('תפקיד', 'חברת מכירות, גבייה ושיווק'),
    ]:
        he_table_row(t2, r, bold_first=True)
    doc.add_paragraph()

    # ── 3. מבנה הבעלות ──
    he_heading(doc, '3. מבנה הבעלות', level=1)
    tree = doc.add_paragraph()
    _set_para_rtl_props(tree, align_right=False)
    tree.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = tree.add_run(
        'אמיחי קרופיק (פרט)\n'
        '          |\n'
        '          | 100%\n'
        '          v\n'
        'Taurus Management and Investments Ltd.\n'
        '(Israel — Company No. 514565118)\n'
        '          |\n'
        '          | 100%\n'
        '          v\n'
        'VIGMIS US LLC\n'
        '(Wyoming, USA)'
    )
    run.font.name = 'Courier New'
    run.font.size = Pt(11)
    _set_run_rtl_props(run, font_name=None)

    # ── 4. למה ──
    he_heading(doc, '4. למה נבחר מבנה זה?', level=1)

    he_heading(doc, '4.1 הצורך בישות אמריקאית', level=2)
    he_para(doc, 'פעילות VIGMIS מחייבת חשבון Stripe וחשבון בנק אמריקאי:')
    for item in [
        'Stripe — מעניק שירות אמין ומלא לחברות אמריקאיות',
        'Google Ads ו-Meta Ads — גבייה ותשלום קל יותר מחשבון בנק אמריקאי',
        'לקוחות גלובליים — חוזים מול ישות אמריקאית עדיפים',
        'שירותי ענן — AWS, Railway, OpenAI — גבייה קלה יותר מישות אמריקאית',
    ]:
        he_bullet(doc, item)

    he_heading(doc, '4.2 למה Wyoming?', level=2)
    for item in [
        'אין מס הכנסה מדינתי — 0% state income tax',
        'עלות הקמה ותפעול נמוכה — כ-$100-150 לשנה',
        'פרטיות גבוהה — אין חובת גילוי שמות בעלים',
        'חוקי LLC מודרניים ובהירים',
        'Registered Agent זמין וזול',
    ]:
        he_bullet(doc, item)

    he_heading(doc, '4.3 IP נשאר בישראל — למה?', level=2)
    for item in [
        'פיתוח מתבצע בישראל — הכרה עתידית בהכנסות R&D',
        'פשטות — העברת IP לארה"ב מחייבת הערכת שווי ומיסוי',
        'הגנה — IP בישות האם מוגן מתביעות נגד ה-LLC',
        'עקביות — כל הצוות והטכנולוגיה בישראל',
    ]:
        he_bullet(doc, item)

    # ── 5. חלוקת אחריות ──
    he_heading(doc, '5. חלוקת תחומי אחריות', level=1)

    he_heading(doc, 'טאורוס ישראל — אחראית על:', level=2)
    t3 = doc.add_table(rows=1, cols=2)
    t3.style = 'Table Grid'
    he_table_header(t3, ['תחום', 'פירוט'])
    for r in [
        ('פיתוח מוצר', 'כל הקוד, אדריכלות המערכת, CI/CD'),
        ('R&D', 'מחקר ופיתוח AI, מודלים, Prompts'),
        ('Infrastructure', 'Railway, Supabase, Cloudflare, R2'),
        ('AI Providers', 'OpenAI, Anthropic, OpenRouter'),
        ('IP', 'קוד מקור, מותג, דומיינים, לוגו, AI Workflows'),
    ]:
        he_table_row(t3, r, bold_first=True)
    doc.add_paragraph()

    he_heading(doc, 'VIGMIS US LLC — אחראית על:', level=2)
    t4 = doc.add_table(rows=1, cols=2)
    t4.style = 'Table Grid'
    he_table_header(t4, ['תחום', 'פירוט'])
    for r in [
        ('גבייה', 'Stripe — ניהול מנויים, חיובים, Webhooks'),
        ('בנקאות', 'Mercury / Relay — חשבון בנק עסקי אמריקאי'),
        ('מכירות', 'Onboarding לקוחות, Trials, Conversions'),
        ('שיווק', 'Google Ads, Meta Ads, TikTok Ads'),
        ('חוזים', 'הלקוחות חותמים חוזה מול VIGMIS US LLC'),
    ]:
        he_table_row(t4, r, bold_first=True)
    doc.add_paragraph()

    doc.add_page_break()

    # ── 6. מודל הכנסות ──
    he_heading(doc, '6. מודל הכנסות וחלוקה', level=1)

    he_heading(doc, '6.1 הגדרות', level=2)
    p_def = doc.add_paragraph()
    p_def.paragraph_format.space_after = Pt(6)
    r1 = p_def.add_run('Gross Revenue')
    r1.bold = True
    r1.font.name = EN_FONT
    r2 = p_def.add_run(': סך החיובים ב-Stripe לפני כל ניכוי.')
    r2.font.name = HE_FONT
    make_rtl(p_def)

    p_net = doc.add_paragraph()
    p_net.paragraph_format.space_after = Pt(6)
    r3 = p_net.add_run('Net Revenue')
    r3.bold = True
    r3.font.name = EN_FONT
    r4 = p_net.add_run(' = Gross Revenue - Refunds - Chargebacks - Stripe Processing Fees (כ-2.9% + $0.30)')
    r4.font.name = HE_FONT
    make_rtl(p_net)

    he_heading(doc, '6.2 חלוקת Net Revenue', level=2)
    t5 = doc.add_table(rows=1, cols=3)
    t5.style = 'Table Grid'
    he_table_header(t5, ['צד', 'אחוז', 'הצדקה'])
    for r in [
        ('VIGMIS US LLC', '25%', 'כיסוי עלויות שיווק, מכירות, CRM, תפעול'),
        ('Taurus Management', '75%', 'תמלוג IP + שירותי פיתוח + תשתית'),
    ]:
        he_table_row(t5, r)
    doc.add_paragraph()

    # ── 7. שיקולי מס ──
    he_heading(doc, '7. שיקולי מס', level=1)

    he_heading(doc, '7.1 ארצות הברית', level=2)
    for item in [
        'Form 5472: חובה ל-Foreign-Owned SMLLC. קנס $25,000 לכל טרנזקציה שלא דווחה. לתאם עם CPA אמריקאי לפני הגשה ראשונה.',
        'Form 1120: VIGMIS US LLC מגישה דוח מס שנתי פדרלי.',
        'Wyoming: אין מס הכנסה מדינתי.',
    ]:
        he_bullet(doc, item)

    he_heading(doc, '7.2 ישראל', level=2)
    for item in [
        'CFC: כללי CFC של רשות המסים עשויים לחייב דיווח על הכנסות VIGMIS US בישראל. לבדוק עם יועץ מס ישראלי.',
        'העברות בין-חברתיות: 75% שמועבר לטאורוס — ניכוי מס במקור כפוף לאמנת המס ישראל-ארה"ב.',
        'Transfer Pricing: ה-75/25 חייב להיות מתועד כ-Arm\'s Length. ראה הסכם בין-חברתי.',
    ]:
        he_bullet(doc, item)

    # ── 8. משימות ──
    he_heading(doc, '8. רשימת משימות פתוחות', level=1)

    he_heading(doc, 'משפטי', level=2)
    for item in [
        'LLC Formation — הגשת Articles of Organization ב-Wyoming',
        'Operating Agreement — עם עורך דין Wyoming',
        'Intercompany Agreement — חתימה (ראה מסמך נפרד)',
        'Transfer Pricing Memo — עם הכנסות משמעותיות',
    ]:
        he_bullet(doc, item)

    he_heading(doc, 'מס ורגולציה', level=2)
    for item in [
        'CPA אמריקאי — Form 5472, Form 1120',
        'יועץ מס ישראלי — CFC, אמנת מס',
        'EIN — מה-IRS לאחר הקמת ה-LLC',
    ]:
        he_bullet(doc, item)

    he_heading(doc, 'בנקאות ותשלומים', level=2)
    for item in [
        'Mercury / Relay — פתיחת חשבון בנק עסקי',
        'Stripe — Live mode תחת VIGMIS US LLC',
    ]:
        he_bullet(doc, item)

    add_hr(doc)
    note = doc.add_paragraph(
        'מסמך זה נועד לצרכים עסקיים פנימיים ולשמש כבסיס לייעוץ מקצועי. '
        'אינו מהווה ייעוץ משפטי או מיסויי.'
    )
    note.runs[0].italic = True
    note.runs[0].font.size = Pt(9)
    note.runs[0].font.color.rgb = RGBColor(0x94, 0xA3, 0xB8)
    make_rtl(note)

    doc.save(r'C:\vigmis\vigmis-main\LEGAL\מבנה_משפטי_ותאגידי.docx')
    print('Hebrew document saved')


# ══════════════════════════════════════════════════════════════════════════════
# DOCUMENT 2 — Intercompany Agreement (English) — unchanged
# ══════════════════════════════════════════════════════════════════════════════

def add_paragraph_en(doc, text, rtl=False, bold=False, italic=False, size=None, space_after=6):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    run = p.add_run(text)
    run.bold = bold
    run.italic = italic
    if size:
        run.font.size = Pt(size)
    return p


def add_table_row_en(table, cells, bold_first=False):
    row = table.add_row()
    for i, (cell, text) in enumerate(zip(row.cells, cells)):
        cell.text = text
        for para in cell.paragraphs:
            for run in para.runs:
                if bold_first and i == 0:
                    run.bold = True
                run.font.size = Pt(10)


def add_hr_en(doc):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(4)
    pPr = p._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), '6')
    bottom.set(qn('w:space'), '1')
    bottom.set(qn('w:color'), '94A3B8')
    pBdr.append(bottom)
    pPr.append(pBdr)


def build_agreement_doc():
    doc = Document()

    section = doc.sections[0]
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.left_margin = Cm(3)
    section.right_margin = Cm(3)
    section.top_margin = Cm(2.5)
    section.bottom_margin = Cm(2.5)

    title = doc.add_heading('INTERCOMPANY LICENSE, SERVICES AND\nDISTRIBUTION AGREEMENT', 0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    doc.add_paragraph()
    eff_date = doc.add_paragraph('Effective Date: ___________________________')
    eff_date.alignment = WD_ALIGN_PARAGRAPH.CENTER
    eff_date.runs[0].font.size = Pt(12)
    eff_date.runs[0].italic = True

    add_hr_en(doc)

    doc.add_heading('PARTIES', level=1)
    parties_para = doc.add_paragraph('This Intercompany License, Services and Distribution Agreement (this ')
    parties_para.add_run('"Agreement"').bold = True
    parties_para.add_run(') is entered into as of the Effective Date by and between:')

    doc.add_paragraph()
    p_taurus = doc.add_paragraph()
    p_taurus.add_run('TAURUS MANAGEMENT AND INVESTMENTS LTD.').bold = True
    p_taurus.add_run(
        ', an Israeli private company, registered number 514565118, with its principal place of business at '
        'Benjamin Movshovitz 25, Herzliya 4640525, Israel (hereinafter '
    )
    p_taurus.add_run('"Taurus"').bold = True
    p_taurus.add_run(' or ')
    p_taurus.add_run('"Licensor"').bold = True
    p_taurus.add_run(');')

    doc.add_paragraph('and')

    p_vigmis = doc.add_paragraph()
    p_vigmis.add_run('VIGMIS US LLC').bold = True
    p_vigmis.add_run(
        ', a Wyoming limited liability company, wholly owned by Taurus, '
        'with its registered agent in the State of Wyoming (hereinafter '
    )
    p_vigmis.add_run('"VIGMIS US"').bold = True
    p_vigmis.add_run(' or ')
    p_vigmis.add_run('"Licensee"').bold = True
    p_vigmis.add_run(').')

    doc.add_paragraph()
    p_each = doc.add_paragraph()
    p_each.add_run('Taurus').italic = True
    p_each.add_run(' and ')
    p_each.add_run('VIGMIS US').italic = True
    p_each.add_run(' are each referred to herein individually as a ')
    p_each.add_run('"Party"').bold = True
    p_each.add_run(' and collectively as the ')
    p_each.add_run('"Parties"').bold = True
    p_each.add_run('.')

    add_hr_en(doc)

    doc.add_heading('RECITALS', level=1)
    recitals = [
        'WHEREAS, Taurus owns all right, title, and interest in the VIGMIS platform, including its software, artificial intelligence systems, brand, trademarks, domain names, and related intellectual property (collectively, the "IP");',
        'WHEREAS, Taurus desires to grant VIGMIS US a license to use the IP for the purpose of marketing, distributing, and selling access to the VIGMIS platform to end customers;',
        'WHEREAS, Taurus will continue to provide development, maintenance, and infrastructure services necessary to operate the platform;',
        'WHEREAS, the Parties desire to establish clear terms governing their intercompany relationship, including the allocation of revenues, in a manner consistent with the arm\'s-length standard required under applicable tax law;',
    ]
    for r in recitals:
        p = doc.add_paragraph(r, style='List Bullet')
        p.paragraph_format.space_after = Pt(4)

    p_now = doc.add_paragraph()
    p_now.add_run('NOW, THEREFORE').bold = True
    p_now.add_run(', in consideration of the mutual covenants and agreements set forth herein, the Parties agree as follows:')

    add_hr_en(doc)

    def article_heading(doc, title):
        h = doc.add_heading(title, level=1)
        h.paragraph_format.space_before = Pt(12)
        return h

    def section_text(doc, number, text):
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(6)
        p.paragraph_format.left_indent = Inches(0.25)
        p.add_run(number + '  ').bold = True
        p.add_run(text)
        return p

    article_heading(doc, 'ARTICLE 1 — DEFINITIONS')
    defs = [
        ('1.1', '"Platform"', 'means the VIGMIS SaaS platform, including all software, AI systems, APIs, user interfaces, and associated documentation developed and owned by Taurus.'),
        ('1.2', '"End Customer"', 'means any third-party business or individual that subscribes to or purchases access to the Platform through VIGMIS US.'),
        ('1.3', '"Gross Revenue"', 'means all amounts collected by VIGMIS US from End Customers in connection with their use of the Platform, before any deductions.'),
        ('1.4', '"Net Revenue"', 'means Gross Revenue less: (a) refunds; (b) chargebacks; and (c) Stripe processing fees directly attributable to collection.'),
        ('1.5', '"IP"', 'means all intellectual property owned by Taurus relating to the Platform, including source code, algorithms, AI models, trademarks, domain names, and know-how.'),
        ('1.6', '"Territory"', 'means worldwide.'),
        ('1.7', '"Accounting Period"', 'means each calendar month, unless otherwise agreed in writing.'),
    ]
    for num, term, definition in defs:
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.25)
        p.paragraph_format.space_after = Pt(4)
        p.add_run(num + '  ').bold = True
        p.add_run(term).bold = True
        p.add_run('  ' + definition)

    article_heading(doc, 'ARTICLE 2 — IP LICENSE')
    section_text(doc, '2.1', 'Grant of License.  Subject to the terms of this Agreement, Taurus hereby grants to VIGMIS US a non-exclusive, non-transferable, non-sublicensable license in the Territory to: (a) use the Platform solely for the purpose of marketing, demonstrating, and selling access to End Customers; (b) use Taurus\'s trademarks solely in connection with authorized marketing activities; and (c) enter into agreements with End Customers for access to the Platform.')
    section_text(doc, '2.2', 'No Transfer of Ownership.  Nothing in this Agreement shall be construed to transfer any ownership interest in the IP from Taurus to VIGMIS US. All IP shall remain the exclusive property of Taurus.')
    section_text(doc, '2.3', 'New Developments.  Any improvements or derivatives of the Platform, whether developed by Taurus, VIGMIS US, or jointly, shall be owned exclusively by Taurus. VIGMIS US hereby assigns to Taurus all right, title, and interest in any such developments.')

    article_heading(doc, 'ARTICLE 3 — DEVELOPMENT AND INFRASTRUCTURE SERVICES')
    section_text(doc, '3.1', 'Services Provided by Taurus.  During the Term, Taurus shall provide: (a) software development and maintenance; (b) cloud infrastructure management (Railway, Supabase, Cloudflare); (c) AI provider operations (OpenAI, Anthropic, and others); (d) product management and UX design; (e) cybersecurity and data protection.')
    section_text(doc, '3.2', 'Costs.  Taurus shall bear all costs associated with providing the Services, including employee costs, AI provider fees, and infrastructure costs.')

    article_heading(doc, 'ARTICLE 4 — DISTRIBUTION AND SALES RESPONSIBILITIES')
    section_text(doc, '4.1', 'Sales and Marketing.  VIGMIS US shall be responsible for: (a) marketing the Platform to prospective End Customers; (b) managing digital advertising (Google Ads, Meta Ads, TikTok Ads); (c) onboarding End Customers; (d) managing customer billing via Stripe; (e) managing refunds and chargebacks.')
    section_text(doc, '4.2', 'Customer Contracts.  VIGMIS US shall enter into agreements with End Customers under its own name and on its own behalf.')

    doc.add_page_break()

    article_heading(doc, 'ARTICLE 5 — REVENUE SHARING AND PAYMENT')
    section_text(doc, '5.1', 'Revenue Allocation.  The Parties agree that Net Revenue shall be allocated as follows:')

    t_rev = doc.add_table(rows=1, cols=3)
    t_rev.style = 'Table Grid'
    h_rev = t_rev.rows[0].cells
    for i, txt in enumerate(['Party', 'Percentage', 'Rationale']):
        h_rev[i].text = txt
        for run in h_rev[i].paragraphs[0].runs:
            run.bold = True
    for row_data in [
        ('Taurus', '75%', 'IP license royalty + Development Services fee'),
        ('VIGMIS US', '25%', 'Sales, marketing, distribution, and billing operations'),
    ]:
        add_table_row_en(t_rev, row_data)
    doc.add_paragraph()

    section_text(doc, '5.2', 'Arm\'s Length Standard.  The Parties acknowledge that the 75/25 allocation reflects an arm\'s-length arrangement: Taurus contributes substantially all value-generating assets and bears substantially all operating costs; VIGMIS US\'s function is distribution and billing, for which a 25% margin is consistent with industry norms for third-party SaaS distribution arrangements.')
    section_text(doc, '5.3', 'Payment Mechanics.  Within fifteen (15) days following the end of each Accounting Period, VIGMIS US shall prepare a Revenue Statement and transfer 75% of Net Revenue to Taurus by wire transfer or ACH. VIGMIS US shall retain 25%.')
    section_text(doc, '5.4', 'Records and Audit.  VIGMIS US shall maintain accurate billing records. Taurus shall have the right to audit such records upon reasonable written notice, no more than once per calendar year.')

    article_heading(doc, 'ARTICLE 6 — INTELLECTUAL PROPERTY OWNERSHIP')
    section_text(doc, '6.1', 'Taurus IP.  As between the Parties, Taurus exclusively owns all IP. VIGMIS US shall not take any action inconsistent with Taurus\'s ownership.')
    section_text(doc, '6.2', 'Brand Use.  VIGMIS US shall use the VIGMIS brand only in the form and manner approved by Taurus, and only in connection with authorized activities under this Agreement.')

    article_heading(doc, 'ARTICLE 7 — CONFIDENTIALITY')
    section_text(doc, '7.1', 'Each Party shall hold in strict confidence all Confidential Information of the other Party. Confidentiality obligations shall survive termination for five (5) years.')

    article_heading(doc, 'ARTICLE 8 — REPRESENTATIONS AND WARRANTIES')
    section_text(doc, '8.1', 'Mutual.  Each Party represents that: (a) it has full legal authority to enter into this Agreement; (b) this Agreement is a legal, valid, and binding obligation.')
    section_text(doc, '8.2', 'Taurus.  Taurus represents that it owns the IP free and clear and that, to its knowledge, the Platform does not infringe third-party intellectual property rights.')

    article_heading(doc, 'ARTICLE 9 — LIMITATION OF LIABILITY')
    section_text(doc, '9.1', 'In no event shall either Party be liable for indirect, incidental, or consequential damages. Each Party\'s aggregate liability shall not exceed total Net Revenue paid to Taurus in the twelve (12) months preceding the claim.')

    article_heading(doc, 'ARTICLE 10 — TERM AND TERMINATION')
    section_text(doc, '10.1', 'This Agreement commences on the Effective Date and continues indefinitely unless terminated.')
    section_text(doc, '10.2', 'Either Party may terminate upon thirty (30) days\' written notice if the other Party materially breaches this Agreement and fails to cure such breach within the notice period.')
    section_text(doc, '10.3', 'Upon termination: the IP license terminates; VIGMIS US shall cease all use of the IP; all outstanding amounts shall be paid promptly.')

    article_heading(doc, 'ARTICLE 11 — GENERAL PROVISIONS')
    section_text(doc, '11.1', 'Governing Law.  This Agreement shall be governed by the laws of the State of Israel. The Parties submit to the exclusive jurisdiction of the competent courts in Tel Aviv, Israel.')
    section_text(doc, '11.2', 'Entire Agreement.  This Agreement constitutes the entire agreement between the Parties and supersedes all prior agreements regarding its subject matter.')
    section_text(doc, '11.3', 'Amendment.  This Agreement may not be amended except by written instrument signed by both Parties.')
    section_text(doc, '11.4', 'Related Parties.  The Parties confirm that the terms herein are intended to reflect an arm\'s-length arrangement designed to withstand scrutiny by Israeli and United States tax authorities.')

    add_hr_en(doc)

    doc.add_heading('SIGNATURES', level=1)
    sig_note = doc.add_paragraph('IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.')
    sig_note.paragraph_format.space_after = Pt(20)

    sig_table = doc.add_table(rows=6, cols=2)
    sig_cells = [
        ['TAURUS MANAGEMENT AND INVESTMENTS LTD.', 'VIGMIS US LLC'],
        ['', ''],
        ['By: ___________________________', 'By: ___________________________'],
        ['Name: Amichai Krupik', 'Name: Amichai Krupik'],
        ['Title: Director / Authorized Signatory', 'Title: Manager / Authorized Signatory'],
        ['Date: ___________________________', 'Date: ___________________________'],
    ]
    for i, row_data in enumerate(sig_cells):
        row = sig_table.rows[i]
        for j, text in enumerate(row_data):
            row.cells[j].text = text
            for run in row.cells[j].paragraphs[0].runs:
                run.font.size = Pt(11)
                if i == 0:
                    run.bold = True

    doc.add_paragraph()
    disclaimer = doc.add_paragraph(
        'This document is a working draft prepared for internal business purposes and for review by qualified '
        'legal counsel and tax advisors. It does not constitute legal or tax advice. The Parties should engage '
        'qualified counsel in both Israel and the United States prior to finalizing this Agreement.'
    )
    disclaimer.runs[0].italic = True
    disclaimer.runs[0].font.size = Pt(9)
    disclaimer.runs[0].font.color.rgb = RGBColor(0x94, 0xA3, 0xB8)

    doc.save(r'C:\vigmis\vigmis-main\LEGAL\INTERCOMPANY_AGREEMENT.docx')
    print('Agreement document saved')


# ── Run ───────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    build_hebrew_doc()
    build_agreement_doc()
    print('Done. Files saved to LEGAL folder.')
