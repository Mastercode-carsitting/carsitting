// Netlify appelle cette fonction à chaque envoi d'un formulaire du site (nom spécial « submission-created »).
// Elle envoie un mail à la charte à l'équipe et un accusé de réception au visiteur, par le serveur d'envoi d'une boîte du
// domaine (LWS). Si l'envoi échoue, la demande reste enregistrée dans Netlify > Forms : rien n'est perdu.
//
// Candidatures (formulaire « recrutement ») : le CV déposé par le candidat est joint au mail, puis la candidature est
// SUPPRIMÉE de Netlify (données et fichier) une fois le mail parti. Les données ne vivent plus que dans la boîte de réception.
// Si la jointure ou l'envoi échoue, rien n'est supprimé.
//
// Variables à définir dans Netlify (Project configuration > Environment variables). Jamais dans le code :
//   SMTP_HOST   serveur d'envoi (ex. mail.carsitting.fr)
//   SMTP_PORT   465 (SSL) par défaut
//   SMTP_USER   adresse de la boîte qui envoie (hostmaster@carsitting.fr)
//   SMTP_PASS   mot de passe de cette boîte
//   MAIL_TO     adresse(s) qui reçoivent les devis et partenariats, séparées par une virgule (ex. contact@carsitting.fr)
//   MAIL_TO_RECRUTEMENT  adresse(s) qui reçoivent les candidatures (par défaut : recrutement@carsitting.fr)
//   MAIL_FROM   (facultatif) adresse affichée comme expéditeur (ex. contact@carsitting.fr) ; l'envoi reste fait par SMTP_USER
//   MAIL_FROM_RECRUTEMENT  (facultatif) idem pour les candidatures (ex. recrutement@carsitting.fr)
//   MAIL_FROM_NAME  nom affiché (par défaut : CarSitting)
//   NETLIFY_ACCESS_TOKEN  (secret) jeton personnel Netlify : permet de télécharger le CV et de supprimer la candidature.
//                         Sans lui, le CV n'est pas joint et rien n'est supprimé (la candidature reste dans Netlify > Forms).
import nodemailer from 'nodemailer';
import { teamMail, visitorMail, isEmail, oneLine } from './lib/mail-templates.mjs';

const FORMS = ['devis', 'partenaire', 'recrutement'];
const MAX_FILE = 6 * 1024 * 1024; // 5 Mo annoncés au candidat, un peu de marge

/** Liste d'adresses valides à partir de « a@x.fr, b@y.fr ». */
export const addresses = (v) => String(v || '').split(/[;,]/).map((a) => a.trim()).filter(isEmail);

/** Fichiers déposés dans le formulaire : valeurs de `data` qui ressemblent à { url, filename, size, type }. */
export const filesOf = (data) =>
  Object.entries(data || {})
    .filter(([, v]) => v && typeof v === 'object' && typeof v.url === 'string')
    .map(([field, v]) => ({ field, url: v.url, filename: v.filename || v.name || 'cv', size: Number(v.size) || 0, type: v.type || 'application/octet-stream' }));

/** Nom de fichier sûr pour une pièce jointe. */
const safeName = (n) => String(n).replace(/[^\w.\- ()àâçéèêëîïôûùüÿ]/gi, '_').slice(0, 120) || 'cv';

export function makeHandler(deps = {}) {
  const createTransport = deps.createTransport || ((o) => nodemailer.createTransport(o));
  const http = deps.fetch || globalThis.fetch;

  return async (event) => {
    let payload;
    try {
      payload = JSON.parse(event.body || '{}').payload;
    } catch {
      return { statusCode: 400, body: 'Corps invalide' };
    }
    if (!payload || !FORMS.includes(payload.form_name)) return { statusCode: 200, body: 'Formulaire ignoré' };

    const env = deps.env || process.env;
    const { SMTP_HOST, SMTP_PORT = '465', SMTP_USER, SMTP_PASS, MAIL_FROM_NAME = 'CarSitting', NETLIFY_ACCESS_TOKEN } = env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      console.error('Variables SMTP manquantes : aucun mail envoyé (la demande reste dans Netlify > Forms).');
      return { statusCode: 200, body: 'SMTP non configuré' };
    }

    const recruit = payload.form_name === 'recrutement';
    // Les candidatures vont à l'adresse dédiée ; les devis et partenariats à l'adresse de réception habituelle.
    const recipients = addresses(recruit ? env.MAIL_TO_RECRUTEMENT || 'recrutement@carsitting.fr' : env.MAIL_TO || SMTP_USER);
    const shownFrom = (recruit && env.MAIL_FROM_RECRUTEMENT) || env.MAIL_FROM || SMTP_USER;
    const from = `"${oneLine(MAIL_FROM_NAME).replace(/"/g, '')}" <${isEmail(shownFrom) ? shownFrom : SMTP_USER}>`;
    const replyToVisitors = recipients[0] || SMTP_USER;
    const visitor = payload.data?.Email;

    const transporter = createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: Number(SMTP_PORT) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
    const authHeaders = NETLIFY_ACCESS_TOKEN ? { Authorization: `Bearer ${NETLIFY_ACCESS_TOKEN}` } : {};

    // CV : téléchargé depuis Netlify pour être joint au mail.
    const attachments = [];
    let attachmentsComplete = true;
    for (const f of filesOf(payload.data)) {
      try {
        if (f.size > MAX_FILE) throw new Error('fichier trop lourd');
        const res = await http(f.url, { headers: authHeaders });
        if (!res.ok) throw new Error(`téléchargement ${res.status}`);
        const content = Buffer.from(await res.arrayBuffer());
        if (content.length > MAX_FILE) throw new Error('fichier trop lourd');
        attachments.push({ filename: safeName(f.filename), content, contentType: f.type });
      } catch (e) {
        attachmentsComplete = false;
        console.error(`CV non joint (${f.filename}) :`, e.message);
      }
    }

    try {
      const team = teamMail(payload, { attached: attachments.map((a) => a.filename), missing: !attachmentsComplete });
      await transporter.sendMail({
        from,
        envelope: { from: SMTP_USER, to: recipients },
        to: recipients,
        replyTo: isEmail(visitor) ? visitor.trim() : undefined,
        subject: team.subject,
        html: team.html,
        text: team.text,
        attachments,
      });

      // Accusé de réception : seulement si l'adresse du visiteur est valide ; un échec ici ne bloque pas le reste.
      if (isEmail(visitor)) {
        const ack = visitorMail(payload);
        await transporter
          .sendMail({ from, envelope: { from: SMTP_USER, to: [visitor.trim()] }, to: visitor.trim(), replyTo: replyToVisitors, subject: ack.subject, html: ack.html, text: ack.text })
          .catch((e) => console.error('Accusé non envoyé :', e.message));
      }

      // Candidature : une fois le mail (avec son CV) parti, on supprime la candidature de Netlify (données + fichier).
      // On ne supprime rien si une pièce jointe manque ou si le jeton est absent.
      if (recruit && NETLIFY_ACCESS_TOKEN && attachmentsComplete && payload.id) {
        const del = await http(`https://api.netlify.com/api/v1/submissions/${encodeURIComponent(payload.id)}`, { method: 'DELETE', headers: authHeaders }).catch((e) => ({ ok: false, status: e.message }));
        if (!del.ok) console.error('Candidature non supprimée de Netlify :', del.status);
      } else if (recruit) {
        console.error('Candidature conservée dans Netlify > Forms (jeton absent ou CV non joint) : à supprimer à la main après 2 ans.');
      }
      return { statusCode: 200, body: 'Mails envoyés' };
    } catch (e) {
      console.error('Envoi impossible :', e.message);
      return { statusCode: 500, body: 'Envoi impossible' };
    }
  };
}

export const handler = makeHandler();
