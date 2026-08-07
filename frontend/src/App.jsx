import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import PetitiStyleInjector from './components/PetitiStyleInjector';
import FloatingChatButton from './components/FloatingChatButton';
import JedidaAiWidget from './components/ai-assistant/JedidaAiWidget';
import Footer from './components/Footer';
import ErrorBoundary from './components/system/ErrorBoundary';
import NativeAppShell from './native/NativeAppShell';
import BiometricGate from './native/BiometricGate';
import SessionGuard from './native/SessionGuard';
import NativeBottomNav from './components/native/NativeBottomNav';
import PageTransition from './components/native/PageTransition';
import GetStarted from './pages/GetStarted';
import SignUp from './pages/SignUp';
import SignIn from './pages/SignIn';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import PublicShop from './pages/PublicShop';
import ForYouFeed from './pages/buyer/ForYouFeed';
import DownloadApp from './pages/DownloadApp';
import DynamicPage from './pages/DynamicPage';
import LegalCenter from './pages/LegalCenter';
import LegalDocument from './pages/LegalDocument';

import UpgradePage from './pages/upgrade/UpgradePage';
import SellerDashboard from './pages/seller/SellerDashboard';
import PartnerPortalDashboard from './pages/partner-portal/PartnerPortalDashboard';

import DeliveryDashboard from './pages/delivery/DeliveryDashboard';
import DriverDashboard from './pages/delivery/DriverDashboard';

import Marketplace from './pages/buyer/Marketplace';
import SectionProducts from './pages/buyer/SectionProducts';
import TrendingProducts from './pages/buyer/TrendingProducts';
import ProductDetail from './pages/buyer/ProductDetail';
import Checkout from './pages/buyer/Checkout';
import MyOrders from './pages/buyer/MyOrders';
import DocumentCenter from './pages/buyer/DocumentCenter';
import VerifyDocument from './pages/VerifyDocument';
import KycWizard from './pages/kyc/KycWizard';
import MyQuoteRequests from './pages/buyer/MyQuoteRequests';
import MyAgreements from './pages/buyer/MyAgreements';
import MyProfile from './pages/MyProfile';
import AccountSecurity from './pages/AccountSecurity';
import PublicProfile from './pages/PublicProfile';
import MySupplyContracts from './pages/buyer/MySupplyContracts';
import OrderTracking from './pages/buyer/OrderTracking';
import AdminPanel from './pages/admin/AdminPanel';
import CartPage from './pages/buyer/CartPage';
import PaymentCenter from "./pages/buyer/PaymentCenter";
import AdminPayments from "./pages/admin/AdminPayments";
import PartnerWithJedida from './pages/PartnerWithJedida';
import PartnerAppsDirectory from './pages/PartnerAppsDirectory';
import AffiliatePage from './pages/AffiliatePage';
import DeveloperWelcome from './pages/developer/DeveloperWelcome';
import DeveloperRegister from './pages/developer/DeveloperRegister';
import DeveloperDashboard from './pages/developer/DeveloperDashboard';

import StaysHome from './pages/stays/StaysHome';
import PropertyDetail from './pages/stays/PropertyDetail';
import GuestBookings from './pages/stays/GuestBookings';
import HostDashboard from './pages/stays/host/HostDashboard';
import PropertyEditor from './pages/stays/host/PropertyEditor';
import HostBookings from './pages/stays/host/HostBookings';
import VerifyStayPass from './pages/stays/VerifyStayPass';
import HostOverview from './pages/stays/host/HostOverview';
import GuestOverview from './pages/stays/GuestOverview';
import SavedProperties from './pages/stays/SavedProperties';
import HostReviews from './pages/stays/host/HostReviews';

function isAuthed() {
  return !!localStorage.getItem('jedida_access_token');
}

function ProtectedRoute({ children }) {
  return isAuthed() ? children : <Navigate to="/signin" replace />;
}

// Wraps just the routed page content (not header/footer/chat) so that if a
// specific page crashes, navigation and chrome stay usable and the user can
// navigate away — the boundary auto-resets when the route changes.
function RoutedContent({ children }) {
  const location = useLocation();
  return (
    <ErrorBoundary level="page" resetKey={location.pathname}>
      {children}
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <BiometricGate>
    <ThemeProvider>
    <BrowserRouter>
    <NativeAppShell>
      <SessionGuard />
      <PetitiStyleInjector />
      <RoutedContent>
      <PageTransition>
      <Routes>
        <Route path="/" element={<Marketplace />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/s/:slug" element={<PublicShop />} />
        <Route path="/download" element={<DownloadApp />} />
        <Route path="/p/:slug" element={<DynamicPage />} />
        <Route path="/partner-with-jedida" element={<PartnerWithJedida />} />
        <Route path="/partner-apps" element={<PartnerAppsDirectory />} />
        <Route path="/legal" element={<LegalCenter />} />
        <Route path="/legal/:docType" element={<LegalDocument />} />

        {/* Buyer / Main Marketplace */}
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/marketplace/section/:key" element={<SectionProducts />} />
        <Route path="/trending" element={<TrendingProducts />} />
        <Route path="/feed" element={<ProtectedRoute><ForYouFeed /></ProtectedRoute>} />

<Route path="/product/:id" element={<ProductDetail />} />

<Route path="/s/:slug" element={<PublicShop />} />

<Route path="/p/:slug" element={<DynamicPage />} />
        <Route path="/checkout/:productId" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
        <Route path="/orders" element={<ProtectedRoute><MyOrders /></ProtectedRoute>} />
        <Route path="/documents" element={<ProtectedRoute><DocumentCenter /></ProtectedRoute>} />
        <Route path="/verify/:code" element={<VerifyDocument />} />
        <Route path="/verify-identity" element={<ProtectedRoute><KycWizard /></ProtectedRoute>} />
        <Route path="/my-quotes" element={<ProtectedRoute><MyQuoteRequests /></ProtectedRoute>} />
        <Route path="/my-agreements" element={<ProtectedRoute><MyAgreements /></ProtectedRoute>} />
        <Route path="/my-supply-contracts" element={<ProtectedRoute><MySupplyContracts /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><MyProfile /></ProtectedRoute>} />
        <Route path="/account/security" element={<ProtectedRoute><AccountSecurity /></ProtectedRoute>} />
        <Route path="/u/:userId" element={<PublicProfile />} />

        {/* Jedida Stays — Phase A */}
        <Route path="/stays" element={<StaysHome />} />
        <Route path="/stays/:id" element={<PropertyDetail />} />
        <Route path="/host/upgrade" element={<ProtectedRoute><UpgradePage initialType="host" /></ProtectedRoute>} />
        <Route path="/host" element={<ProtectedRoute><HostOverview /></ProtectedRoute>} />
        <Route path="/host/properties" element={<ProtectedRoute><HostDashboard /></ProtectedRoute>} />
        <Route path="/host/properties/new" element={<ProtectedRoute><PropertyEditor /></ProtectedRoute>} />
        <Route path="/host/properties/:id" element={<ProtectedRoute><PropertyEditor /></ProtectedRoute>} />

        {/* Jedida Stays — Phase B: bookings + payments */}
        <Route path="/guest" element={<ProtectedRoute><GuestOverview /></ProtectedRoute>} />
        <Route path="/guest/saved" element={<ProtectedRoute><SavedProperties /></ProtectedRoute>} />
        <Route path="/guest/bookings" element={<ProtectedRoute><GuestBookings /></ProtectedRoute>} />
        <Route path="/guest/bookings/:id" element={<ProtectedRoute><GuestBookings /></ProtectedRoute>} />
        <Route path="/host/bookings" element={<ProtectedRoute><HostBookings /></ProtectedRoute>} />
        <Route path="/host/reviews" element={<ProtectedRoute><HostReviews /></ProtectedRoute>} />

        {/* Jedida Stays — Phase C: Digital Stay Pass public verification */}
        <Route path="/verify-stay/share/:token" element={<VerifyStayPass />} />
        <Route path="/verify-stay/:code" element={<VerifyStayPass />} />

        <Route path="/orders/:orderId/track" element={<ProtectedRoute><OrderTracking /></ProtectedRoute>} />
        <Route path="/cart" element={<ProtectedRoute><CartPage /></ProtectedRoute>} />
        <Route path="/affiliate" element={<ProtectedRoute><AffiliatePage /></ProtectedRoute>} />
        <Route path="/developer/welcome" element={<ProtectedRoute><DeveloperWelcome /></ProtectedRoute>} />
        <Route path="/developer/register" element={<ProtectedRoute><DeveloperRegister /></ProtectedRoute>} />
        <Route path="/developer/dashboard" element={<ProtectedRoute><DeveloperDashboard /></ProtectedRoute>} />
        <Route
  path="/payment-center/:orderId"
  element={
    <ProtectedRoute>
      <PaymentCenter />
    </ProtectedRoute>
  }
/>
<Route
 path="/admin/payments"
 element={<AdminPayments />}
/>
        {/* Seller */}
        <Route path="/seller/upgrade" element={<ProtectedRoute><UpgradePage initialType="seller" /></ProtectedRoute>} />
        <Route path="/seller" element={<ProtectedRoute><SellerDashboard /></ProtectedRoute>} />

        {/* Manufacturer / Supplier / Dropshipper — built on the seller
            architecture (schema_phase37): same upgrade flow, same shop/
            product/order/wallet dashboard shell, until their own
            role-specific modules (sourcing, inventory sync, etc.) ship. */}
        <Route path="/manufacturer/upgrade" element={<ProtectedRoute><UpgradePage initialType="manufacturer" /></ProtectedRoute>} />
        <Route path="/manufacturer" element={<ProtectedRoute><SellerDashboard /></ProtectedRoute>} />
        <Route path="/supplier/upgrade" element={<ProtectedRoute><UpgradePage initialType="supplier" /></ProtectedRoute>} />
        <Route path="/supplier" element={<ProtectedRoute><SellerDashboard /></ProtectedRoute>} />
        <Route path="/dropshipper/upgrade" element={<ProtectedRoute><UpgradePage initialType="dropshipper" /></ProtectedRoute>} />
        <Route path="/dropshipper" element={<ProtectedRoute><SellerDashboard /></ProtectedRoute>} />

        {/* Delivery */}
        <Route path="/delivery/upgrade" element={<ProtectedRoute><UpgradePage initialType="delivery" /></ProtectedRoute>} />
        <Route path="/delivery" element={<ProtectedRoute><DeliveryDashboard /></ProtectedRoute>} />

        {/* Partner Portal */}
        <Route path="/partner-portal" element={<ProtectedRoute><PartnerPortalDashboard /></ProtectedRoute>} />
        <Route path="/driver" element={<ProtectedRoute><DriverDashboard /></ProtectedRoute>} />

        {/* Admin (includes the AI Command Center tab) */}
        <Route path="/admin" element={<ProtectedRoute><AdminPanel /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </PageTransition>
      </RoutedContent>
      <Footer />
      <FloatingChatButton />
      <JedidaAiWidget />
      <NativeBottomNav />
    </NativeAppShell>
    </BrowserRouter>
    </ThemeProvider>
    </BiometricGate>
  );
}
