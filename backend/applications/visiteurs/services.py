"""
Transitions de statut du registre des visiteurs — même schéma que
`applications.reservations.services` (EN_ATTENTE -> VALIDEE/REFUSEE) :
une notification part vers l'autre acteur à chaque étape.
"""

from django.utils import timezone

from applications.notifications.services import envoyer_notification

from .models import Visite


def valider_visite(visite, secretaire):
    """La secrétaire valide : le visiteur peut être accueilli. Notifie l'agent qui a enregistré la demande."""
    visite.statut = Visite.Statut.VALIDEE
    visite.traite_par = secretaire
    visite.save(update_fields=["statut", "traite_par"])

    envoyer_notification(
        visite.enregistre_par,
        "Visiteur validé",
        f"{visite.prenom} {visite.nom} peut être accueilli(e).",
        "SUCCESS",
        objet=visite,
    )
    return visite


def refuser_visite(visite, secretaire, motif_refus):
    """La secrétaire refuse : notifie l'agent, avec le motif s'il y en a un."""
    visite.statut = Visite.Statut.REFUSEE
    visite.traite_par = secretaire
    visite.motif_refus = motif_refus
    visite.save(update_fields=["statut", "traite_par", "motif_refus"])

    envoyer_notification(
        visite.enregistre_par,
        "Visiteur refusé",
        f"{visite.prenom} {visite.nom}" + (f" — {motif_refus}" if motif_refus else ""),
        "WARNING",
        objet=visite,
    )
    return visite


def marquer_depart_visite(visite):
    """Le visiteur rend son badge, récupère sa pièce d'identité et quitte les locaux."""
    visite.statut = Visite.Statut.TERMINEE
    visite.heure_depart = timezone.now()
    visite.save(update_fields=["statut", "heure_depart"])
    return visite
