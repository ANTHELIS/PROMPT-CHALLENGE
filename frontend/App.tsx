import React, { useState, useEffect } from 'react';
import { User, Language, CropListing } from './types';
import { api } from './api';
import LanguageSelector from './components/LanguageSelector';
import FarmerDashboard from './pages/FarmerDashboard';
import BuyerDashboard from './pages/BuyerDashboard';
import { MOCK_LISTINGS, TRANSLATIONS } from './constants';
import { ShieldCheck, Phone } from 'lucide-react';

import NameCollectionModal from './components/NameCollectionModal';

const App: React.FC = () => {
  // State
  const [step, setStep] = useState<'lang' | 'role' | 'auth' | 'app'>('lang');
  const [language, setLanguage] = useState<Language>('en');
  const [role, setRole] = useState<'farmer' | 'buyer' | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [listings, setListings] = useState<CropListing[]>(MOCK_LISTINGS);

  // Handlers
  const handleLangSelect = (lang: Language) => {
    setLanguage(lang);
    setStep('role');
  };

  useEffect(() => {
    if (step === 'app') {
      loadListings();
    }
  }, [step]);

  const handleRoleSelect = (r: 'farmer' | 'buyer') => {
    setRole(r);
    setStep('auth');
  };

  const loadListings = async () => {
    try {
      const data = await api.getListings();
      setListings(data);
    } catch (e) {
      console.error("Failed to load listings", e);
    }
  };

  const handleLogin = async () => {
    if (phoneNumber.length > 9) {
      try {
        // Attempt login first
        let loggedInUser = await api.loginUser(phoneNumber);

        // If user not found (null), registers them
        if (!loggedInUser && role) {
          loggedInUser = await api.registerUser({
            name: role === 'farmer' ? 'Kisan Bhai' : 'Vyapari Ji', // In a real app, you'd ask for this
            role,
            language,
            phone: phoneNumber,
            location: 'Maharashtra'
          });
        }

        if (loggedInUser) {
          // Map _id to id if necessary (api usually handles this but safety check)
          const userWithId = { ...loggedInUser, id: (loggedInUser as any)._id || loggedInUser.id };
          setUser(userWithId);

          // Load listings from server
          await loadListings();

          setStep('app');
        }
      } catch (error) {
        alert("Login/Registration failed. Please check console.");
      }
    }
  };

  const handleLogout = () => {
    setUser(null);
    setRole(null);
    setPhoneNumber('');
    setOtp('');
    setStep('lang');
    setListings([]);
  };

  const handleAddListing = async (listing: Omit<CropListing, 'id'>) => {
    try {
      // Create on backend
      const newListing = await api.createListing(listing);
      setListings(prev => [newListing, ...prev]);
    } catch (e) {
      alert("Failed to create listing");
    }
  };

  const handleUpdateListing = async (updatedListing: CropListing) => {
    try {
      const result = await api.updateListing(updatedListing.id, updatedListing);
      setListings(prev => prev.map(l => l.id === result.id ? result : l));
    } catch (e) {
      alert("Failed to update listing");
    }
  };

  const handleDeleteListing = async (listingId: string) => {
    try {
      await api.deleteListing(listingId);
      setListings(prev => prev.filter(l => l.id !== listingId));
    } catch (e) {
      alert("Failed to delete listing");
    }
  };

  const handleUpdateUser = async (updates: Partial<User>) => {
    if (!user) return;
    try {
      const updatedUser = await api.updateUser(user.id, updates);
      if (updatedUser) {
        const userWithId = { ...updatedUser, id: (updatedUser as any)._id || updatedUser.id };
        setUser(userWithId);
      }
    } catch (e) {
      alert("Failed to update profile");
    }
  };

  const t = (key: keyof typeof TRANSLATIONS['en']) => {
    return TRANSLATIONS[language][key] || TRANSLATIONS['en'][key];
  };

  // Render Logic
  if (step === 'lang') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <h1 className="text-3xl font-bold mb-8 text-gray-800">Select Language / भाषा चुनें</h1>
        <LanguageSelector onSelect={handleLangSelect} />
      </div>
    );
  }

  if (step === 'role') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <h1 className="text-2xl font-bold mb-8 text-center">{t('whoAreYou')}</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-lg">
          <button onClick={() => handleRoleSelect('farmer')} className="bg-emerald-100 border-2 border-emerald-500 p-8 rounded-2xl flex flex-col items-center hover:bg-emerald-200 transition-colors">
            <span className="text-4xl mb-2">🧑‍🌾</span>
            <span className="text-xl font-bold text-emerald-900">{t('roleFarmer')}</span>
            <span className="text-sm text-emerald-700">{t('sellCropsDesc')}</span>
          </button>
          <button onClick={() => handleRoleSelect('buyer')} className="bg-blue-100 border-2 border-blue-500 p-8 rounded-2xl flex flex-col items-center hover:bg-blue-200 transition-colors">
            <span className="text-4xl mb-2">🏢</span>
            <span className="text-xl font-bold text-blue-900">{t('roleBuyer')}</span>
            <span className="text-sm text-blue-700">{t('buyCropsDesc')}</span>
          </button>
        </div>
      </div>
    )
  }

  if (step === 'auth') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-800">{t('loginTitle')}</h2>
            <p className="text-gray-500">{t('loginSubtitle')}</p>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <Phone className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
              <input
                type="tel"
                placeholder={t('enterPhonePlaceholder')}
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            {phoneNumber.length > 9 && (
              <div className="animate-fade-in">
                <input
                  type="text"
                  placeholder={t('otpPlaceholder')}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-center tracking-widest text-lg"
                />
              </div>
            )}

            <button
              disabled={phoneNumber.length < 10}
              onClick={handleLogin}
              className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all"
            >
              {t('verifyLogin')}
            </button>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-gray-400 mt-8">
            <ShieldCheck className="w-4 h-4" />
            <span>{t('secureText')}</span>
          </div>
        </div>
      </div>
    )
  }

  if (user && step === 'app') {
    const isDefaultName = user.name === 'Kisan Bhai' || user.name === 'Vyapari Ji';

    return (
      <>
        {isDefaultName && (
          <NameCollectionModal
            user={user}
            selectedLanguage={language}
            onSave={async (newName) => {
              await handleUpdateUser({ name: newName });
            }}
          />
        )}
        {user.role === 'farmer'
          ? <FarmerDashboard
            user={user}
            listings={listings}
            onAddListing={handleAddListing}
            onUpdateListing={handleUpdateListing}
            onDeleteListing={handleDeleteListing}
            onUpdateUser={handleUpdateUser}
            onLogout={handleLogout}
          />
          : <BuyerDashboard
            user={user}
            listings={listings}
            onUpdateUser={handleUpdateUser}
            onLogout={handleLogout}
          />
        }
      </>
    );
  }

  return <div>Loading...</div>;
};

export default App;