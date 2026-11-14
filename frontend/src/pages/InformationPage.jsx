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
  '/refund-policy': {
    eyebrow: 'Payments',
    title: 'Refund policy',
    updated: 'November 14, 2026',
    intro: 'Browsing and posting on Jimvolt is free. The only payments Jimvolt takes are for paid promotions that give an approved advertisement extra visibility. This policy explains when those payments are refunded.',
    points: [],
    sections: [
      {
        heading: 'What this policy covers',
        points: [
          'Promotion packages (Boost, Featured, Premium and Premium Plus) paid through our payment partner, Bachs.',
          'It does not cover purchases between buyers and sellers. Jimvolt does not take payment for products, hold buyer funds, or ship goods, so refunds for a product are agreed directly with the seller.',
        ],
      },
      {
        heading: 'When you are entitled to a refund',
        points: [
          'You were charged but the promotion was never activated on your advertisement.',
          'You were charged more than once for the same promotion.',
          'We removed or rejected your advertisement for a reason that was not caused by you before the promotion ran its full length. You will be refunded for the days that were not used.',
          'We cannot deliver the promotion because of a fault on our side, such as an outage that stopped it from showing.',
        ],
      },
      {
        heading: 'When a refund is not available',
        points: [
          'The promotion has started and ran as described, and you later change your mind.',
          'Your advertisement was removed because it broke the Terms of use, for example a prohibited, counterfeit or misleading listing.',
          'The advertisement received fewer views, enquiries or sales than you hoped for. Promotions improve visibility but do not guarantee results.',
          'You marked the product as sold, or deleted the advertisement, while the promotion was running.',
        ],
      },
      {
        heading: 'How to request a refund',
        points: [
          'Contact us through the Contact page within 14 days of the payment.',
          'Include your account email, the advertisement title or ID, and the payment reference shown in your promotions list.',
          'We review requests within 5 business days and tell you the outcome by email.',
        ],
      },
      {
        heading: 'How refunds are paid',
        points: [
          'Approved refunds go back to the original payment method through Bachs.',
          'Your bank or card provider may take several business days to show the money. We cannot speed up that step.',
          'If a refund is for part of a promotion, the amount is worked out from the unused days.',
        ],
      },
      {
        heading: 'Changes to this policy',
        points: [
          'We may update this policy. The date at the top shows when it last changed, and the version in force when you paid applies to that payment.',
        ],
      },
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
        {page.updated && <p className="muted">Last updated {page.updated}</p>}
        <p>{page.intro}</p>
        {page.points.length > 0 && <ul>{page.points.map((point) => <li key={point}>{point}</li>)}</ul>}
        {page.sections?.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            <ul>{section.points.map((point) => <li key={point}>{point}</li>)}</ul>
          </section>
        ))}
        {pathname === '/refund-policy' && <p>Questions about a payment? <Link className="link" to="/contact">Contact support</Link>.</p>}
        {pathname === '/contact' && (supportEmail
          ? <a className="btn btn-primary" href={`mailto:${supportEmail}?subject=Jimvolt%20marketplace%20support`}>Email {supportEmail}</a>
          : <p className="notice error">Support email is not configured. Set VITE_SUPPORT_EMAIL to publish the support contact.</p>)}
        <Link className="link" to="/">Return to Jimvolt</Link>
      </article>
    </div>
  );
}
