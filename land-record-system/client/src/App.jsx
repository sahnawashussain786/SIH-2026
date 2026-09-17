import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import { PageLoader } from './components/Spinner.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import UploadDocument from './pages/UploadDocument.jsx';
import Documents from './pages/Documents.jsx';
import DocumentDetail from './pages/DocumentDetail.jsx';
import Verification from './pages/Verification.jsx';
import LandRecords from './pages/LandRecords.jsx';
import Admin from './pages/Admin.jsx';
import Profile from './pages/Profile.jsx';

const ROLE_LABELS = {
  data_entry_officer: 'Data Entry Officer',
  digitization_operator: 'Digitization Operator',
  revenue_officer: 'Revenue Officer',
  senior_officer: 'Senior Officer',
  admin: 'Administrator',
  citizen: 'Citizen',
};

function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader label="Checking your session…" />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-amber-800">
          <h2 className="text-lg font-semibold">Access restricted</h2>
          <p className="mt-1 text-sm">
            This section requires role: {roles.map((r) => ROLE_LABELS[r] || r).join(', ')}.
          </p>
        </div>
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route
          path="upload"
          element={
            <Protected roles={['data_entry_officer', 'digitization_operator', 'revenue_officer', 'senior_officer', 'admin']}>
              <UploadDocument />
            </Protected>
          }
        />
        <Route path="documents" element={<Documents />} />
        <Route path="documents/:id" element={<DocumentDetail />} />
        <Route
          path="verification"
          element={
            <Protected roles={['revenue_officer', 'senior_officer', 'admin', 'data_entry_officer', 'digitization_operator']}>
              <Verification />
            </Protected>
          }
        />
        <Route path="records" element={<LandRecords />} />
        <Route path="profile" element={<Profile />} />
        <Route
          path="admin"
          element={
            <Protected roles={['admin']}>
              <Admin />
            </Protected>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
