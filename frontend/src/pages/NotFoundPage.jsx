import { Link, useLocation } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';

// Shown for any address that does not match a page.
export default function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <div className="container section">
      <EmptyState
        title="We couldn't find that page"
        text={`The address ${pathname} doesn't exist or may have moved.`}
        action={(
          <div className="not-found-actions">
            <Link className="btn btn-primary" to="/">Back to homepage</Link>
            <Link className="btn btn-white" to="/ads">Browse listings</Link>
            <Link className="link" to="/help">Visit the help centre</Link>
          </div>
        )}
      />
    </div>
  );
}
