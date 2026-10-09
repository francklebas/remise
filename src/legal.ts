export type LegalRoute = "/mentions-legales" | "/conditions" | "/confidentialite";

// Bump when the terms change so new acceptances can be told apart.
export const TERMS_VERSION = "2026-10-09-provisoire";

export const legalLinks: Array<{ path: LegalRoute; label: string }> = [
  { path: "/mentions-legales", label: "Mentions légales" },
  { path: "/conditions", label: "Conditions d’utilisation et de vente" },
  { path: "/confidentialite", label: "Confidentialité" },
];

type LegalPage = { title: string; sections: Array<{ heading: string; paragraphs: string[] }> };

export const legalPages: Record<LegalRoute, LegalPage> = {
  "/mentions-legales": {
    title: "Mentions légales",
    sections: [
      { heading: "Éditeur", paragraphs: ["Les informations relatives à l’éditeur du service seront publiées ici."] },
      { heading: "Hébergement", paragraphs: ["Données applicatives et authentification : Supabase.", "Application, fichiers et images : Cloudflare."] },
    ],
  },
  "/conditions": {
    title: "Conditions d’utilisation et de vente",
    sections: [
      { heading: "Utilisation du service", paragraphs: ["Remise est un outil d’organisation de tâches en tableaux Kanban. Les conditions détaillées d’utilisation seront publiées ici."] },
      { heading: "Abonnement, résiliation et rétractation", paragraphs: ["Aucun abonnement payant n’est proposé pour le moment. Les conditions de vente, de résiliation et le droit de rétractation seront précisés avant leur ouverture."] },
    ],
  },
  "/confidentialite": {
    title: "Politique de confidentialité",
    sections: [
      { heading: "Données traitées", paragraphs: ["Adresse e-mail, préférences du compte et contenu que vous créez (espaces, boards, cartes, images)."] },
      { heading: "Sous-traitants", paragraphs: ["Supabase (base de données et authentification), Cloudflare (hébergement et stockage des images R2), Resend (envoi des e-mails). Le prestataire de paiement sera ajouté à cette liste lors de l’ouverture des abonnements."] },
      { heading: "Vos droits", paragraphs: ["Vous pouvez supprimer votre compte et toutes vos données à tout moment depuis votre page utilisateur."] },
    ],
  },
};

export function isLegalRoute(path: string): path is LegalRoute {
  return legalLinks.some((link) => link.path === path);
}
