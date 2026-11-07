import { Link, useLocation } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';

export default function Placeholder() {
  const { pathname } = useLocation();
  return (
    <div className="container section">
      <EmptyState
        title="This page is coming soon"
        text={`${pathname} will be built in a later phase.`}
        action={<Link className="btn btn-primary" to="/">Back to homepage</Link>}
      />
    </div>
  );
}
