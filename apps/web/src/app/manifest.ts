import type { MetadataRoute } from 'next';

/** The installable-app manifest. The colours are the brand tokens `globals.css` defines. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Marginal — a confidential exchange for information goods',
    short_name: 'Marginal',
    description:
      'Prices information goods by their measured marginal value, inside attested rooms, on NEAR.',
    start_url: '/listings',
    display: 'standalone',
    background_color: '#00224D',
    theme_color: '#FF204E',
  };
}
