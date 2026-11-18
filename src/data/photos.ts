// Photos que le client peut remplacer lui-même, sans passer par le code ni par un développeur.
//
// Principe : ces photos sont lues depuis un dossier du compte LWS (sous-domaine photos.carsitting.fr) ; le client y dépose
// un fichier du même nom pour remplacer une photo. Si le fichier manque ou si LWS ne répond pas, le site affiche la photo
// d'origine, déjà dans le projet (`fallback`) : le site ne reste jamais sans image.
//
// Activation : variable Netlify PUBLIC_PHOTOS_BASE = https://photos.carsitting.fr (puis relancer un déploiement).
// Sans cette variable (et en développement local), toutes les photos viennent du projet.
//
// Le guide remis au client (noms de fichiers, formats, poids) est généré à partir de cette liste : GUIDE-PHOTOS.md.

const base = ((import.meta.env.PUBLIC_PHOTOS_BASE as string | undefined) ?? '').replace(/\/+$/, '');

export interface Slot {
  /** Nom du fichier à déposer sur LWS. */
  file: string;
  /** Photo d'origine, dans public/images/. */
  fallback: string;
  /** Où elle apparaît, dit simplement. */
  where: string;
  /** Format conseillé. */
  format: string;
}

export const slots = {
  accueilOuverture1: { file: 'accueil-ouverture-1.jpg', fallback: '/images/paris-nuit.jpg', where: 'Accueil : 1re photo de l’ouverture (plein écran)', format: 'Paysage, 1920 × 1080' },
  accueilOuverture2: { file: 'accueil-ouverture-2.jpg', fallback: '/images/services-evenement.jpg', where: 'Accueil : 2e photo de l’ouverture', format: 'Paysage, 1920 × 1080' },
  accueilOuverture3: { file: 'accueil-ouverture-3.jpg', fallback: '/images/hotel.jpg', where: 'Accueil : 3e photo de l’ouverture', format: 'Paysage, 1920 × 1080' },
  accueilGeste: { file: 'accueil-le-geste.jpg', fallback: '/images/voiturier-demeure.jpg', where: 'Accueil : grande photo à côté du titre « Premier visage à l’arrivée… »', format: 'Portrait, 1200 × 1440' },
  accueilCarteHotels: { file: 'accueil-carte-hotels.jpg', fallback: '/images/hotel.jpg', where: 'Accueil : carte « Hôtels »', format: 'Portrait, 1200 × 1500' },
  accueilCarteRestaurants: { file: 'accueil-carte-restaurants.jpg', fallback: '/images/restaurant.jpg', where: 'Accueil : carte « Restaurants »', format: 'Portrait, 1200 × 1500' },
  accueilCarteEvenements: { file: 'accueil-carte-evenements.jpg', fallback: '/images/evenement.jpg', where: 'Accueil : carte « Événements privés »', format: 'Portrait, 1200 × 1500' },
  accueilBandeauDevis: { file: 'accueil-bandeau-devis.jpg', fallback: '/images/voiturier-smoking.jpg', where: 'Accueil : bandeau « Demander un devis » en bas de page', format: 'Paysage, 1920 × 1000' },
  servicesOuverture: { file: 'services-ouverture.jpg', fallback: '/images/services-evenement.jpg', where: 'Nos services : photo du haut de page (plein écran)', format: 'Paysage, 1920 × 1080' },
  servicesHotels: { file: 'services-hotels.jpg', fallback: '/images/services-hotel.jpg', where: 'Nos services : prestation « Hôtels »', format: 'Paysage, 1600 × 1200' },
  servicesRestaurants: { file: 'services-restaurants.jpg', fallback: '/images/services-restaurant.webp', where: 'Nos services : prestation « Restaurants »', format: 'Paysage, 1600 × 1200' },
  servicesEnseignes: { file: 'services-enseignes.jpg', fallback: '/images/voiturier-smoking.jpg', where: 'Nos services : prestation « Enseignes de prestige »', format: 'Paysage, 1600 × 1200' },
  servicesEvenements: { file: 'services-evenements.jpg', fallback: '/images/services-evenement.jpg', where: 'Nos services : prestation « Événements privés »', format: 'Paysage, 1600 × 1200' },
  aboutOuverture: { file: 'qui-sommes-nous-ouverture.jpg', fallback: '/images/paris-nuit.jpg', where: 'Qui sommes-nous : photo du haut de page (plein écran)', format: 'Paysage, 1920 × 1080' },
  aboutEquipes: { file: 'qui-sommes-nous-equipes.jpg', fallback: '/images/voiturier-smoking.jpg', where: 'Qui sommes-nous : photo à côté de « Nos équipes »', format: 'Paysage, 1600 × 840' },
  devisOuverture: { file: 'devis-ouverture.jpg', fallback: '/images/restaurant.jpg', where: 'Demande de devis : photo du haut de page', format: 'Paysage, 1920 × 1080' },
} satisfies Record<string, Slot>;

export type SlotKey = keyof typeof slots;

/** `src` : la photo du client (LWS) si activée, sinon celle du projet ; `fallback` : repli si le fichier manque. */
export function photo(key: SlotKey) {
  const s = slots[key];
  return base ? { src: `${base}/${s.file}`, fallback: s.fallback } : { src: s.fallback, fallback: undefined };
}
