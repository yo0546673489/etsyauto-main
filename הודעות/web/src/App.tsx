import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MessagesPage from './pages/MessagesPage';
import StoresPage from './pages/StoresPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MessagesPage />} />
        <Route path="/stores" element={<StoresPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
