import { Link, useLocation } from 'react-router-dom';

const pages = {
  '/safety': {
    eyebrow: 'Buy and sell safely',
    title: 'Marketplace safety tips',
    intro: 'A few simple checks can help you make safer decisions when buying or selling renewable energy equipment.',
    points: [
      'Inspect products in person and verify serial numbers, condition, and included accessories before paying.',
      'Avoid advance payments to sellers you have not verified. Use payment methods that provide a clear transaction record.',
      'Meet in a public place or at the seller’s business premises, and bring someone with you for high-value purchases.',
      'Keep communication on Jimvolt while arranging a transaction. Never share passwords or one-time verification codes.',
      'Report suspicious listings or requests to the Jimvolt support team before proceeding.',
    ],
  },
  '/contact': {
    eyebrow: 'We are here to help',
    title: 'Contact Jimvolt',
    intro: 'For account, listing, or marketplace support, contact our team by email. Include your listing reference where applicable.',
    points: [],
  },
  '/terms': {
    eyebrow: 'Legal',
    title: 'Terms of use',
    intro: 'Jimvolt connects buyers and sellers of renewable energy products. Users are responsible for accurate listings, lawful conduct, and independently evaluating products and counterparties.',
    points: [
      'You must provide truthful account and advertisement information and must not list prohibited, counterfeit, or unsafe goods.',
      'Sellers are responsible for product descriptions, pricing, availability, warranties, and fulfilling agreements made with buyers.',
      'Jimvolt may review, reject, or remove advertisements that violate marketplace rules or applicable law.',
      'Users are responsible for arranging and completing transactions. Jimvolt does not take possession of products or guarantee third-party claims.',
    ],
  },
  '/privacy': {
    eyebrow: 'Your information',
    title: 'Privacy policy',
    intro: 'Jimvolt uses account and listing information to operate the marketplace, secure accounts, support buyers and sellers, and improve service reliability.',
    points: [
      'We use your email address and phone number for account access, important service messages, and security.',
      'Listing details are shown publicly to help buyers find products. Do not include sensitive personal information in public listing descriptions.',
      'Authentication credentials are stored as password hashes. Password reset and email verification tokens are stored in hashed form.',
      'You can update profile information in account settings or contact support with a privacy request.',
    ],
  },
};

export default function InformationPage() {
  const { pathname } = useLocation();
  const page = pages[pathname] || pages['/safety'];
  const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL;
  return (
    <div className="container section">
      <article className="panel information-page">
        <p className="eyebrow">{page.eyebrow}</p>
        <h1>{page.title}</h1>
        <p>{page.intro}</p>
        {page.points.length > 0 && <ul>{page.points.map((point) => <li key={point}>{point}</li>)}</ul>}
        {pathname === '/contact' && (supportEmail
          ? <a className="btn btn-primary" href={`mailto:${supportEmail}?subject=Jimvolt%20marketplace%20support`}>Email {supportEmail}</a>
          : <p className="notice error">Support email is not configured. Set VITE_SUPPORT_EMAIL to publish the support contact.</p>)}
        <Link className="link" to="/">Return to Jimvolt</Link>
      </article>
    </div>
  );
}
