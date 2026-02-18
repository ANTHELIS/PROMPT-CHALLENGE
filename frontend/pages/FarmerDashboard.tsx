import React, { useState, useEffect, useRef } from 'react';
import { User, CropListing, Message } from '../types';
import { api } from '../api';
import { getMarketInsight, translateText } from '../services/geminiService';
import LiveAssistant from '../components/LiveAssistant';
import { TRANSLATIONS } from '../constants';
import { Sprout, TrendingUp, Edit2, MessageCircle, Phone, ArrowLeft, Plus, Trash2, LogOut, User as UserIcon, Camera, X } from 'lucide-react';
import LanguageDropdown from '../components/LanguageDropdown';
import { FunctionDeclaration, Type } from '@google/genai';
import { LANGUAGES } from '../constants';

interface Props {
    user: User;
    listings: CropListing[];
    onAddListing: (listing: FormData) => void;
    onUpdateListing: (listing: CropListing) => void;
    onDeleteListing: (listingId: string) => void;
    onUpdateUser: (updates: Partial<User>) => void;
    onLogout: () => void;
}

const FarmerDashboard: React.FC<Props> = ({ user, listings, onAddListing, onUpdateListing, onDeleteListing, onUpdateUser, onLogout }) => {
    const [view, setView] = useState<'home' | 'create' | 'edit' | 'chat' | 'profile'>('home');
    const [activeTab, setActiveTab] = useState<'my_listings' | 'inbox'>('my_listings');
    const [insight, setInsight] = useState<any>(null);
    const [formState, setFormState] = useState<Partial<CropListing>>({});
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [savingListing, setSavingListing] = useState(false);

    // Local crop name dictionary for instant translation (no API call needed)
    const CROP_DICT: Record<string, string> = {
        // Hindi
        'प्याज': 'Onion', 'टमाटर': 'Tomato', 'आलू': 'Potato', 'गेहूं': 'Wheat', 'गेहूँ': 'Wheat',
        'चावल': 'Rice', 'धान': 'Paddy', 'मक्का': 'Corn', 'गन्ना': 'Sugarcane', 'कपास': 'Cotton',
        'सोयाबीन': 'Soybean', 'मूंगफली': 'Peanut', 'सरसों': 'Mustard', 'बैंगन': 'Brinjal',
        'भिंडी': 'Okra', 'गोभी': 'Cauliflower', 'पत्ता गोभी': 'Cabbage', 'मटर': 'Peas',
        'लहसुन': 'Garlic', 'अदरक': 'Ginger', 'हल्दी': 'Turmeric', 'मिर्च': 'Chili',
        'गाजर': 'Carrot', 'मूली': 'Radish', 'पालक': 'Spinach', 'केला': 'Banana',
        'आम': 'Mango', 'अंगूर': 'Grapes', 'संतरा': 'Orange', 'अनार': 'Pomegranate',
        'ज्वार': 'Sorghum', 'बाजरा': 'Pearl Millet', 'रागी': 'Finger Millet',
        'चना': 'Chickpea', 'मसूर': 'Lentil', 'उड़द': 'Black Gram', 'मूंग': 'Mung Bean',
        'तुअर': 'Pigeon Pea', 'अरहर': 'Pigeon Pea', 'जीरा': 'Cumin', 'धनिया': 'Coriander',
        // Marathi
        'कांदा': 'Onion', 'बटाटा': 'Potato', 'तांदूळ': 'Rice', 'ऊस': 'Sugarcane',
        'वांगे': 'Brinjal', 'भेंडी': 'Okra', 'फ्लॉवर': 'Cauliflower', 'कोबी': 'Cabbage',
        'लसूण': 'Garlic', 'आले': 'Ginger', 'हिरवी मिरची': 'Green Chili',
        'मुळा': 'Radish',
    };
    const [inboxItems, setInboxItems] = useState<{ partnerId: string, listingId?: string, listingName?: string, name: string, lastMsg: string }[]>([]);
    const [activeChat, setActiveChat] = useState<{ partnerId: string, listingId?: string } | null>(null);
    const [profileData, setProfileData] = useState({ name: '', location: '', language: 'en' as any });

    // Keep a ref of listings to access inside the Voice Session closure
    const listingsRef = useRef(listings);
    useEffect(() => {
        listingsRef.current = listings;
    }, [listings]);

    // Chat State
    const [messages, setMessages] = useState<Message[]>([]);
    const messagesRef = useRef(messages);
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    // Poll for messages
    useEffect(() => {
        const fetchMessages = async () => {
            if (user.id) {
                const msgs = await api.getMessages(user.id);
                setMessages(msgs);
            }
        };

        fetchMessages();
        const interval = setInterval(fetchMessages, 3000); // Poll every 3 seconds
        return () => clearInterval(interval);
    }, [user.id]);

    useEffect(() => {
        const processInbox = async () => {
            // Group by Key: partnerId_listingId
            const threads = new Map<string, { partnerId: string, listingId?: string, listingName?: string, name: string, lastMsg: string, timestamp: number }>();

            for (const m of messages) {
                const partnerId = m.senderId === user.id ? m.receiverId : m.senderId;
                if (!partnerId || partnerId === user.id) continue;

                // Unique Key for thread
                const key = `${partnerId}_${m.listingId || 'general'}`;

                if (!threads.has(key)) {
                    // Initial info (will refine name later)
                    let listingName = 'General';
                    if (m.listingId) {
                        const l = listings.find(lst => lst.id === m.listingId);
                        if (l) listingName = l.cropName;
                    }

                    threads.set(key, {
                        partnerId,
                        listingId: m.listingId,
                        listingName,
                        name: partnerId, // temp
                        lastMsg: m.text,
                        timestamp: m.timestamp
                    });
                } else {
                    // Update last msg if newer
                    const t = threads.get(key)!;
                    if (m.timestamp > t.timestamp) {
                        t.lastMsg = m.text;
                        t.timestamp = m.timestamp;
                    }
                }
            }

            const items = await Promise.all(Array.from(threads.values()).map(async (item) => {
                let name = item.partnerId;
                if (item.partnerId === 'buyer_1') name = "Manoj (Demo)";
                else {
                    try {
                        const u = await api.getUser(item.partnerId);
                        if (u) name = u.name;
                    } catch (e) { }
                }
                return { ...item, name };
            }));

            // Sort by latest
            items.sort((a, b) => b.timestamp - a.timestamp);
            setInboxItems(items);
        };
        processInbox();
    }, [messages, user.id, listings]);

    const [newMessage, setNewMessage] = useState('');

    // Translations Helper
    const t = (key: keyof typeof TRANSLATIONS['en']) => {
        return TRANSLATIONS[user.language][key] || TRANSLATIONS['en'][key];
    };

    const myListings = listings.filter(l => l.farmerId === user.id);

    // --- Voice Tools Configuration ---
    const tools: FunctionDeclaration[] = [
        {
            name: 'create_listing',
            description: 'Create a new crop listing with name, quantity, and price.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    cropName: { type: Type.STRING, description: "Name of the crop e.g. Onion" },
                    quantity: { type: Type.NUMBER, description: "Quantity in KG" },
                    price: { type: Type.NUMBER, description: "Price per KG in Rupees" },
                    location: { type: Type.STRING, description: "City or Village name" }
                },
                required: ['cropName', 'quantity', 'price']
            }
        },
        {
            name: 'delete_listing',
            description: 'Delete a crop listing by its name.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    cropName: { type: Type.STRING, description: "Name of the crop to delete" }
                },
                required: ['cropName']
            }
        },
        {
            name: 'update_listing',
            description: 'Update price or quantity of an existing listing.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    cropName: { type: Type.STRING, description: "Name of the crop to update" },
                    newPrice: { type: Type.NUMBER },
                    newQuantity: { type: Type.NUMBER }
                },
                required: ['cropName']
            }
        },
        {
            name: 'get_my_listings',
            description: 'Get the list of current crops listed by the farmer. Use this to summarize.',
            parameters: {
                type: Type.OBJECT,
                properties: {},
            }
        },
        {
            name: 'check_inbox',
            description: 'Check messages. Returns sender and product name for each conversation.',
            parameters: {
                type: Type.OBJECT,
                properties: {},
            }
        },
        {
            name: 'find_conversation_by_product',
            description: 'Find conversations about a specific crop product.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    cropName: { type: Type.STRING, description: "Name of the crop to search for" }
                },
                required: ['cropName']
            }
        },
        {
            name: 'read_latest_messages',
            description: 'Read the actual content of the messages from the buyer.',
            parameters: {
                type: Type.OBJECT,
                properties: {},
            }
        },
        {
            name: 'send_reply',
            description: 'Send a message reply to the buyer.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    message: { type: Type.STRING, description: "The message content to send" }
                },
                required: ['message']
            }
        },
        {
            name: 'update_profile',
            description: 'Update the user profile details like name, location, or language.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING, description: "New name of the user" },
                    location: { type: Type.STRING, description: "New location/city" },
                    language: { type: Type.STRING, enum: ['en', 'hi', 'mr', 'te', 'ta', 'bn'], description: "Language code" }
                },
                required: []
            }
        }
    ];

    const handleToolCall = async (name: string, args: any) => {
        console.log("Tool executing:", name, args);

        if (name === 'create_listing') {
            // Standardize crop name to English for search
            const standardizedName = await translateText(args.cropName, 'english');

            const formData = new FormData();
            formData.append('farmerId', user.id);
            formData.append('farmerName', user.name);
            formData.append('cropName', args.cropName);
            formData.append('cropNameEnglish', standardizedName);
            formData.append('quantity', String(args.quantity));
            formData.append('price', String(args.price));
            formData.append('location', args.location || user.location || 'India');
            formData.append('description', 'Created via Voice Assistant');

            onAddListing(formData);
            return "Listing created successfully.";
        }

        if (name === 'delete_listing') {
            // Find closest match by name
            const target = listingsRef.current.find(l =>
                l.farmerId === user.id &&
                l.cropName.toLowerCase().includes(args.cropName.toLowerCase())
            );
            if (target) {
                onDeleteListing(target.id);
                return `Deleted ${target.cropName} listing.`;
            }
            return `Could not find a listing for ${args.cropName}.`;
        }

        if (name === 'update_listing') {
            const target = listingsRef.current.find(l =>
                l.farmerId === user.id &&
                l.cropName.toLowerCase().includes(args.cropName.toLowerCase())
            );
            if (target) {
                const updated = { ...target };
                if (args.newPrice) updated.price = args.newPrice;
                if (args.newQuantity) updated.quantity = args.newQuantity;
                onUpdateListing(updated);
                return `Updated ${target.cropName}. New price: ${updated.price}, Quantity: ${updated.quantity}`;
            }
            return `Could not find ${args.cropName} to update.`;
        }

        if (name === 'get_my_listings') {
            const myCurrentListings = listingsRef.current.filter(l => l.farmerId === user.id);
            if (myCurrentListings.length === 0) return "You have no listings yet.";
            return JSON.stringify(myCurrentListings.map(l => ({ name: l.cropName, qty: l.quantity, price: l.price })));
        }

        if (name === 'check_inbox') {
            if (inboxItems.length === 0) return "Inbox is empty.";
            return JSON.stringify(inboxItems.map(i => ({ from: i.name, product: i.listingName, lastParams: i.lastMsg })));
        }

        if (name === 'find_conversation_by_product') {
            const matches = inboxItems.filter(i =>
                i.listingName?.toLowerCase().includes(args.cropName.toLowerCase())
            );
            if (matches.length === 0) return `No conversations found for ${args.cropName}.`;
            return `Found ${matches.length} conversations for ${args.cropName}. From: ${matches.map(m => m.name).join(', ')}.`;
        }

        if (name === 'read_latest_messages') {
            const incoming = messagesRef.current.filter(m => m.senderId !== user.id).slice(-3); // Get last 3
            if (incoming.length === 0) return "No incoming messages.";
            return JSON.stringify(incoming.map(m => ({ from: m.senderId, text: m.text })));
        }

        if (name === 'send_reply') {
            if (!activeChat) return "Please open a chat first or specify which conversation to reply to.";
            const receiverId = activeChat.partnerId;
            const listingId = activeChat.listingId;

            try {
                await api.sendMessage({
                    senderId: user.id,
                    receiverId,
                    listingId,
                    text: args.message,
                    timestamp: Date.now()
                });
                // We rely on polling to show it in the list, or optionallyoptimistically add it
                return "Message sent to Manoj.";
            } catch (e) {
                return "Failed to send message.";
            }

        }

        if (name === 'update_profile') {
            const updates: any = {};
            if (args.name) updates.name = args.name;
            if (args.location) updates.location = args.location;
            if (args.language) updates.language = args.language;

            if (Object.keys(updates).length > 0) {
                onUpdateUser(updates);
                // Also update local profile form state if visible
                setProfileData(prev => ({ ...prev, ...updates }));
                return "Profile updated successfully.";
            }
            return "No changes provided for profile.";
        }

        return "Unknown tool";
    };

    // --- Actions ---

    const startCreate = () => {
        setFormState({});
        setImageFile(null);
        setEditingId(null);
        setInsight(null);
        setView('create');
    };

    const startEdit = (listing: CropListing) => {
        setFormState(listing);
        setEditingId(listing.id);
        setView('edit');
    };

    const getEnglishCropName = (name: string): string | null => {
        if (!name) return null;
        const trimmed = name.trim();
        // Check dictionary (case-insensitive)
        const match = CROP_DICT[trimmed] || CROP_DICT[trimmed.toLowerCase()];
        if (match) return match;
        // If already in English (latin chars), just capitalize
        if (/^[a-zA-Z\s]+$/.test(trimmed)) {
            return trimmed.replace(/\b\w/g, c => c.toUpperCase());
        }
        return null; // Not found, needs API
    };

    const saveListing = async () => {
        setSavingListing(true);
        try {
            if (editingId) {
                onUpdateListing({ ...formState, id: editingId } as CropListing);
            } else {
                // Fast local lookup first, fallback to Gemini only if needed
                const cropName = formState.cropName || '';
                let englishName = getEnglishCropName(cropName);
                if (!englishName) {
                    // Only call Gemini API for unknown crops
                    englishName = await translateText(cropName, 'english');
                }

                const formData = new FormData();
                formData.append('farmerId', user.id);
                formData.append('farmerName', user.name);
                formData.append('cropName', cropName);
                formData.append('cropNameEnglish', englishName);
                formData.append('quantity', String(formState.quantity));
                formData.append('price', String(formState.price));
                formData.append('location', formState.location || '');
                formData.append('description', formState.description || 'Fresh crop');

                if (imageFile) {
                    formData.append('image', imageFile);
                }

                onAddListing(formData);
            }
            setView('home');
        } finally {
            setSavingListing(false);
        }
    };

    const openChat = (item: { partnerId: string, listingId?: string }) => {
        setActiveChat(item);
        setView('chat');
    };

    const sendMessage = async () => {
        if (!newMessage.trim() || !activeChat) return;

        const receiverId = activeChat.partnerId;
        const listingId = activeChat.listingId;

        try {
            const msg = await api.sendMessage({
                senderId: user.id,
                receiverId: receiverId,
                listingId: listingId,
                text: newMessage,
                timestamp: Date.now()
            });

            setMessages(prev => [...prev, msg]);
            setNewMessage('');
        } catch (error) {
            console.error("Failed to send", error);
        }
    };

    // --- Render Views ---

    if (view === 'create' || view === 'edit') {
        const isEdit = view === 'edit';
        const instruction = `You are assisting a farmer in ${isEdit ? 'updating' : 'creating'} a listing. Help them fill quantity, price.`;

        return (
            <div className="min-h-screen bg-gray-50 p-4 pb-24 page-enter">
                <button onClick={() => setView('home')} className="mb-4 flex items-center text-gray-600">
                    <ArrowLeft className="w-5 h-5 mr-1" /> Back
                </button>

                <h2 className="text-2xl font-bold mb-6 text-gray-800">{isEdit ? t('edit') : t('createListing')}</h2>

                {insight && (
                    <div className="mb-6 bg-orange-50 border border-orange-200 p-4 rounded-xl">
                        <div className="flex items-center gap-2 text-orange-800 font-bold mb-1">
                            <TrendingUp className="w-4 h-4" /> {t('marketInsight')}
                        </div>
                        <p className="text-3xl font-bold text-gray-800">₹{insight.recommendedPrice}</p>
                        <p className="text-sm text-gray-600">{insight.advice}</p>
                    </div>
                )}

                <div className="bg-white p-6 rounded-xl shadow-sm space-y-4 animate-fade-in-up">
                    <div>
                        <label className="block text-sm text-gray-500 mb-1">{t('cropName')}</label>
                        <input
                            type="text"
                            value={formState.cropName || ''}
                            onChange={e => setFormState({ ...formState, cropName: e.target.value })}
                            className="w-full p-3 border rounded-lg bg-gray-50 text-lg font-medium"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-gray-500 mb-1">{t('quantity')}</label>
                            <input
                                type="number"
                                value={formState.quantity || ''}
                                onChange={e => setFormState({ ...formState, quantity: parseInt(e.target.value) })}
                                className="w-full p-3 border rounded-lg bg-gray-50 text-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-500 mb-1">{t('price')}</label>
                            <input
                                type="number"
                                value={formState.price || ''}
                                onChange={e => setFormState({ ...formState, price: parseInt(e.target.value) })}
                                className="w-full p-3 border rounded-lg bg-gray-50 text-lg"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-500 mb-1">{t('location')}</label>
                        <input
                            type="text"
                            value={formState.location || ''}
                            onChange={e => setFormState({ ...formState, location: e.target.value })}
                            className="w-full p-3 border rounded-lg bg-gray-50"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-500 mb-1">Image (Optional)</label>
                        {imageFile ? (
                            <div className="relative rounded-xl overflow-hidden border-2 border-emerald-200 bg-emerald-50">
                                <img
                                    src={URL.createObjectURL(imageFile)}
                                    alt="Preview"
                                    className="w-full h-48 object-cover"
                                />
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                                    <p className="text-white text-sm font-medium truncate">{imageFile.name}</p>
                                    <p className="text-white/70 text-xs">{(imageFile.size / 1024).toFixed(0)} KB</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setImageFile(null)}
                                    className="absolute top-2 right-2 bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer bg-gray-50 hover:bg-emerald-50 hover:border-emerald-400 transition-all group">
                                <div className="flex flex-col items-center justify-center py-4">
                                    <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-3 group-hover:bg-emerald-200 transition-colors">
                                        <Camera className="w-6 h-6 text-emerald-600" />
                                    </div>
                                    <p className="text-sm font-medium text-gray-600 group-hover:text-emerald-700">Tap to add photo</p>
                                    <p className="text-xs text-gray-400 mt-1">JPG, PNG up to 5MB</p>
                                </div>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={e => {
                                        if (e.target.files && e.target.files[0]) {
                                            setImageFile(e.target.files[0]);
                                        }
                                    }}
                                />
                            </label>
                        )}
                    </div>

                    <button onClick={saveListing} disabled={savingListing} className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold text-lg shadow-lg mt-4 disabled:opacity-60 flex items-center justify-center gap-2">
                        {savingListing ? (
                            <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>
                        ) : (
                            isEdit ? t('update') : t('save')
                        )}
                    </button>
                </div>

                <LiveAssistant
                    systemInstruction={instruction}
                    initialMessage={t('tapToSpeak')}
                />
            </div>
        );
    }

    if (view === 'profile') {
        const saveProfile = () => {
            onUpdateUser({
                name: profileData.name,
                location: profileData.location,
                language: profileData.language
            });
            setView('home');
        };

        return (
            <div className="min-h-screen bg-gray-50 p-4 page-enter">
                <button onClick={() => setView('home')} className="mb-4 flex items-center text-gray-600 hover:text-emerald-600 press-scale transition-colors">
                    <ArrowLeft className="w-5 h-5 mr-1" /> Back
                </button>
                <h2 className="text-2xl font-bold mb-6 text-gray-800 animate-fade-in-up">{t('profile') || 'Profile'}</h2>

                <div className="bg-white p-6 rounded-xl shadow-sm space-y-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                    <div>
                        <label className="block text-sm text-gray-500 mb-1">Name</label>
                        <input
                            type="text"
                            value={profileData.name}
                            onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                            className="w-full p-3 border rounded-lg bg-gray-50 text-lg font-medium"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-500 mb-1">Location</label>
                        <input
                            type="text"
                            value={profileData.location}
                            onChange={(e) => setProfileData({ ...profileData, location: e.target.value })}
                            className="w-full p-3 border rounded-lg bg-gray-50 text-lg font-medium"
                            placeholder="e.g. Nashik, Maharashtra"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-500 mb-1">Language</label>
                        <LanguageDropdown
                            value={profileData.language}
                            onChange={(val) => setProfileData({ ...profileData, language: val as any })}
                            options={LANGUAGES}
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-500 mb-1">Phone (Cannot Change)</label>
                        <div className="w-full p-3 border rounded-lg bg-gray-100 text-gray-500">
                            {user.phone}
                        </div>
                    </div>
                    <button onClick={saveProfile} className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold text-lg shadow-lg mt-4 hover-glow press-scale btn-ripple">
                        Save Profile
                    </button>
                </div>
            </div>
        );
    }

    if (view === 'chat') {
        const item = inboxItems.find(i => i.partnerId === activeChat?.partnerId && i.listingId === activeChat?.listingId);
        const partnerName = item?.name || 'User';
        const productName = item?.listingName || 'General';

        const chatMessages = messages.filter(m =>
            ((m.senderId === user.id && m.receiverId === activeChat?.partnerId) ||
                (m.senderId === activeChat?.partnerId && m.receiverId === user.id)) &&
            // important: check listing ID match (handle nulls safely)
            (m.listingId === activeChat?.listingId || (!m.listingId && !activeChat?.listingId))
        );

        return (
            <div className="flex flex-col h-screen bg-gray-50 page-enter">
                <div className="bg-white p-4 shadow-sm flex items-center justify-between z-10 animate-fade-in-down">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setView('home')} className="press-scale"><ArrowLeft className="w-6 h-6 text-gray-600" /></button>
                        <div>
                            <span className="font-bold text-lg block">{partnerName}</span>
                            {productName && <span className="text-xs text-gray-500">{productName}</span>}
                        </div>
                    </div>
                    <a href={`tel:+910000000000`} className="bg-green-100 p-2 rounded-full text-green-700 hover:bg-green-200 press-scale transition-colors">
                        <Phone className="w-5 h-5" />
                    </a>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">
                    {chatMessages.length === 0 ? (
                        <div className="text-center text-gray-400 mt-10">No messages yet. Say Namaste!</div>
                    ) : (
                        chatMessages.map(m => (
                            <div key={m.id} className={`flex ${m.senderId === user.id ? 'justify-end msg-out' : 'justify-start msg-in'}`}>
                                <div className={`max-w-[80%] p-3 rounded-xl ${m.senderId === user.id ? 'bg-emerald-600 text-white' : 'bg-white border text-gray-800'}`}>
                                    {m.text}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="bg-white p-4 border-t flex gap-2 fixed bottom-0 w-full md:max-w-md">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder={t('typeMessage')}
                        className="flex-1 border rounded-full px-4 py-2 outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    />
                    <button onClick={sendMessage} className="bg-emerald-600 text-white p-2 rounded-full px-6 press-scale hover:bg-emerald-700 transition-colors">{t('send')}</button>
                </div>

                <LiveAssistant
                    systemInstruction="Help the farmer reply."
                    tools={tools}
                    onToolCall={handleToolCall}
                />
            </div>
        )
    }

    // --- Home View ---

    const systemInstruction = `
    You are an intelligent agricultural assistant for ${user.name}.
    You can help manage their inventory and communications.
    - To add a crop, ask for details and call create_listing.
    - To remove a crop, call delete_listing.
    - To change price/quantity, call update_listing.
    - To summarize inventory, call get_my_listings.
    - To check for orders/messages, call check_inbox.
    - To read messages, call read_latest_messages.
    - To reply to a buyer, call send_reply with the message content.
    - To update profile (name, location, language), call update_profile.
    Speak simply in ${user.language} or English mixed.
  `;

    return (
        <div className="min-h-screen bg-gray-50 pb-24">
            <header className="bg-emerald-700 text-white p-6 rounded-b-3xl shadow-lg mb-6 animate-fade-in-down">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold">{t('welcome')}, {user.name}</h1>
                        <p className="opacity-90">{t('roleFarmer')}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={() => { setProfileData({ name: user.name, location: user.location || '', language: user.language }); setView('profile'); }} className="bg-white/20 p-2 rounded-full hover:bg-white/30 press-scale transition-colors">
                            <UserIcon className="w-6 h-6" />
                        </button>
                        <div className="bg-white/20 p-2 rounded-full">
                            <Sprout className="w-6 h-6" />
                        </div>
                        <button
                            onClick={onLogout}
                            className="bg-red-500/20 p-2 rounded-full hover:bg-red-500/40 transition-colors"
                            aria-label="Logout"
                        >
                            <LogOut className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex bg-emerald-800/50 p-1 rounded-xl">
                    <button
                        onClick={() => setActiveTab('my_listings')}
                        className={`flex-1 py-2 rounded-lg font-medium transition-all press-scale ${activeTab === 'my_listings' ? 'bg-white text-emerald-800 shadow' : 'text-emerald-100 hover:bg-white/10'}`}
                    >
                        {t('myListings')}
                    </button>
                    <button
                        onClick={() => setActiveTab('inbox')}
                        className={`flex-1 py-2 rounded-lg font-medium transition-all press-scale ${activeTab === 'inbox' ? 'bg-white text-emerald-800 shadow' : 'text-emerald-100 hover:bg-white/10'}`}
                    >
                        {t('inbox')}
                    </button>
                </div>
            </header>

            <div className="p-4">
                {activeTab === 'my_listings' ? (
                    <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-6">
                        {myListings.length === 0 ? (
                            <div className="text-center py-10 text-gray-500 col-span-full">{t('noListings')}</div>
                        ) : (
                            myListings.map(listing => (
                                <div key={listing.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative group flex flex-col justify-between hover-lift animate-fade-in-up" style={{ animationDelay: `${myListings.indexOf(listing) * 0.07}s` }}>
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="text-lg font-bold text-gray-800">{listing.cropName}</h3>
                                        <div className="flex gap-2">
                                            <button onClick={() => startEdit(listing)} className="text-emerald-600 p-2 bg-emerald-50 rounded-full hover:bg-emerald-100 press-scale transition-colors">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => onDeleteListing(listing.id)} className="text-red-600 p-2 bg-red-50 rounded-full hover:bg-red-100 press-scale transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex gap-4 text-sm text-gray-600 mb-2">
                                        <span>{listing.quantity} kg</span>
                                        <span>•</span>
                                        <span>₹{listing.price}/kg</span>
                                    </div>
                                    <p className="text-xs text-gray-400 mb-2">{listing.location}</p>
                                    {(listing as any).image ? (
                                        <div className="mb-2">
                                            <img
                                                src={(listing as any).image.startsWith('http') ? (listing as any).image : `http://localhost:5000${(listing as any).image}`}
                                                alt="crop"
                                                className="w-full h-32 md:h-48 object-cover rounded-md transition-transform hover:scale-[1.02]"
                                            />
                                        </div>
                                    ) : (
                                        <div className="mb-2 w-full h-32 md:h-48 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-md flex flex-col items-center justify-center text-emerald-300">
                                            <span className="text-4xl">🌱</span>
                                            <p className="text-xs font-medium mt-1 text-emerald-600">No Image</p>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}

                        {/* Floating Add Button */}
                        <button
                            onClick={startCreate}
                            className="fixed bottom-28 right-6 bg-emerald-600 text-white w-14 h-14 rounded-full shadow-xl flex items-center justify-center hover:bg-emerald-700 z-40 hover-glow animate-bounce-in press-scale"
                        >
                            <Plus className="w-8 h-8" />
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {inboxItems.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                <p>{t('noListings').replace('Listings', 'Messages') || "No messages"}</p>
                            </div>
                        ) : (
                            inboxItems.map((item, idx) => (
                                <div key={idx} onClick={() => openChat(item)} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:bg-gray-50 hover-lift press-scale animate-fade-in-up" style={{ animationDelay: `${idx * 0.07}s` }}>
                                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold uppercase">
                                        {item.name.charAt(0)}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between">
                                            <h4 className="font-bold text-gray-800">{item.name}</h4>
                                            {item.listingName && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">{item.listingName}</span>}
                                        </div>
                                        <p className="text-sm text-gray-500 truncate">{item.lastMsg}</p>
                                    </div>
                                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                </div>
                            ))
                        )}

                    </div>
                )}
            </div>

            <LiveAssistant
                systemInstruction={systemInstruction}
                initialMessage={t('tapToSpeak')}
                tools={tools}
                onToolCall={handleToolCall}
            />
        </div>
    );
};

export default FarmerDashboard;