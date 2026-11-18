// Mails des formulaires CarSitting, à la charte (bleu nuit, ivoire, or patiné).
// Pur et sans dépendance : testable seul (voir scripts/apercu-mails.mjs).
// Les mails ne peuvent pas charger Cormorant Garamond ni Jost : on reste sur Georgia (titres) et Arial (texte).

const NUIT = '#1B2340';
const NUIT_PROFOND = '#121930';
const IVOIRE = '#F5F1E9';
const OR = '#A98B54';
const ENCRE = '#1A1A1A';
const SITE = (typeof process !== 'undefined' && process.env.SITE_URL) || 'https://carsitting.fr';
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Arial, Helvetica, sans-serif";

/** Échappe le HTML : le contenu d'un formulaire n'est jamais une source de confiance. */
export const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Une seule ligne, sans retour chariot : indispensable pour les objets et les en-têtes de mail. */
export const oneLine = (v) => String(v ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);

export const isEmail = (v) => /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[^\s@<>"',;:]{2,}$/.test(String(v ?? '').trim());

// Champs techniques de Netlify ou de nos formulaires : jamais affichés dans le mail.
const HIDDEN = new Set(['form-name', 'subject', '_gotcha', 'bot-field', 'ip', 'user_agent', 'referrer', 'Langue du visiteur']);

/** Champs à afficher, dans l'ordre du formulaire. */
export function fieldsOf(payload) {
  const ordered = Array.isArray(payload?.ordered_human_fields)
    ? payload.ordered_human_fields.map((f) => [f.title || f.name, f.value, f.name])
    : Object.entries(payload?.data || {}).map(([k, v]) => [k, v, k]);
  // Un fichier déposé (objet { url, filename… }) n'est pas un champ de texte : il apparaît dans les pièces jointes.
  return ordered.filter(([, v, name]) => v !== '' && v != null && typeof v !== 'object' && !HIDDEN.has(name));
}

export const isEnglish = (payload) => /^anglais/i.test(String(payload?.data?.['Langue du visiteur'] || ''));

const wrap = (inner, preheader) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${IVOIRE};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${IVOIRE};">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #E4DCCB;">
    <tr><td align="center" style="background:${NUIT};padding:30px 24px 26px;border-bottom:3px solid ${OR};">
      <img src="${SITE}/brand/logo-empile-ivoire.png" width="150" alt="CAR SITTING" style="display:block;width:150px;height:auto;border:0;margin:0 auto;color:${IVOIRE};font-family:${SERIF};font-size:20px;letter-spacing:4px;">
    </td></tr>
    ${inner}
    <tr><td align="center" style="background:${NUIT_PROFOND};padding:22px 24px;">
      <p style="margin:0 0 6px;font-family:${SERIF};font-style:italic;font-size:16px;color:${IVOIRE};">La juste impression, à chaque fois.</p>
      <p style="margin:0;font-family:${SANS};font-size:11px;line-height:1.7;letter-spacing:1px;color:#B9B2A2;">CARSITTING SAS · 14 rue Charles V, 75004 Paris<br>07 83 93 83 18 · <a href="${SITE}" style="color:${OR};text-decoration:none;">carsitting.fr</a></p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;

/** Mail pour l'équipe : la demande, lisible d'un coup d'œil. */
/** `opts.attached` : noms des fichiers joints au mail ; `opts.missing` : un fichier n'a pas pu être joint. */
export function teamMail(payload, opts = {}) {
  const d = payload?.data || {};
  const english = isEnglish(payload);
  const kind = { partenaire: 'Devenir partenaire', recrutement: 'Candidature voiturier' }[payload?.form_name] || 'Demande de devis';
  const rows = fieldsOf(payload)
    .map(
      ([label, value]) => `<tr><td style="padding:14px 0;border-bottom:1px solid #EEE7D8;">
        <div style="font-family:${SANS};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${OR};padding-bottom:5px;">${esc(label)}</div>
        <div style="font-family:${SANS};font-size:15px;line-height:1.6;color:${ENCRE};white-space:pre-wrap;">${esc(value)}</div>
      </td></tr>`,
    )
    .join('');
  const attached = opts.attached || [];
  const attachedBlock = attached.length || opts.missing
    ? `<tr><td style="padding:6px 36px 0;"><div style="margin-top:8px;padding:12px 14px;background:${IVOIRE};border-left:3px solid ${OR};font-family:${SANS};font-size:13px;line-height:1.6;color:${ENCRE};">${attached.length ? `<b>CV joint à ce mail :</b> ${attached.map(esc).join(', ')}` : ''}${opts.missing ? `${attached.length ? '<br>' : ''}<b style="color:#9b2c2c;">Le CV n'a pas pu être joint automatiquement.</b> La candidature est conservée dans Netlify (Forms) : le fichier s'y trouve.` : ''}</div></td></tr>`
    : '';
  const who = oneLine(d['Nom et prénom'] || d['Établissement'] || [d['Prénom'], d['Nom']].filter(Boolean).join(' ') || d['Email'] || '');
  const inner = `<tr><td style="padding:34px 36px 10px;">
      <div style="font-family:${SANS};font-size:10px;letter-spacing:3px;text-transform:uppercase;color:${OR};">Nouvelle demande · carsitting.fr</div>
      <h1 style="margin:10px 0 0;font-family:${SERIF};font-weight:normal;font-size:30px;line-height:1.2;color:${NUIT};">${esc(kind)}</h1>
      ${who ? `<p style="margin:8px 0 0;font-family:${SERIF};font-style:italic;font-size:17px;color:#5B5B5B;">${esc(who)}</p>` : ''}
      ${english ? `<p style="margin:14px 0 0;padding:8px 12px;background:${IVOIRE};border-left:3px solid ${OR};font-family:${SANS};font-size:13px;color:${ENCRE};">Visiteur de la version anglaise : répondre en anglais.</p>` : ''}
    </td></tr>
    <tr><td style="padding:6px 36px 6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
    ${attachedBlock}
    <tr><td style="padding:16px 36px 34px;font-family:${SANS};font-size:13px;line-height:1.6;color:#6B6B6B;">
      ${isEmail(d['Email']) ? `Répondez directement à ce mail : la réponse part vers <b style="color:${NUIT};">${esc(d['Email'])}</b>.` : ''}
    </td></tr>`;
  const text =
    `${kind}${who ? ' — ' + who : ''}\n${english ? '(Visiteur anglophone : répondre en anglais)\n' : ''}\n` +
    fieldsOf(payload).map(([l, v]) => `${l} : ${v}`).join('\n') + '\n' + (attached.length ? `\nCV joint : ${attached.join(', ')}\n` : '') + (opts.missing ? "\nLe CV n'a pas pu être joint automatiquement : voir Netlify > Forms.\n" : '');
  return { subject: oneLine(d.subject) || `${kind}${who ? ' — ' + who : ''}`, html: wrap(inner, `${kind} · ${who}`), text };
}

/** Accusé de réception pour le visiteur, dans sa langue. */
export function visitorMail(payload) {
  const english = isEnglish(payload);
  const partner = payload?.form_name === 'partenaire';
  const recruit = payload?.form_name === 'recrutement';
  const t = english
    ? {
        subject: recruit ? 'We have received your application — CarSitting' : 'We have received your request — CarSitting',
        label: recruit ? 'Application' : partner ? 'Partnership' : 'Quote request',
        title: 'Thank you.',
        body: recruit
          ? 'Your application and CV have been received. We read every application carefully and will come back to you if your profile fits. Your details are kept for 2 years at most.'
          : 'Your request has been received. We will reply within two working days, with a clear proposal and no obligation.',
        sign: 'The CarSitting team',
        lang: 'en',
      }
    : {
        subject: recruit ? 'Votre candidature a bien été reçue — CarSitting' : 'Votre demande a bien été reçue — CarSitting',
        label: recruit ? 'Candidature' : partner ? 'Partenariat' : 'Demande de devis',
        title: 'Merci.',
        body: recruit
          ? 'Votre candidature et votre CV ont bien été reçus. Nous lisons chaque candidature avec attention et revenons vers vous si votre profil correspond. Vos informations sont conservées 2 ans au maximum.'
          : 'Votre demande a bien été reçue. Nous vous répondons sous quarante-huit heures ouvrées, avec une proposition précise et sans engagement.',
        sign: "L'équipe CarSitting",
        lang: 'fr',
      };
  const inner = `<tr><td align="center" style="padding:44px 36px 40px;">
      <div style="font-family:${SANS};font-size:10px;letter-spacing:3px;text-transform:uppercase;color:${OR};">${esc(t.label)}</div>
      <h1 style="margin:12px 0 18px;font-family:${SERIF};font-weight:normal;font-size:40px;line-height:1.1;color:${NUIT};">${esc(t.title)}</h1>
      <div style="width:56px;height:1px;background:${OR};margin:0 auto 22px;"></div>
      <p style="margin:0 auto;max-width:420px;font-family:${SERIF};font-size:18px;line-height:1.65;color:${ENCRE};">${esc(t.body)}</p>
      <p style="margin:26px 0 0;font-family:${SERIF};font-style:italic;font-size:17px;color:${OR};">${esc(t.sign)}</p>
    </td></tr>`;
  const html = wrap(inner, t.body).replace('<html lang="fr">', `<html lang="${t.lang}">`);
  return { subject: t.subject, html, text: `${t.title}\n\n${t.body}\n\n${t.sign}\nCARSITTING SAS · 14 rue Charles V, 75004 Paris · 07 83 93 83 18 · ${SITE}\n` };
}
