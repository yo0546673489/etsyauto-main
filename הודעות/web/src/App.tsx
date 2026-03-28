import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import MessagesPage from './pages/MessagesPage';
import StoresPage from './pages/StoresPage';
import ReviewsPage from './pages/ReviewsPage';
import DiscountsPage from './pages/DiscountsPage';

function NavBar() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
    }`;

  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-2">
      <div className="max-w-6xl mx-auto flex items-center gap-1">
        <span className="font-bold text-gray-900 mr-4">Profitly</span>
        <NavLink to="/" className={linkClass} end>Messages</NavLink>
        <NavLink to="/reviews" className={linkClass}>Reviews</NavLink>
        <NavLink to="/discounts" className={linkClass}>Discounts</NavLink>
        <NavLink to="/stores" className={linkClass}>Stores</NavLink>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <Routes>
        <Route path="/" element={<MessagesPage />} />
        <Route path="/reviews" element={<ReviewsPage />} />
        <Route path="/discounts" element={<DiscountsPage />} />
        <Route path="/stores" element={<StoresPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
