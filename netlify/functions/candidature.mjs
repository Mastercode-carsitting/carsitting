// Candidatures (page /recrutement) : le formulaire envoie ici directement, CV compris, SANS passer par Netlify Forms.
// La fonction lit le CV en mémoire, l'attache au mail envoyé à recrutement@, envoie l'accusé de réception au candidat,
// et ne conserve rien : les données ne vivent que dans la boîte de réception (durée annoncée : 2 ans maximum).
// Si le mail ne part pas, la fonction répond par une erreur et le candidat en est informé (il peut réessayer).
//
// Anti-spam (sans service tiers) : champ piège invisible, contrôle de provenance (la requête doit venir du site) et délai
// minimum entre l'affichage du formulaire et son envoi (un robot envoie instantanément).
//
// Limites : corps de requête de 6 Mo chez Netlify (base64 compris) : CV de 4 Mo maximum (PDF, DOC ou DOCX).
// Variables d'environnement : voir lib/mailer.mjs.
import busboy from 'busboy';
import { teamMail, visitorMail, isEmail } from './lib/mail-templates.mjs';
import { mailContext, safeName } from './lib/mailer.mjs';

export const MAX_CV = 4 * 1024 * 1024;
const MIN_DELAY = 4000; // ms : en dessous, ce n'est pas un humain
const MAX_DELAY = 24 * 60 * 60 * 1000; // page ouverte depuis plus d'un jour : à recharger


// Champs obligatoires du formulaire (mêmes noms que dans src/views/Recruit.astro).
const REQUIRED = ['Prénom', 'Nom', 'Email', 'Téléphone', 'Ville de résidence', 'Permis B en cours de validité', 'Permis B depuis le', 'Conduite quotidienne', 'Déjà voiturier', 'Statut professionnel', 'Disponibilités', 'Consentement (conservation 2 ans)'];
const IGNORED = new Set(['_gotcha', '_t', '_n', 'form-name', 'bot-field']);

/** Lit un corps « multipart/form-data » (champs + au plus un fichier) tel que transmis par Netlify. */
export function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const type = event.headers?.['content-type'] || event.headers?.['Content-Type'] || '';
    if (!/multipart\/form-data/i.test(type)) return reject(new Error('format'));
    const fields = {};
    let file = null;
    // utf8 : les noms de champs (« Prénom ») et de fichiers contiennent des accents.
    const bb = busboy({ headers: { 'content-type': type }, defParamCharset: 'utf8', limits: { fileSize: MAX_CV, files: 1, fields: 60, fieldSize: 20000, parts: 80 } });
    bb.on('field', (name, value) => { fields[name] = value; });
    bb.on('file', (name, stream, info) => {
      const chunks = [];
      let truncated = false;
      stream.on('data', (d) => chunks.push(d));
      stream.on('limit', () => { truncated = true; });
      stream.on('end', () => { file = { field: name, filename: info.filename || '', type: info.mimeType, content: Buffer.concat(chunks), truncated }; });
    });
    bb.on('error', reject);
    bb.on('close', () => resolve({ fields, file }));
    bb.end(Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8'));
  });
}

/** Sites autorisés à envoyer une candidature : le domaine du site et les adresses Netlify de ce projet. */
export function allowedHosts(env) {
  const hosts = ['carsitting.fr', 'www.carsitting.fr'];
  for (const u of [env.URL, env.DEPLOY_PRIME_URL, env.DEPLOY_URL, ...String(env.ALLOWED_ORIGINS || '').split(',')]) {
    try { if (u && u.trim()) hosts.push(new URL(u.includes('://') ? u.trim() : `https://${u.trim()}`).hostname); } catch { /* adresse invalide : ignorée */ }
  }
  return hosts;
}

/** La requête doit venir d'une page du site (en-tête Origin, ou Referer à défaut) : les navigateurs l'envoient toujours. */
export function originAllowed(headers, env) {
  const raw = headers?.origin || headers?.Origin || headers?.referer || headers?.Referer || '';
  try { return allowedHosts(env).includes(new URL(raw).hostname); } catch { return false; }
}

/** Délai entre l'affichage du formulaire (_t) et son envoi (_n), mesuré sur l'horloge du visiteur ; _n doit aussi être récent. */
export function humanTiming(fields, now = Date.now()) {
  const t = Number(fields._t);
  const n = Number(fields._n);
  if (!Number.isFinite(t) || !Number.isFinite(n)) return false;
  return n - t >= MIN_DELAY && n - t <= MAX_DELAY && Math.abs(now - n) <= 2 * MAX_DELAY;
}

/** Le contenu doit correspondre à l'extension : un fichier renommé (ex. .exe en .pdf) est refusé. */
export function validCv(file) {
  if (!file || !file.content.length || file.truncated || file.content.length > MAX_CV) return false;
  const ext = (file.filename.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
  const head = file.content.subarray(0, 8);
  if (ext === 'pdf') return head.subarray(0, 4).toString('latin1') === '%PDF';
  if (ext === 'docx') return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04; // zip « PK »
  if (ext === 'doc') return head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0; // OLE
  return false;
}

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function makeHandler(deps = {}) {
  return async (event) => {
    if (event.httpMethod && event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method' });

    const env = deps.env || process.env;
    // Provenance : seule une page du site peut envoyer une candidature.
    if (!originAllowed(event.headers, env)) return json(403, { ok: false, error: 'origin' });

    let parsed;
    try {
      parsed = await parseMultipart(event);
    } catch {
      return json(400, { ok: false, error: 'format' });
    }
    const { fields, file } = parsed;

    // Piège anti-spam : un robot remplit le champ invisible. On répond « ok » sans rien envoyer.
    if ((fields._gotcha || '').trim()) return json(200, { ok: true });

    // Délai : un envoi quasi instantané (ou d'une page très ancienne) est refusé.
    if (!humanTiming(fields, deps.now ? deps.now() : Date.now())) return json(400, { ok: false, error: 'timing' });

    const missing = REQUIRED.filter((n) => !String(fields[n] || '').trim());
    if (missing.length || !isEmail(fields.Email) || !validCv(file)) return json(400, { ok: false, error: 'validation' });

    const mail = mailContext(env, 'recrutement', deps.createTransport);
    if (!mail) {
      console.error('Variables SMTP manquantes : candidature non envoyée.');
      return json(500, { ok: false, error: 'config' });
    }

    const data = Object.fromEntries(Object.entries(fields).filter(([k, v]) => !IGNORED.has(k) && String(v).trim() !== ''));
    const payload = { form_name: 'recrutement', data };
    const attachment = { filename: safeName(file.filename), content: file.content, contentType: file.type };

    try {
      const team = teamMail(payload, { attached: [attachment.filename] });
      await mail.sendToTeam({ replyTo: fields.Email.trim(), subject: team.subject, html: team.html, text: team.text, attachments: [attachment] });
      const ack = visitorMail(payload);
      await mail.sendToVisitor(fields.Email.trim(), { subject: ack.subject, html: ack.html, text: ack.text }).catch((e) => console.error('Accusé non envoyé :', e.message));
      return json(200, { ok: true });
    } catch (e) {
      console.error('Candidature non envoyée :', e.message);
      return json(500, { ok: false, error: 'send' });
    }
  };
}

export const handler = makeHandler();
