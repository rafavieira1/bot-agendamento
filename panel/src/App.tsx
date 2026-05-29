import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Login } from './pages/Login';
import { ConversasList } from './pages/ConversasList';
import { ConversaDetail } from './pages/ConversaDetail';
import { Admin } from './pages/Admin';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { PanelLayout } from './components/PanelLayout';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <ProtectedRoute>
              <PanelLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/conversas" element={<ConversasList />} />
          <Route path="/conversas/:id" element={<ConversaDetail />} />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <Admin />
              </AdminRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/conversas" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
