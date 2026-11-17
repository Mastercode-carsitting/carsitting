// Test de la fonction d'envoi des mails avec de FAUX serveurs (aucun mail réel, aucun appel à Netlify).
// Usage : node scripts/test-fonction-mails.mjs
import nodemailer from 'nodemailer';
import { makeHandler, addresses, filesOf } from '../netlify/functions/submission-created.mjs';

let echecs = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK     ' : 'ÉCHEC  ') + msg); if (!cond) echecs++; };

// Faux transport : garde les messages au lieu de les envoyer.
const envoyes = [];
const createTransport = () => ({ sendMail: async (m) => { envoyes.push(m); return {}; } });
// Faux réseau : télécharge un « PDF » et enregistre les suppressions.
const appels = [];
const faussePage = (reponses) => async (url, opts = {}) => { appels.push({ url, method: opts.method || 'GET', auth: opts.headers?.Authorization }); const r = reponses(url, opts); return r; };
const pdf = Buffer.from('%PDF-1.4 faux cv');
const reseauOk = faussePage((url, o) => o.method === 'DELETE' ? { ok: true, status: 204 } : { ok: true, status: 200, arrayBuffer: async () => pdf });

const env = { SMTP_HOST: 'smtp.test', SMTP_USER: 'hostmaster@carsitting.fr', SMTP_PASS: 'x', MAIL_TO: 'contact@carsitting.fr, autre@carsitting.fr', MAIL_FROM: 'contact@carsitting.fr', MAIL_FROM_RECRUTEMENT: 'recrutement@carsitting.fr', NETLIFY_ACCESS_TOKEN: 'jeton-test' };
const candidature = (extra = {}) => ({ body: JSON.stringify({ payload: { id: 'sub123', form_name: 'recrutement', data: { subject: 'Candidature — Karim Benali', Prénom: 'Karim', Nom: 'Benali', Email: 'karim@exemple.fr', CV: { url: 'https://api.netlify.com/f/cv.pdf', filename: 'CV Karim.pdf', size: 1200, type: 'application/pdf' }, ...extra } } }) });

console.log('addresses :', JSON.stringify(addresses('a@x.fr, b@y.fr; pas-une-adresse')), '| fichiers :', filesOf(JSON.parse(candidature().body).payload.data).length);

// 1) candidature complète : mail avec CV, accusé, suppression
{
  envoyes.length = 0; appels.length = 0;
  const r = await makeHandler({ createTransport, fetch: reseauOk, env })(candidature());
  ok(r.statusCode === 200, 'candidature : réponse 200');
  ok(envoyes.length === 2, 'candidature : 2 mails (équipe + accusé)');
  const [equipe, accuse] = envoyes;
  ok(equipe.to.join() === 'recrutement@carsitting.fr', 'candidature : destinataire = recrutement@ par défaut');
  ok(equipe.attachments.length === 1 && equipe.attachments[0].content.equals(pdf), 'candidature : le CV est joint (contenu identique)');
  ok(equipe.attachments[0].filename === 'CV Karim.pdf', 'candidature : nom du fichier conservé');
  ok(/recrutement@carsitting\.fr/.test(equipe.from) && equipe.envelope.from === 'hostmaster@carsitting.fr', 'candidature : expéditeur affiché recrutement@, envoi par hostmaster@');
  ok(equipe.replyTo === 'karim@exemple.fr', 'candidature : « répondre » vers le candidat');
  ok(/CV joint/.test(equipe.html) && !/object Object/.test(equipe.html), 'candidature : le mail annonce le CV joint, sans champ brut');
  ok(accuse.to === 'karim@exemple.fr' && /recrutement@carsitting\.fr/.test(accuse.replyTo), 'accusé : envoyé au candidat, réponses vers recrutement@');
  ok(!/répondez/i.test(accuse.html), 'accusé : ne demande plus d\'envoyer le CV par mail');
  const suppr = appels.find((a) => a.method === 'DELETE');
  ok(suppr && suppr.url.endsWith('/submissions/sub123') && suppr.auth === 'Bearer jeton-test', 'candidature : supprimée de Netlify après envoi (avec le jeton)');
  ok(appels.find((a) => a.method === 'GET')?.auth === 'Bearer jeton-test', 'CV : téléchargé avec le jeton');
}
// 2) téléchargement du CV impossible : mail envoyé avec avertissement, RIEN supprimé
{
  envoyes.length = 0; appels.length = 0;
  const reseauKo = faussePage((u, o) => o.method === 'DELETE' ? { ok: true, status: 204 } : { ok: false, status: 403 });
  await makeHandler({ createTransport, fetch: reseauKo, env })(candidature());
  ok(envoyes[0]?.attachments.length === 0 && /pas pu être joint/.test(envoyes[0].html), 'CV introuvable : mail envoyé avec avertissement');
  ok(!appels.some((a) => a.method === 'DELETE'), 'CV introuvable : candidature NON supprimée');
}
// 3) pas de jeton : mail envoyé, rien supprimé
{
  envoyes.length = 0; appels.length = 0;
  const { NETLIFY_ACCESS_TOKEN, ...sansJeton } = env;
  await makeHandler({ createTransport, fetch: reseauOk, env: sansJeton })(candidature());
  ok(envoyes.length === 2 && !appels.some((a) => a.method === 'DELETE'), 'sans jeton : mails envoyés, aucune suppression');
}
// 4) envoi du mail en échec : rien supprimé, réponse 500
{
  envoyes.length = 0; appels.length = 0;
  const transportKo = () => ({ sendMail: async () => { throw new Error('SMTP refusé'); } });
  const r = await makeHandler({ createTransport: transportKo, fetch: reseauOk, env })(candidature());
  ok(r.statusCode === 500 && !appels.some((a) => a.method === 'DELETE'), 'SMTP en échec : réponse 500, candidature NON supprimée');
}
// 5) devis : pas de suppression, destinataires multiples, expéditeur contact@
{
  envoyes.length = 0; appels.length = 0;
  await makeHandler({ createTransport, fetch: reseauOk, env })({ body: JSON.stringify({ payload: { id: 'sub9', form_name: 'devis', data: { Email: 'client@exemple.fr', 'Nom et prénom': 'Camille Martin' } } }) });
  ok(envoyes[0].to.join() === 'contact@carsitting.fr,autre@carsitting.fr', 'devis : deux destinataires');
  ok(/contact@carsitting\.fr/.test(envoyes[0].from), 'devis : expéditeur affiché contact@');
  ok(!appels.some((a) => a.method === 'DELETE'), 'devis : jamais supprimé de Netlify');
}
// 6) contenu malveillant : échappé
{
  envoyes.length = 0;
  await makeHandler({ createTransport, fetch: reseauOk, env })(candidature({ Message: '<script>alert(1)</script>' }));
  ok(!/<script>/.test(envoyes[0].html), 'sécurité : le HTML saisi par le candidat est neutralisé');
}
console.log(echecs ? `\n${echecs} échec(s)` : '\nTous les tests passent');
process.exit(echecs ? 1 : 0);
