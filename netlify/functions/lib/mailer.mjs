// Envoi des mails du site : préparation commune aux fonctions (devis / partenariat et candidatures).
// Tout est lu dans les variables d'environnement Netlify (jamais dans le code) :
//   SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS   boîte qui envoie (hostmaster@carsitting.fr)
//   MAIL_TO                 adresse(s) des devis et partenariats, séparées par une virgule (ex. contact@carsitting.fr)
//   MAIL_TO_RECRUTEMENT     adresse(s) des candidatures (par défaut : recrutement@carsitting.fr)
//   MAIL_FROM               (facultatif) adresse affichée comme expéditeur ; l'envoi reste fait par SMTP_USER
//   MAIL_FROM_RECRUTEMENT   (facultatif) idem pour les candidatures
//   MAIL_FROM_NAME          nom affiché (par défaut : CarSitting)
import nodemailer from 'nodemailer';
import { isEmail, oneLine } from './mail-templates.mjs';

/** Liste d'adresses valides à partir de « a@x.fr, b@y.fr ». */
export const addresses = (v) => String(v || '').split(/[;,]/).map((a) => a.trim()).filter(isEmail);

/** Nom de fichier sûr pour une pièce jointe. */
export const safeName = (n) => String(n).replace(/[^\w.\- ()àâçéèêëîïôûùüÿ]/gi, '_').slice(0, 120) || 'cv';

/**
 * Prépare l'envoi : transport SMTP, expéditeur affiché, destinataires.
 * Renvoie null si les variables SMTP manquent (rien n'est alors envoyé).
 */
export function mailContext(env, formName, createTransport = (o) => nodemailer.createTransport(o)) {
  const { SMTP_HOST, SMTP_PORT = '465', SMTP_USER, SMTP_PASS, MAIL_FROM_NAME = 'CarSitting' } = env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  const recruit = formName === 'recrutement';
  const recipients = addresses(recruit ? env.MAIL_TO_RECRUTEMENT || 'recrutement@carsitting.fr' : env.MAIL_TO || SMTP_USER);
  const shown = (recruit && env.MAIL_FROM_RECRUTEMENT) || env.MAIL_FROM || SMTP_USER;
  const from = `"${oneLine(MAIL_FROM_NAME).replace(/"/g, '')}" <${isEmail(shown) ? shown : SMTP_USER}>`;
  const transporter = createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: Number(SMTP_PORT) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  return {
    recipients,
    /** Mail à l'équipe : « répondre » part vers le visiteur. */
    sendToTeam: (m) => transporter.sendMail({ from, envelope: { from: SMTP_USER, to: recipients }, to: recipients, ...m }),
    /** Accusé de réception au visiteur : ses réponses vont à l'adresse de réception. */
    sendToVisitor: (to, m) => transporter.sendMail({ from, envelope: { from: SMTP_USER, to: [to] }, to, replyTo: recipients[0] || SMTP_USER, ...m }),
  };
}
