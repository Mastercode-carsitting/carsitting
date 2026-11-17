// Génère des aperçus HTML des mails des formulaires (netlify/functions/lib/mail-templates.mjs) avec des données d'exemple.
// Usage : node scripts/apercu-mails.mjs <dossier de sortie>. Rien n'est envoyé.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { teamMail, visitorMail } from '../netlify/functions/lib/mail-templates.mjs';

const out = process.argv[2] || 'apercu-mails';
mkdirSync(out, { recursive: true });

const devis = {
  form_name: 'devis',
  data: {
    subject: 'Demande de devis — Service régulier — Camille Martin',
    Parcours: 'Service régulier', 'Nom et prénom': 'Camille Martin', Établissement: 'Hôtel des Archives',
    Email: 'camille@hotel-archives.fr', Téléphone: '06 12 34 56 78',
    Message: 'Bonjour,\nNous cherchons un voiturier pour nos soirées du jeudi au samedi, à partir de janvier.\nMerci de nous indiquer vos disponibilités.',
  },
  ordered_human_fields: [
    { title: 'Parcours', name: 'Parcours', value: 'Service régulier' },
    { title: 'Nom et prénom', name: 'Nom et prénom', value: 'Camille Martin' },
    { title: 'Établissement', name: 'Établissement', value: 'Hôtel des Archives' },
    { title: 'Email', name: 'Email', value: 'camille@hotel-archives.fr' },
    { title: 'Téléphone', name: 'Téléphone', value: '06 12 34 56 78' },
    { title: 'Message', name: 'Message', value: 'Bonjour,\nNous cherchons un voiturier pour nos soirées du jeudi au samedi, à partir de janvier.\nMerci de nous indiquer vos disponibilités.' },
  ],
};
const partenaireEn = {
  form_name: 'partenaire',
  data: { 'Langue du visiteur': 'Anglais — répondre en anglais', subject: 'Devenir partenaire — EN — Grand Hotel Paris', Établissement: 'Grand Hotel Paris', Email: 'j.smith@grandhotel.com', Message: '<script>alert(1)</script> We would like to discuss a partnership.' },
};

const candidature = {
  form_name: 'recrutement',
  data: { subject: 'Candidature — Karim Benali', Prénom: 'Karim', Nom: 'Benali', Email: 'karim.benali@exemple.fr', Téléphone: '06 11 22 33 44', 'Ville de résidence': 'Saint-Denis', 'Permis B en cours de validité': 'Oui', 'Permis B depuis le': '12/05/2016', 'Conduite quotidienne': 'Oui, tous les jours', 'Types de véhicules conduits': 'Boîte automatique, Véhicules haut de gamme / sportifs', 'Déjà voiturier': 'Oui', 'Secteurs d’expérience': 'Hôtellerie de luxe, Événementiel', 'Expériences professionnelles': 'Voiturier pendant 3 ans dans un hôtel 5 étoiles.\nChauffeur privé le week-end.', 'Langues parlées': 'Français, Anglais', 'Statut professionnel': 'Micro-entrepreneur / indépendant', Disponibilités: 'En soirée, Week-ends', 'Consentement (conservation 2 ans)': 'Oui' },
};
const files = { 'equipe-devis': teamMail(devis), 'equipe-partenaire-en': teamMail(partenaireEn), 'visiteur-fr': visitorMail(devis), 'visiteur-en': visitorMail(partenaireEn), 'equipe-candidature': teamMail(candidature), 'visiteur-candidature': visitorMail(candidature) };
for (const [name, m] of Object.entries(files)) {
  writeFileSync(join(out, `${name}.html`), m.html);
  console.log(name.padEnd(22), '| objet :', m.subject);
}
