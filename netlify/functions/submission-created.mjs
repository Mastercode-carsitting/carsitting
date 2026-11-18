// Netlify appelle cette fonction à chaque envoi d'un formulaire Netlify Forms du site (nom spécial « submission-created ») :
// devis et partenariat. Elle envoie un mail à la charte à l'équipe et un accusé de réception au visiteur.
// Si l'envoi échoue, la demande reste enregistrée dans Netlify > Forms : rien n'est perdu.
//
// Les candidatures ne passent PAS par ici : elles vont directement à la fonction « candidature » (avec le CV), sans rien
// stocker chez Netlify. Variables d'environnement : voir lib/mailer.mjs.
import { teamMail, visitorMail, isEmail } from './lib/mail-templates.mjs';
import { mailContext } from './lib/mailer.mjs';

const FORMS = ['devis', 'partenaire'];

export function makeHandler(deps = {}) {
  return async (event) => {
    let payload;
    try {
      payload = JSON.parse(event.body || '{}').payload;
    } catch {
      return { statusCode: 400, body: 'Corps invalide' };
    }
    if (!payload || !FORMS.includes(payload.form_name)) return { statusCode: 200, body: 'Formulaire ignoré' };

    const mail = mailContext(deps.env || process.env, payload.form_name, deps.createTransport);
    if (!mail) {
      console.error('Variables SMTP manquantes : aucun mail envoyé (la demande reste dans Netlify > Forms).');
      return { statusCode: 200, body: 'SMTP non configuré' };
    }

    const visitor = payload.data?.Email;
    try {
      const team = teamMail(payload);
      await mail.sendToTeam({ replyTo: isEmail(visitor) ? visitor.trim() : undefined, subject: team.subject, html: team.html, text: team.text });
      // Accusé de réception : seulement si l'adresse du visiteur est valide ; un échec ici ne bloque pas le reste.
      if (isEmail(visitor)) {
        const ack = visitorMail(payload);
        await mail.sendToVisitor(visitor.trim(), { subject: ack.subject, html: ack.html, text: ack.text }).catch((e) => console.error('Accusé non envoyé :', e.message));
      }
      return { statusCode: 200, body: 'Mails envoyés' };
    } catch (e) {
      console.error('Envoi impossible :', e.message);
      return { statusCode: 500, body: 'Envoi impossible' };
    }
  };
}

export const handler = makeHandler();
