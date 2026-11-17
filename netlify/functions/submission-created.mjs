// Netlify appelle cette fonction à chaque envoi d'un formulaire du site (nom spécial « submission-created »).
// Elle envoie un mail à la charte à l'équipe et un accusé de réception au visiteur, par le serveur d'envoi de la
// boîte du domaine (LWS). Si l'envoi échoue, la demande reste enregistrée dans Netlify > Forms : rien n'est perdu.
//
// Variables à définir dans Netlify (Project configuration > Environment variables). Jamais dans le code :
//   SMTP_HOST   serveur d'envoi (ex. mail.carsitting.fr)
//   SMTP_PORT   465 (SSL) par défaut
//   SMTP_USER   adresse de la boîte qui envoie (ex. contact@carsitting.fr)
//   SMTP_PASS   mot de passe de cette boîte
//   MAIL_TO     adresse qui reçoit les demandes (par défaut : SMTP_USER)
//   MAIL_FROM_NAME  nom affiché (par défaut : CarSitting)
import nodemailer from 'nodemailer';
import { teamMail, visitorMail, isEmail, oneLine } from './lib/mail-templates.mjs';

export const handler = async (event) => {
  let payload;
  try {
    payload = JSON.parse(event.body || '{}').payload;
  } catch {
    return { statusCode: 400, body: 'Corps invalide' };
  }
  if (!payload || !['devis', 'partenaire'].includes(payload.form_name)) return { statusCode: 200, body: 'Formulaire ignoré' };

  const { SMTP_HOST, SMTP_PORT = '465', SMTP_USER, SMTP_PASS, MAIL_TO, MAIL_FROM_NAME = 'CarSitting' } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.error('Variables SMTP manquantes : aucun mail envoyé (la demande reste dans Netlify > Forms).');
    return { statusCode: 200, body: 'SMTP non configuré' };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  const from = `"${oneLine(MAIL_FROM_NAME).replace(/"/g, '')}" <${SMTP_USER}>`;
  const visitor = payload.data?.Email;

  try {
    const team = teamMail(payload);
    await transporter.sendMail({
      from,
      to: MAIL_TO || SMTP_USER,
      replyTo: isEmail(visitor) ? visitor.trim() : undefined,
      subject: team.subject,
      html: team.html,
      text: team.text,
    });
    // Accusé de réception : seulement si l'adresse du visiteur est valide ; un échec ici ne bloque pas le reste.
    if (isEmail(visitor)) {
      const ack = visitorMail(payload);
      await transporter.sendMail({ from, to: visitor.trim(), subject: ack.subject, html: ack.html, text: ack.text }).catch((e) => console.error('Accusé non envoyé :', e.message));
    }
    return { statusCode: 200, body: 'Mails envoyés' };
  } catch (e) {
    console.error('Envoi impossible :', e.message);
    return { statusCode: 500, body: 'Envoi impossible' };
  }
};
