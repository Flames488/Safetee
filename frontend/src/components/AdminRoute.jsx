import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ProtectedRoute from './ProtectedRoute';

// Route-level guard, on top of ProtectedRoute's auth check — belt-and-braces
// alongside AdminDashboard's own internal role check and the backend's
// require_admin_viewer/require_super_admin dependencies, which are the
// actual source of truth. Nothing sensitive is ever exposed by relying on
// this alone; it just means a non-admin never sees the admin shell at all.
export default function AdminRoute({ children }) {
  const { user } = useAuth();
  return (
    <ProtectedRoute>
      {user && user.admin_role === 'none' ? <Navigate to="/app" replace /> : children}
    </ProtectedRoute>
  );
}
