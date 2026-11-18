// Formulaires CarSitting : parcours conditionnel, validation en français, envoi.
//
// Envoi : Netlify Forms (aucun service tiers) pour les devis et partenariats : la demande est enregistrée dans Netlify > Forms,
// puis netlify/functions/submission-created.mjs envoie les mails à la charte (équipe et accusé de réception).
// Le formulaire de recrutement (data-endpoint) envoie, lui, directement à netlify/functions/candidature.mjs avec le CV, sans rien stocker.
// En développement local (npm run dev), Netlify n'existe pas : le formulaire ouvre alors la messagerie (mailto) pour tester.

const CONTACT = 'contact@carsitting.fr';

// Messages affichés au visiteur, dans la langue de la page. Les demandes reçues restent en français.
const MSG = {
  fr: {
    required: 'Ce champ est requis.', choose: 'Veuillez choisir une option.',
    email: 'Indiquez une adresse email valide (ex. vous@exemple.fr).', tel: 'Indiquez un numéro de téléphone valide (10 chiffres minimum).',
    fileSize: 'Fichier trop lourd (4 Mo maximum).', fileType: 'Format accepté : PDF, DOC ou DOCX.',
    dateMin: (d: string) => `Choisissez une date à partir du ${d}.`, dateMax: (d: string) => `Choisissez une date jusqu'au ${d}.`, min: (n: string) => `La valeur doit être au moins ${n}.`,
    max: (n: string) => `La valeur doit être au plus ${n}.`, integer: 'Indiquez un nombre entier.',
    pending: 'Envoi en cours…', sent: 'Demande transmise',
    fix: (n: number) => `Merci de compléter ${n > 1 ? `les ${n} champs signalés` : 'le champ signalé'}.`,
    thanks: 'Merci, votre demande a bien été transmise.', thanksLong: 'Merci, votre demande a bien été transmise. Nous vous répondons sous 48 heures ouvrées.',
    failed: `L'envoi n'a pas abouti. Réessayez dans un instant ou écrivez-nous à ${CONTACT}.`,
    mailto: `Votre messagerie s'ouvre avec la demande pré-remplie : il ne reste qu'à l'envoyer. Si rien ne s'ouvre, écrivez-nous à ${CONTACT}.`,
  },
  en: {
    required: 'This field is required.', choose: 'Please choose an option.',
    email: 'Please enter a valid email address (e.g. you@example.com).', tel: 'Please enter a valid phone number (at least 10 digits).',
    fileSize: 'File too large (4 MB maximum).', fileType: 'Accepted formats: PDF, DOC or DOCX.',
    dateMin: (d: string) => `Please choose a date from ${d}.`, dateMax: (d: string) => `Please choose a date up to ${d}.`, min: (n: string) => `The value must be at least ${n}.`,
    max: (n: string) => `The value must be at most ${n}.`, integer: 'Please enter a whole number.',
    pending: 'Sending…', sent: 'Request sent',
    fix: (n: number) => `Please complete ${n > 1 ? `the ${n} highlighted fields` : 'the highlighted field'}.`,
    thanks: 'Thank you, your request has been sent.', thanksLong: 'Thank you, your request has been sent. We will reply within two working days.',
    failed: `Your request could not be sent. Please try again shortly or write to us at ${CONTACT}.`,
    mailto: `Your email app is opening with the request pre-filled: just send it. If nothing opens, write to us at ${CONTACT}.`,
  },
};
const msg = () => MSG[document.documentElement.lang === 'en' ? 'en' : 'fr'];

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

// Téléphone : chiffres, espaces, points, tirets, parenthèses et « + » ; 10 à 15 chiffres.
function checkTel(el: Control) {
  if (el.type !== 'tel') return;
  const v = el.value.trim();
  const digits = v.replace(/\D/g, '').length;
  el.setCustomValidity(v && (/[^0-9+ .()-]/.test(v) || digits < 10 || digits > 15) ? 'tel' : '');
}

// CV : PDF, DOC ou DOCX, 4 Mo maximum (limite des fonctions Netlify).
const MAX_FILE = 4 * 1024 * 1024;
function checkFile(el: Control) {
  if (!(el instanceof HTMLInputElement) || el.type !== 'file') return;
  const f = el.files?.[0];
  el.setCustomValidity(!f ? '' : f.size > MAX_FILE ? 'size' : !/\.(pdf|docx?)$/i.test(f.name) ? 'type' : '');
}

const frDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

// Date affichée dans un message : « 15/10/2026 » en français, « 15 October 2026 » en anglais (jj/mm ambigu pour un lecteur américain).
const shownDate = (iso: string) => {
  if (document.documentElement.lang !== 'en') return frDate(iso);
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

function messageFor(el: Control): string {
  const v = el.validity;
  const m = msg();
  if (v.valueMissing) return el instanceof HTMLSelectElement ? m.choose : m.required;
  if (v.typeMismatch && el.type === 'email') return m.email;
  if (v.customError && el.type === 'tel') return m.tel;
  if (v.customError && el.type === 'file') return el.validationMessage === 'size' ? m.fileSize : m.fileType;
  if (v.rangeUnderflow && el.type === 'date') return m.dateMin(shownDate((el as HTMLInputElement).min));
  if (v.rangeOverflow && el.type === 'date') return m.dateMax(shownDate((el as HTMLInputElement).max));
  if (v.rangeUnderflow) return m.min((el as HTMLInputElement).min);
  if (v.rangeOverflow) return m.max((el as HTMLInputElement).max);
  if (v.stepMismatch || v.badInput) return m.integer;
  return el.validationMessage;
}

function controls(form: HTMLFormElement) {
  return [...form.querySelectorAll<Control>('.f-input')];
}

function showError(el: Control) {
  checkTel(el);
  checkFile(el);
  const err = document.getElementById(el.getAttribute('aria-describedby') || '');
  const invalid = !el.disabled && !el.checkValidity();
  el.setAttribute('aria-invalid', String(invalid));
  if (err) err.textContent = invalid ? messageFor(el) : '';
  return invalid;
}

// Active un bloc (fieldset) et le rend visible, ou le désactive : un champ désactivé n'est ni validé ni envoyé.
function toggleBlock(block: HTMLFieldSetElement | null, on: boolean) {
  if (!block) return;
  block.disabled = !on;
  block.hidden = !on;
}

function initParcours(form: HTMLFormElement) {
  const radios = form.querySelectorAll<HTMLInputElement>('input[name="Parcours"]');
  if (!radios.length) return;
  const billingSame = form.querySelector<HTMLInputElement>('[data-billing-same]');
  const billingOther = form.querySelector<HTMLFieldSetElement>('[data-billing-other]');
  const syncBilling = () => {
    const regular = form.querySelector<HTMLFieldSetElement>('[data-branch="Service régulier"]');
    toggleBlock(billingOther, !!billingSame && !billingSame.checked && !regular?.disabled);
  };
  const sync = () => {
    const current = form.querySelector<HTMLInputElement>('input[name="Parcours"]:checked')?.value;
    form.querySelectorAll<HTMLFieldSetElement>('[data-branch]').forEach((b) => toggleBlock(b, b.dataset.branch === current));
    syncBilling();
    // Les erreurs du parcours quitté n'ont plus lieu d'être.
    form.querySelectorAll<HTMLElement>('fieldset:disabled .f-error').forEach((e) => (e.textContent = ''));
  };
  radios.forEach((r) => r.addEventListener('change', sync));
  billingSame?.addEventListener('change', syncBilling);
  sync();
}

// Champs actifs, dans l'ordre du formulaire ; ceux d'un fieldset désactivé (parcours non choisi) sont exclus.
function payload(form: HTMLFormElement) {
  const out: Record<string, string> = {};
  const multi: Record<string, string[]> = {};
  for (const el of [...form.elements] as Control[]) {
    if (!el.name || el.name === '_gotcha' || el.disabled || el.closest('fieldset:disabled')) continue;
    if (el instanceof HTMLInputElement && el.type === 'file') continue; // le fichier est ajouté à part (voir submit)
    // Groupe de cases à cocher : les valeurs cochées sont regroupées sur une seule ligne.
    if (el instanceof HTMLInputElement && el.type === 'checkbox' && el.hasAttribute('data-multi')) {
      if (el.checked) (multi[el.name] ||= []).push(el.value);
      continue;
    }
    if (el instanceof HTMLInputElement && el.type === 'radio' && !el.checked) continue;
    let v = el instanceof HTMLInputElement && el.type === 'checkbox' ? (el.checked ? 'Oui' : 'Non') : el.value.trim();
    if (el.type === 'date') v = frDate(v);
    if (v) out[el.name] = v;
  }
  for (const [name, values] of Object.entries(multi)) out[name] = values.join(', ');
  return out;
}

function setState(form: HTMLFormElement, state: 'idle' | 'pending' | 'success' | 'error', message = '') {
  const btn = form.querySelector<HTMLButtonElement>('.f-submit');
  const text = btn?.querySelector<HTMLElement>('[data-submit-text]');
  const status = form.querySelector<HTMLElement>('[data-status]');
  form.dataset.state = state;
  if (btn && text) {
    btn.disabled = state === 'pending' || state === 'success';
    btn.setAttribute('aria-busy', String(state === 'pending'));
    text.textContent = state === 'pending' ? msg().pending : state === 'success' ? msg().sent : btn.dataset.label || '';
  }
  if (status) status.textContent = message;
}

// Groupes de cases à cocher obligatoires (disponibilités, consentement) : au moins une case cochée.
function invalidGroups(form: HTMLFormElement) {
  return [...form.querySelectorAll<HTMLElement>('fieldset[data-group]')].filter((g) => {
    const missing = g.hasAttribute('data-required') && !g.querySelector<HTMLInputElement>('input:checked');
    const err = g.querySelector<HTMLElement>('.f-error');
    if (err) err.textContent = missing ? g.dataset.error || msg().required : '';
    return missing;
  });
}

async function submit(form: HTMLFormElement) {
  const fields = controls(form);
  const invalid = fields.filter((el) => showError(el));
  const badGroups = invalidGroups(form);
  if (invalid.length || badGroups.length) {
    (invalid[0] ?? badGroups[0].querySelector<HTMLInputElement>('input'))?.focus({ preventScroll: false });
    setState(form, 'error', msg().fix(invalid.length + badGroups.length));
    return;
  }
  // Pot de miel anti-spam : un robot remplit ce champ invisible.
  if ((form.querySelector<HTMLInputElement>('[name="_gotcha"]')?.value || '').trim()) {
    setState(form, 'success', msg().thanks);
    return;
  }

  const data = payload(form);
  // Demande envoyée depuis la version anglaise : on le signale pour répondre dans la bonne langue.
  const english = document.documentElement.lang === 'en';
  if (english) data['Langue du visiteur'] = 'Anglais — répondre en anglais';
  const who = data['Nom et prénom'] || data['Établissement'] || [data['Prénom'], data['Nom']].filter(Boolean).join(' ');
  const subject = [form.dataset.subject, english && 'EN', data['Parcours'], who].filter(Boolean).join(' — ');
  setState(form, 'pending');

  if (!import.meta.env.DEV) {
    try {
      // Envoi encodé comme un formulaire classique, avec le nom du formulaire ; « subject » devient l'objet des mails.
      const fields = { 'form-name': form.getAttribute('name') || '', subject, ...data };
      let res: Response;
      if (form.dataset.endpoint) {
        // Candidature : envoi direct à la fonction, avec le CV (multipart, sans en-tête Content-Type : le navigateur le fixe).
        const body = new FormData();
        Object.entries(fields).forEach(([k, v]) => body.append(k, v));
        // Anti-spam : heure d'affichage et d'envoi (un robot envoie instantanément ; la fonction refuse un délai trop court).
        body.append('_t', form.dataset.loadedAt || String(Date.now()));
        body.append('_n', String(Date.now()));
        form.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach((i) => i.files?.[0] && body.append(i.name, i.files[0]));
        res = await fetch(form.dataset.endpoint, { method: 'POST', body });
      } else {
        res = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });
      }
      if (!res.ok) throw new Error(String(res.status));
      setState(form, 'success', form.dataset.success || msg().thanksLong);
      form.reset();
      form.querySelectorAll<HTMLInputElement>('input[name="Parcours"]')[0]?.dispatchEvent(new Event('change'));
    } catch {
      // En cas d'échec, l'adresse proposée est celle du formulaire (recrutement@ pour les candidatures).
      setState(form, 'error', msg().failed.replace(CONTACT, form.dataset.contact || CONTACT));
    }
    return;
  }

  // Développement local uniquement.
  const body = Object.entries(data).map(([k, v]) => `${k} : ${v}`).join('\n');
  window.location.href = `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  setState(form, 'idle', msg().mailto);
}

export function initForms() {
  document.querySelectorAll<HTMLFormElement>('form[data-form]').forEach((form) => {
    if (form.dataset.ready) return;
    form.dataset.ready = '1';
    form.dataset.loadedAt = String(Date.now());
    form.noValidate = true; // validation prise en charge ici, avec des messages en français sous chaque champ

    // Pas de date passée pour un événement.
    const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    form.querySelectorAll<HTMLInputElement>('input[type="date"]').forEach((d) => (d.hasAttribute('data-past') ? (d.max = today) : (d.min = today)));

    initParcours(form);

    // Après une première tentative, l'erreur se met à jour au fil de la saisie.
    controls(form).forEach((el) => {
      const revalidate = () => el.getAttribute('aria-invalid') === 'true' && showError(el);
      el.addEventListener('input', revalidate);
      el.addEventListener('change', revalidate);
      el.addEventListener('blur', () => el.value && showError(el));
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (form.dataset.state !== 'pending') submit(form);
    });
  });
}
