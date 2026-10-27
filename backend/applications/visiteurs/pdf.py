"""
Registre des visiteurs — export PDF imprimable/archivable, même esprit que
`applications.tableau_bord.pdf` et `applications.documents.pdf` (en-tête
SMART HUB, tableau avec entêtes navy, pied de page avec date de génération
et numéro de page).
"""

import io

from django.utils import timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

_COULEUR_ENTETE = colors.HexColor("#1e3a8a")
_COULEUR_TEXTE_2 = colors.HexColor("#64748b")
_COULEUR_LIGNE_ALT = colors.HexColor("#f8fafc")
_COULEUR_BORD = colors.HexColor("#e2e8f0")
_COULEUR_VALIDEE = colors.HexColor("#15803d")
_COULEUR_REFUSEE = colors.HexColor("#dc2626")
_COULEUR_ATTENTE = colors.HexColor("#c2410c")

_COULEUR_PAR_STATUT = {
    "EN_ATTENTE": _COULEUR_ATTENTE,
    "VALIDEE": _COULEUR_ENTETE,
    "REFUSEE": _COULEUR_REFUSEE,
    "TERMINEE": _COULEUR_VALIDEE,
}


def _pied_page(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(_COULEUR_BORD)
    largeur, _ = landscape(A4)
    canvas.line(1.3 * cm, 1.2 * cm, largeur - 1.3 * cm, 1.2 * cm)
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(_COULEUR_TEXTE_2)
    genere_le = timezone.localtime(timezone.now()).strftime("%d/%m/%Y à %H:%M")
    canvas.drawString(1.3 * cm, .85 * cm, f"SMART HUB — Registre généré automatiquement le {genere_le}")
    canvas.drawRightString(largeur - 1.3 * cm, .85 * cm, f"Page {doc.page}")
    canvas.restoreState()


def generer_pdf_registre_visiteurs(visites, filiale_nom: str) -> bytes:
    tampon = io.BytesIO()
    doc = SimpleDocTemplate(
        tampon, pagesize=landscape(A4),
        topMargin=1.3 * cm, bottomMargin=1.6 * cm, leftMargin=1.3 * cm, rightMargin=1.3 * cm,
        title="Registre des visiteurs",
    )
    styles = getSampleStyleSheet()
    style_marque = ParagraphStyle("Marque", fontSize=15, textColor=_COULEUR_ENTETE, leading=18)
    style_sous_titre = ParagraphStyle("SousTitre", parent=styles["Normal"], fontSize=9.5, textColor=_COULEUR_TEXTE_2)
    # Cellules en Paragraph (pas en texte brut) : un tableau ReportLab ne
    # retourne pas à la ligne tout seul, un statut ou un motif un peu long
    # déborderait et chevaucherait la colonne suivante sinon.
    style_cellule = ParagraphStyle("Cellule", parent=styles["Normal"], fontSize=8, leading=10)
    style_statut = ParagraphStyle("Statut", parent=style_cellule, fontName="Helvetica-Bold")

    elements = [
        Paragraph("<b>SMART HUB</b>", style_marque),
        Paragraph(f"Registre des visiteurs — {filiale_nom}", styles["Title"]),
        Paragraph(
            f"{len(visites)} visite(s) enregistrée(s) · édité le "
            f"{timezone.localtime(timezone.now()).strftime('%d/%m/%Y à %H:%M')}",
            style_sous_titre,
        ),
        Spacer(1, 12),
    ]

    entetes = [
        "Visiteur", "Badge", "Pièce d'identité", "Filiale visitée", "Personne visitée", "Motif",
        "Arrivée", "Départ", "Statut", "Enregistré par", "Traité par",
    ]
    donnees = [entetes]
    for v in visites:
        style_ce_statut = style_statut
        couleur = _COULEUR_PAR_STATUT.get(v.statut)
        if couleur:
            style_ce_statut = ParagraphStyle(f"Statut{v.pk}", parent=style_statut, textColor=couleur)
        donnees.append([
            Paragraph(f"{v.prenom} {v.nom}", style_cellule),
            Paragraph(v.numero_badge or "—", style_cellule),
            Paragraph(f"{v.get_type_piece_display()}<br/>{v.numero_piece}", style_cellule),
            Paragraph(v.filiale.nom, style_cellule),
            Paragraph(v.personne_visitee.nom_complet if v.personne_visitee else "—", style_cellule),
            Paragraph(v.motif, style_cellule),
            timezone.localtime(v.heure_arrivee).strftime("%d/%m/%Y %H:%M"),
            timezone.localtime(v.heure_depart).strftime("%d/%m/%Y %H:%M") if v.heure_depart else "—",
            Paragraph(v.get_statut_display(), style_ce_statut),
            Paragraph(v.enregistre_par.nom_complet, style_cellule),
            Paragraph(v.traite_par.nom_complet if v.traite_par else "—", style_cellule),
        ])

    tableau = Table(
        donnees, repeatRows=1,
        colWidths=[
            # 27,1 cm : toute la largeur utile d'un A4 paysage.
            2.9 * cm, 1.6 * cm, 2.4 * cm, 2.5 * cm, 2.7 * cm, 2.7 * cm,
            2.4 * cm, 2.4 * cm, 2.3 * cm, 2.6 * cm, 2.6 * cm,
        ],
    )
    tableau.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _COULEUR_ENTETE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, _COULEUR_BORD),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _COULEUR_LIGNE_ALT]),
    ]))
    elements.append(tableau)

    if not visites:
        elements.append(Spacer(1, 10))
        elements.append(Paragraph("Aucune visite enregistrée pour le moment.", style_sous_titre))

    doc.build(elements, onFirstPage=_pied_page, onLaterPages=_pied_page)
    tampon.seek(0)
    return tampon.getvalue()
