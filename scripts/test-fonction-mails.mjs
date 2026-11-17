// Test des fonctions d'envoi des mails avec de FAUX serveurs (aucun mail réel, aucun appel à Netlify).
// Usage : node scripts/test-fonction-mails.mjs
import { makeHandler as devisHandler } from '../netlify/functions/submission-created.mjs';
import { makeHandler as candidatureHandler, parseMultipart, MAX_CV } from '../netlify/functions/candidature.mjs';
import { addresses } from '../netlify/functions/lib/mailer.mjs';

let echecs = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK     ' : 'ÉCHEC  ') + msg); if (!cond) echecs++; };

// Faux transport : garde les messages au lieu de les envoyer.
const envoyes = [];
const createTransport = () => ({ sendMail: async (m) => { envoyes.push(m); return {}; } });
const env = { SMTP_HOST: 'smtp.test', SMTP_USER: 'hostmaster@carsitting.fr', SMTP_PASS: 'x', MAIL_TO: 'contact@carsitting.fr, autre@carsitting.fr', MAIL_FROM: 'contact@carsitting.fr', MAIL_FROM_RECRUTEMENT: 'recrutement@carsitting.fr' };

// Construit un corps « multipart/form-data » comme le fait le navigateur (noms accentués en UTF-8).
function multipart(fields, file, headers = {}) {
  const boundary = '----CarSittingTest' + Math.random().toString(16).slice(2);
  const parts = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`, 'utf8'));
  if (file) parts.push(Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.field || 'CV'}"; filename="${file.filename}"\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`, 'utf8'), file.content, Buffer.from('\r\n')]));
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { httpMethod: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, origin: 'https://carsitting.fr', ...headers }, body: Buffer.concat(parts).toString('base64'), isBase64Encoded: true };
}
const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('faux cv de test')]);
const champs = (extra = {}) => ({
  subject: 'Candidature — Karim Benali', Prénom: 'Karim', Nom: 'Benali', Email: 'karim@exemple.fr', Téléphone: '06 11 22 33 44', 'Ville de résidence': 'Saint-Denis',
  'Permis B en cours de validité': 'Oui', 'Permis B depuis le': '12/05/2016', 'Conduite quotidienne': 'Oui, tous les jours', 'Déjà voiturier': 'Oui', 'Statut professionnel': 'Salarié',
  Disponibilités: 'En soirée, Week-ends', 'Consentement (conservation 2 ans)': 'Oui',
  _t: String(Date.now() - 20000), _n: String(Date.now()), ...extra,
});
const cv = (extra = {}) => ({ field: 'CV', filename: 'CV Karim Bénali.pdf', type: 'application/pdf', content: pdf, ...extra });
const lancer = (event, e = env, t = createTransport) => candidatureHandler({ env: e, createTransport: t })(event);

console.log('addresses :', JSON.stringify(addresses('a@x.fr, b@y.fr; pas-une-adresse')), '| taille max CV :', MAX_CV / 1024 / 1024, 'Mo\n');

// 1) candidature complète
{
  envoyes.length = 0;
  const r = await lancer(multipart(champs(), cv()));
  ok(r.statusCode === 200 && JSON.parse(r.body).ok, 'candidature : réponse 200 { ok: true }');
  ok(envoyes.length === 2, 'candidature : 2 mails (équipe + accusé)');
  const [equipe, accuse] = envoyes;
  ok(equipe.to.join() === 'recrutement@carsitting.fr', 'candidature : destinataire = recrutement@ par défaut');
  ok(equipe.attachments?.length === 1 && equipe.attachments[0].content.equals(pdf), 'candidature : le CV est joint (contenu identique)');
  ok(equipe.attachments[0].filename === 'CV Karim Bénali.pdf', 'candidature : nom du fichier avec accents conservé');
  ok(/recrutement@carsitting\.fr/.test(equipe.from) && equipe.envelope.from === 'hostmaster@carsitting.fr', 'candidature : expéditeur affiché recrutement@, envoi par hostmaster@');
  ok(equipe.replyTo === 'karim@exemple.fr', 'candidature : « répondre » vers le candidat');
  ok(/Karim/.test(equipe.html) && /Saint-Denis/.test(equipe.html) && /CV joint/.test(equipe.html), 'candidature : champs accentués lus (Prénom, Ville…) et CV annoncé');
  ok(equipe.subject === 'Candidature — Karim Benali', 'candidature : objet du mail');
  ok(accuse.to === 'karim@exemple.fr' && /recrutement@carsitting\.fr/.test(accuse.replyTo) && !/répondez/i.test(accuse.html), 'accusé : envoyé au candidat, sans demande de CV');
}
// 2) refus : fichier invalide
for (const [nom, fichier] of [
  ['sans CV', null],
  ['mauvaise extension (.png)', cv({ filename: 'photo.png', type: 'image/png' })],
  ['faux PDF (exécutable renommé)', cv({ filename: 'cv.pdf', content: Buffer.from('MZ\x90\x00programme') })],
  ['CV trop lourd', cv({ content: Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(MAX_CV + 10)]) })],
  ['fichier vide', cv({ content: Buffer.alloc(0) })],
]) {
  envoyes.length = 0;
  const r = await lancer(multipart(champs(), fichier));
  ok(r.statusCode === 400 && envoyes.length === 0, `refus : ${nom} -> 400, aucun mail`);
}
// 3) refus : champs
{
  envoyes.length = 0;
  const { Disponibilités, ...sans } = champs();
  let r = await lancer(multipart(sans, cv()));
  ok(r.statusCode === 400 && !envoyes.length, 'refus : champ obligatoire manquant -> 400');
  r = await lancer(multipart(champs({ 'Consentement (conservation 2 ans)': '' }), cv()));
  ok(r.statusCode === 400 && !envoyes.length, 'refus : consentement absent -> 400');
  r = await lancer(multipart(champs({ Email: 'pas-un-mail' }), cv()));
  ok(r.statusCode === 400 && !envoyes.length, 'refus : adresse e-mail invalide -> 400');
}
// 3 bis) anti-spam : provenance et délai
{
  envoyes.length = 0;
  let r = await lancer(multipart(champs(), cv(), { origin: 'https://site-pirate.example' }));
  ok(r.statusCode === 403 && !envoyes.length, 'provenance : site étranger -> 403, aucun mail');
  r = await lancer(multipart(champs(), cv(), { origin: undefined }));
  ok(r.statusCode === 403 && !envoyes.length, 'provenance : sans en-tête Origin -> 403');
  r = await lancer(multipart(champs(), cv(), { origin: undefined, referer: 'https://carsitting.fr/recrutement/' }));
  ok(r.statusCode === 200 && envoyes.length === 2, "provenance : Referer du site accepté à défaut d'Origin");
  envoyes.length = 0;
  r = await lancer(multipart(champs(), cv(), { origin: 'https://starlit-banoffee-801f87.netlify.app' }), { ...env, URL: 'https://starlit-banoffee-801f87.netlify.app' });
  ok(r.statusCode === 200, 'provenance : adresse Netlify du projet (variable URL) acceptée');
  envoyes.length = 0;
  r = await lancer(multipart(champs({ _t: String(Date.now() - 500), _n: String(Date.now()) }), cv()));
  ok(r.statusCode === 400 && !envoyes.length, 'délai : envoi en 0,5 s (robot) -> refusé');
  r = await lancer(multipart(champs({ _t: String(Date.now() - 3 * 86400000), _n: String(Date.now()) }), cv()));
  ok(r.statusCode === 400 && !envoyes.length, 'délai : page ouverte depuis 3 jours -> refusé');
  const { _t, _n, ...sansHeure } = champs();
  r = await lancer(multipart(sansHeure, cv()));
  ok(r.statusCode === 400 && !envoyes.length, 'délai : horodatages absents (envoi direct à la fonction) -> refusé');
  r = await lancer(multipart(champs({ _t: String(Date.now() - 20000), _n: String(Date.now() - 5 * 86400000) }), cv()));
  ok(r.statusCode === 400 && !envoyes.length, "délai : date d'envoi falsifiée très ancienne -> refusé");
}
// 4) piège anti-spam : réponse « ok » mais rien d'envoyé
{
  envoyes.length = 0;
  const r = await lancer(multipart(champs({ _gotcha: 'je suis un robot' }), cv()));
  ok(r.statusCode === 200 && envoyes.length === 0, 'anti-spam : champ piège rempli -> aucun mail');
}
// 5) SMTP absent ou en échec
{
  envoyes.length = 0;
  const { SMTP_PASS, ...sansMdp } = env;
  let r = await lancer(multipart(champs(), cv()), sansMdp);
  ok(r.statusCode === 500, 'SMTP non configuré -> 500 (le candidat voit l\'erreur)');
  r = await lancer(multipart(champs(), cv()), env, () => ({ sendMail: async () => { throw new Error('SMTP refusé'); } }));
  ok(r.statusCode === 500 && !JSON.parse(r.body).ok, 'SMTP en échec -> 500 (le candidat peut réessayer)');
}
// 6) méthode et sécurité
{
  envoyes.length = 0;
  ok((await lancer({ httpMethod: 'GET', headers: {} })).statusCode === 405, 'méthode GET -> 405');
  ok((await lancer({ httpMethod: 'POST', headers: { 'content-type': 'application/json', origin: 'https://carsitting.fr' }, body: '{}' })).statusCode === 400, 'corps non multipart -> 400');
  await lancer(multipart(champs({ Message: '<script>alert(1)</script>' }), cv()));
  ok(envoyes.length && !/<script>/.test(envoyes[0].html), 'sécurité : le HTML saisi par le candidat est neutralisé');
}
// 7) devis et partenariat (Netlify Forms) : inchangés, jamais de CV
{
  envoyes.length = 0;
  const h = devisHandler({ env, createTransport });
  const corps = (form_name) => ({ body: JSON.stringify({ payload: { id: 's1', form_name, data: { Email: 'client@exemple.fr', 'Nom et prénom': 'Camille Martin' } } }) });
  await h(corps('devis'));
  ok(envoyes[0].to.join() === 'contact@carsitting.fr,autre@carsitting.fr' && /contact@carsitting\.fr/.test(envoyes[0].from), 'devis : deux destinataires, expéditeur contact@');
  envoyes.length = 0;
  const r = await h(corps('recrutement'));
  ok(r.statusCode === 200 && envoyes.length === 0, 'recrutement : ignoré par la fonction Netlify Forms (traité par « candidature »)');
}
console.log(echecs ? `\n${echecs} échec(s)` : '\nTous les tests passent');
process.exit(echecs ? 1 : 0);
